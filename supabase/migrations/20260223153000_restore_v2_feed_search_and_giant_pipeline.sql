-- =============================================================================
-- Migration: Restore V2 Feed/Search + Giant Pipeline (Timeout-Safe)
-- Date: 2026-02-23
-- Notes:
--   - Designed for SQL Editor execution without long-running bulk updates.
--   - Avoids full-table rewrite/backfill operations.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Ensure required columns exist (additive, idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS pin_type text,
  ADD COLUMN IF NOT EXISTS pin_metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_until timestamptz,
  ADD COLUMN IF NOT EXISTS glow_until timestamptz,
  ADD COLUMN IF NOT EXISTS boost_until timestamptz,
  ADD COLUMN IF NOT EXISTS giant_until timestamptz;

CREATE INDEX IF NOT EXISTS venues_pin_type_idx ON public.venues(pin_type);
CREATE INDEX IF NOT EXISTS venues_visibility_score_idx ON public.venues(visibility_score DESC);
CREATE INDEX IF NOT EXISTS venues_giant_until_idx ON public.venues(giant_until) WHERE giant_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS venues_boost_until_idx ON public.venues(boost_until) WHERE boost_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Restore get_map_pins with computed giant fallback (no backfill needed)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_map_pins(double precision, double precision, double precision, double precision, int);

CREATE OR REPLACE FUNCTION public.get_map_pins(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom int
)
RETURNS TABLE (
  id uuid,
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
  giant_active boolean,
  cover_image text
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      v.id,
      v.name,
      COALESCE(st_y(v.location::geometry), v.latitude) AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
      CASE
        WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant'
        ELSE 'normal'
      END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      COALESCE(v.visibility_score, 0) AS visibility_score,
      COALESCE(v.is_verified, false) AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type, '')) = 'giant'
        OR lower(COALESCE(v.category, '')) LIKE ANY (ARRAY['%mall%', '%shopping%', '%department%', '%plaza%', '%community%'])
        OR lower(COALESCE(v.name, '')) LIKE ANY (ARRAY['%mall%', '%shopping%', '%plaza%'])
      ) AS giant_active,
      COALESCE(v.image_urls[1], v."Image_URL1") AS cover_image
    FROM public.venues v
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
  )
  SELECT
    b.id,
    b.name,
    b.lat,
    b.lng,
    CASE WHEN b.giant_active THEN 'giant' ELSE b.pin_type END AS pin_type,
    b.pin_metadata,
    b.visibility_score,
    b.is_verified,
    b.verified_active,
    b.glow_active,
    b.boost_active,
    b.giant_active,
    b.cover_image
  FROM base b
  WHERE b.lat IS NOT NULL
    AND b.lng IS NOT NULL
    AND b.lat BETWEEN p_min_lat AND p_max_lat
    AND b.lng BETWEEN p_min_lng AND p_max_lng
    AND (
      (COALESCE(p_zoom, 15) < 13 AND b.giant_active)
      OR (COALESCE(p_zoom, 15) BETWEEN 13 AND 15 AND (b.giant_active OR b.boost_active OR b.visibility_score > 0))
      OR (COALESCE(p_zoom, 15) > 15)
    )
  ORDER BY
    CASE WHEN b.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN b.boost_active THEN 1 ELSE 0 END DESC,
    b.visibility_score DESC,
    b.name ASC
  LIMIT CASE
    WHEN COALESCE(p_zoom, 15) < 13 THEN 300
    WHEN COALESCE(p_zoom, 15) BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Restore get_feed_cards_v2 (frontend signature)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_feed_cards_v2(double precision, double precision, integer);
DROP FUNCTION IF EXISTS public.get_feed_cards_v2(double precision, double precision, integer, integer);

CREATE OR REPLACE FUNCTION public.get_feed_cards_v2(
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  category text,
  status text,
  image_url text,
  rating numeric,
  view_count bigint,
  distance_meters double precision,
  lat double precision,
  lng double precision,
  pin_type text,
  pin_metadata jsonb,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  visibility_score integer,
  is_promoted boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      v.id,
      v.name,
      NULLIF(v.slug, '') AS slug,
      v.category,
      v.status,
      COALESCE(v.image_urls[1], v."Image_URL1") AS image_url,
      COALESCE(v.rating, 0)::numeric AS rating,
      COALESCE(v.total_views, v.view_count, 0)::bigint AS view_count,
      COALESCE(st_y(v.location::geometry), v.latitude) AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
      CASE
        WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant'
        ELSE 'normal'
      END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type, '')) = 'giant'
        OR lower(COALESCE(v.category, '')) LIKE ANY (ARRAY['%mall%', '%shopping%', '%department%', '%plaza%', '%community%'])
        OR lower(COALESCE(v.name, '')) LIKE ANY (ARRAY['%mall%', '%shopping%', '%plaza%'])
      ) AS giant_active,
      COALESCE(v.visibility_score, 0) AS visibility_score
    FROM public.venues v
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
  )
  SELECT
    b.id,
    b.name,
    b.slug,
    b.category,
    b.status,
    b.image_url,
    b.rating,
    b.view_count,
    CASE
      WHEN b.lat IS NULL OR b.lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN NULL
      ELSE st_distance(
        st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      )
    END AS distance_meters,
    b.lat,
    b.lng,
    CASE WHEN b.giant_active THEN 'giant' ELSE b.pin_type END AS pin_type,
    b.pin_metadata,
    b.verified_active,
    b.glow_active,
    b.boost_active,
    b.giant_active,
    b.visibility_score,
    (
      b.boost_active
      OR b.giant_active
      OR b.visibility_score > 0
      OR lower(COALESCE(b.pin_metadata ->> 'is_promoted', '')) IN ('true', '1', 'yes', 'y')
    ) AS is_promoted
  FROM base b
  WHERE b.lat BETWEEN 5.0 AND 21.0
    AND b.lng BETWEEN 97.0 AND 106.5
  ORDER BY
    CASE WHEN b.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN (
      b.boost_active OR b.visibility_score > 0
      OR lower(COALESCE(b.pin_metadata ->> 'is_promoted', '')) IN ('true', '1', 'yes', 'y')
    ) THEN 1 ELSE 0 END DESC,
    CASE WHEN upper(COALESCE(b.status, '')) = 'LIVE' THEN 1 ELSE 0 END DESC,
    distance_meters ASC NULLS LAST,
    b.view_count DESC,
    b.name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_cards_v2(double precision, double precision, integer, integer)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Restore search_venues_v2 (frontend signature)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_venues_v2(text, integer);
DROP FUNCTION IF EXISTS public.search_venues_v2(text, double precision, double precision, integer, integer);
DROP FUNCTION IF EXISTS public.search_venues_v2(text, double precision, double precision, double precision, integer, integer);

CREATE OR REPLACE FUNCTION public.search_venues_v2(
  p_query text,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  category text,
  status text,
  image_url text,
  floor text,
  zone text,
  rating numeric,
  view_count bigint,
  highlight_snippet text,
  distance_meters double precision,
  lat double precision,
  lng double precision,
  pin_type text,
  giant_active boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      v.id,
      v.name,
      NULLIF(v.slug, '') AS slug,
      v.category,
      v.status,
      COALESCE(v.image_urls[1], v."Image_URL1") AS image_url,
      COALESCE(NULLIF(to_jsonb(v) ->> 'floor', ''), NULLIF(to_jsonb(v) ->> 'Floor', '')) AS floor,
      COALESCE(NULLIF(to_jsonb(v) ->> 'zone', ''), NULLIF(to_jsonb(v) ->> 'Zone', ''), NULLIF(to_jsonb(v) ->> 'district', '')) AS zone,
      COALESCE(v.rating, 0)::numeric AS rating,
      COALESCE(v.total_views, v.view_count, 0)::bigint AS view_count,
      COALESCE(st_y(v.location::geometry), v.latitude) AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
      CASE
        WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant'
        ELSE 'normal'
      END AS pin_type,
      (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type, '')) = 'giant'
        OR lower(COALESCE(v.category, '')) LIKE ANY (ARRAY['%mall%', '%shopping%', '%department%', '%plaza%', '%community%'])
        OR lower(COALESCE(v.name, '')) LIKE ANY (ARRAY['%mall%', '%shopping%', '%plaza%'])
      ) AS giant_active,
      trim(COALESCE(p_query, '')) AS query_text
    FROM public.venues v
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
  )
  SELECT
    b.id,
    b.name,
    b.slug,
    b.category,
    b.status,
    b.image_url,
    b.floor,
    b.zone,
    b.rating,
    b.view_count,
    b.name AS highlight_snippet,
    CASE
      WHEN b.lat IS NULL OR b.lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN NULL
      ELSE st_distance(
        st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      )
    END AS distance_meters,
    b.lat,
    b.lng,
    CASE WHEN b.giant_active THEN 'giant' ELSE b.pin_type END AS pin_type,
    b.giant_active
  FROM base b
  WHERE b.query_text <> ''
    AND b.lat BETWEEN 5.0 AND 21.0
    AND b.lng BETWEEN 97.0 AND 106.5
    AND (
      b.name ILIKE '%' || b.query_text || '%'
      OR b.category ILIKE '%' || b.query_text || '%'
      OR COALESCE(b.zone, '') ILIKE '%' || b.query_text || '%'
      OR COALESCE(b.floor, '') ILIKE '%' || b.query_text || '%'
    )
  ORDER BY
    CASE WHEN b.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN b.name ILIKE b.query_text || '%' THEN 1 ELSE 0 END DESC,
    distance_meters ASC NULLS LAST,
    b.view_count DESC,
    b.name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.search_venues_v2(text, double precision, double precision, integer, integer)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Restore promote_to_giant RPC used by adminService
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.promote_to_giant(bigint, text, jsonb);
DROP FUNCTION IF EXISTS public.promote_to_giant(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.promote_to_giant(
  p_shop_id uuid,
  p_giant_category text DEFAULT 'default',
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
    giant_until = GREATEST(COALESCE(giant_until, now()), now()) + interval '30 days',
    visibility_score = GREATEST(COALESCE(visibility_score, 0), 120),
    pin_metadata = COALESCE(pin_metadata, '{}'::jsonb)
      || jsonb_build_object('giant_category', COALESCE(p_giant_category, 'default'))
      || COALESCE(p_metadata, '{}'::jsonb),
    updated_at = now()
  WHERE id = p_shop_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_to_giant(uuid, text, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Ensure v2 flags are on (if flag tables exist)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feature_flags'
  ) THEN
    UPDATE public.feature_flags
    SET enabled = true
    WHERE key IN ('use_v2_feed', 'use_v2_search');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feature_flags_public'
  ) THEN
    UPDATE public.feature_flags_public
    SET enabled = true
    WHERE key IN ('use_v2_feed', 'use_v2_search');
  END IF;
END
$$;

COMMIT;
