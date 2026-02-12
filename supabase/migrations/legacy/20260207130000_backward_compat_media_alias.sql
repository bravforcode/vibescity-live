-- Purpose:
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.promote_to_giant, public.get_feed_cards, public.get_map_pins, public.venues (image_urls, images), trigger public.trg_sync_venue_images
-- Risks (tier): High (function signatures), Medium (media column sync)
-- Rollback plan:
--   - DROP TRIGGER trg_sync_venue_images ON public.venues;
--   - DROP FUNCTION public.sync_venue_images();
--   - DROP FUNCTION public.get_feed_cards(double precision, double precision);
--   - DROP FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, integer);
--   - Recreate prior function bodies as needed

-- 0) Ensure enum exists for return types
DO $$ BEGIN
  CREATE TYPE pin_type_enum AS ENUM ('normal', 'giant');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 0b) Ensure lat/lng columns exist (avoid location dependency)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- 0c) Ensure entitlement columns exist (used by functions below)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS pin_type pin_type_enum NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS pin_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_until timestamptz,
  ADD COLUMN IF NOT EXISTS glow_until timestamptz,
  ADD COLUMN IF NOT EXISTS boost_until timestamptz,
  ADD COLUMN IF NOT EXISTS giant_until timestamptz,
  ADD COLUMN IF NOT EXISTS visibility_score integer NOT NULL DEFAULT 0;

-- 1) Fix promote_to_giant default (drop + recreate)
DROP FUNCTION IF EXISTS public.promote_to_giant(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.promote_to_giant(
  p_shop_id uuid,
  p_giant_category text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.venues
  SET
    pin_type = 'giant',
    pin_metadata = COALESCE(pin_metadata, '{}'::jsonb)
      || COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('giant_category', p_giant_category),
    giant_until = GREATEST(COALESCE(giant_until, NOW()), NOW()) + INTERVAL '30 days'
  WHERE id = p_shop_id;
END;
$$;

-- 2) Standardize media columns (canonical: image_urls)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}'::text[];

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}'::text[];

-- Backfill (idempotent)
UPDATE public.venues
SET image_urls = images
WHERE (image_urls IS NULL OR array_length(image_urls, 1) IS NULL)
  AND images IS NOT NULL
  AND array_length(images, 1) IS NOT NULL;

UPDATE public.venues
SET images = image_urls
WHERE (images IS NULL OR array_length(images, 1) IS NULL)
  AND image_urls IS NOT NULL
  AND array_length(image_urls, 1) IS NOT NULL;

-- Keep columns in sync (image_urls is canonical)
CREATE OR REPLACE FUNCTION public.sync_venue_images()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.image_urls IS NOT NULL THEN
    IF NEW.images IS DISTINCT FROM NEW.image_urls THEN
      NEW.images := NEW.image_urls;
    END IF;
  ELSIF NEW.images IS NOT NULL THEN
    NEW.image_urls := NEW.images;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_venue_images ON public.venues;
CREATE TRIGGER trg_sync_venue_images
BEFORE INSERT OR UPDATE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.sync_venue_images();

-- 3) Backward compatibility aliases (id as text)
DROP FUNCTION IF EXISTS public.get_feed_cards(double precision, double precision);
CREATE OR REPLACE FUNCTION public.get_feed_cards(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE (
  id text,
  name text,
  category text,
  distance_km double precision,
  pin_type pin_type_enum,
  pin_metadata jsonb,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  images text[],
  status text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.id::text AS id,
    v.name,
    v.category,
    ROUND(
      (ST_Distance(
        ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      ) / 1000.0)::numeric
    , 2)::double precision AS distance_km,
    CASE
      WHEN v.pin_type::text IN ('normal', 'giant') THEN v.pin_type::text::pin_type_enum
      ELSE 'normal'::pin_type_enum
    END AS pin_type,
    COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
    COALESCE(v.is_verified, false) AS is_verified,
    (v.verified_until IS NOT NULL AND v.verified_until > NOW()) AS verified_active,
    (v.glow_until IS NOT NULL AND v.glow_until > NOW()) AS glow_active,
    (v.boost_until IS NOT NULL AND v.boost_until > NOW()) AS boost_active,
    (v.giant_until IS NOT NULL AND v.giant_until > NOW()) AS giant_active,
    COALESCE(v.image_urls, v.images, '{}'::text[]) AS images,
    'active'::text AS status
  FROM public.venues v
  WHERE v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      20000
    )
  ORDER BY
    ST_Distance(
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) ASC
  LIMIT 30;
$$;

-- Cache-aware get_map_pins (alias signature)
DROP FUNCTION IF EXISTS public.get_map_pins(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
);

CREATE OR REPLACE FUNCTION public.get_map_pins(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom integer
)
RETURNS TABLE (
  id text,
  name text,
  lat double precision,
  lng double precision,
  pin_type text,
  pin_metadata jsonb,
  visibility_score integer,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_bucket smallint := CASE
    WHEN p_zoom < 13 THEN 12
    WHEN p_zoom < 15 THEN 14
    ELSE 16
  END;
  v_limit integer := CASE
    WHEN p_zoom < 13 THEN 120
    WHEN p_zoom < 15 THEN 320
    ELSE 1200
  END;
BEGIN
  RETURN QUERY
  SELECT
    c.venue_ref AS id,
    COALESCE(v.name, c.pin_metadata->>'name', c.venue_ref) AS name,
    c.lat,
    c.lng,
    COALESCE(c.pin_type, 'normal') AS pin_type,
    COALESCE(c.pin_metadata, '{}'::jsonb) AS pin_metadata,
    COALESCE(c.visibility_score, 0) AS visibility_score,
    COALESCE(v.is_verified, false) AS is_verified,
    COALESCE(c.verified_active, false) AS verified_active,
    COALESCE(c.glow_active, false) AS glow_active,
    COALESCE(c.boost_active, false) AS boost_active,
    COALESCE(c.giant_active, false) AS giant_active
  FROM public.map_pins_zoom_cache c
  LEFT JOIN public.venues v ON v.id::text = c.venue_ref
  WHERE c.zoom_bucket = v_bucket
    AND c.refreshed_at > NOW() - INTERVAL '30 minutes'
    AND c.lat BETWEEN p_min_lat AND p_max_lat
    AND c.lng BETWEEN p_min_lng AND p_max_lng
  ORDER BY c.priority_score DESC, c.visibility_score DESC
  LIMIT v_limit;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v.id::text AS id,
    v.name,
    v.latitude::double precision AS lat,
    v.longitude::double precision AS lng,
    COALESCE(v.pin_type::text, 'normal') AS pin_type,
    COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
    COALESCE(v.visibility_score, 0) AS visibility_score,
    COALESCE(v.is_verified, false) AS is_verified,
    (v.verified_until IS NOT NULL AND v.verified_until > NOW()) AS verified_active,
    (v.glow_until IS NOT NULL AND v.glow_until > NOW()) AS glow_active,
    (v.boost_until IS NOT NULL AND v.boost_until > NOW()) AS boost_active,
    (v.giant_until IS NOT NULL AND v.giant_until > NOW()) AS giant_active
  FROM public.venues v
  WHERE v.latitude BETWEEN p_min_lat AND p_max_lat
    AND v.longitude BETWEEN p_min_lng AND p_max_lng
  ORDER BY
    (
      COALESCE(v.visibility_score, 0)
      + CASE WHEN v.boost_until > NOW() THEN 100 ELSE 0 END
      + CASE WHEN v.giant_until > NOW() THEN 160 ELSE 0 END
    ) DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_cards(double precision, double precision)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_map_pins(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) TO anon, authenticated, service_role;
