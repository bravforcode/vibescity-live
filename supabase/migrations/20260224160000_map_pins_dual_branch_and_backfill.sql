-- -----------------------------------------------------------------------------
-- Map pins stability: dual branch query + lat/lng backfill + index hardening
-- -----------------------------------------------------------------------------

BEGIN;

CREATE INDEX IF NOT EXISTS idx_venues_location_geometry_gix
  ON public.venues USING gist ((location::geometry));

CREATE INDEX IF NOT EXISTS idx_venues_lat_lng_when_location_null
  ON public.venues (latitude, longitude)
  WHERE location IS NULL;

CREATE INDEX IF NOT EXISTS idx_venues_status_lower_map
  ON public.venues ((lower(COALESCE(status, 'active'))));

UPDATE public.venues
SET latitude = ST_Y(location::geometry)
WHERE location IS NOT NULL
  AND latitude IS NULL;

UPDATE public.venues
SET longitude = ST_X(location::geometry)
WHERE location IS NOT NULL
  AND longitude IS NULL;

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
SET statement_timeout = '4s'
AS $$
  WITH params AS (
    SELECT
      COALESCE(p_zoom, 15) AS zoom_level,
      ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326) AS bbox
  ),
  candidates AS (
    SELECT
      v.id,
      v.name,
      ST_Y(v.location::geometry) AS lat,
      ST_X(v.location::geometry) AS lng,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      COALESCE(v.visibility_score, 0) AS visibility_score,
      COALESCE(v.is_verified, false) AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type, '')) = 'giant') AS giant_active,
      COALESCE(v.image_urls[1], v."Image_URL1") AS cover_image
    FROM public.venues v
    CROSS JOIN params p
    WHERE v.location IS NOT NULL
      AND v.location::geometry && p.bbox
      AND lower(COALESCE(v.status, 'active')) IN ('active', 'live')

    UNION ALL

    SELECT
      v.id,
      v.name,
      v.latitude AS lat,
      v.longitude AS lng,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      COALESCE(v.visibility_score, 0) AS visibility_score,
      COALESCE(v.is_verified, false) AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type, '')) = 'giant') AS giant_active,
      COALESCE(v.image_urls[1], v."Image_URL1") AS cover_image
    FROM public.venues v
    CROSS JOIN params p
    WHERE v.location IS NULL
      AND v.latitude BETWEEN p_min_lat AND p_max_lat
      AND v.longitude BETWEEN p_min_lng AND p_max_lng
      AND lower(COALESCE(v.status, 'active')) IN ('active', 'live')
  ),
  filtered AS (
    SELECT c.*, p.zoom_level
    FROM candidates c
    CROSS JOIN params p
    WHERE c.lat IS NOT NULL
      AND c.lng IS NOT NULL
      AND (
        (p.zoom_level < 13 AND c.giant_active)
        OR (p.zoom_level BETWEEN 13 AND 15 AND (c.giant_active OR c.boost_active OR c.visibility_score > 0))
        OR (p.zoom_level > 15)
      )
  )
  SELECT
    f.id,
    f.name,
    f.lat,
    f.lng,
    CASE WHEN f.giant_active THEN 'giant' ELSE f.pin_type END AS pin_type,
    f.pin_metadata,
    f.visibility_score,
    f.is_verified,
    f.verified_active,
    f.glow_active,
    f.boost_active,
    f.giant_active,
    f.cover_image
  FROM filtered f
  ORDER BY
    CASE WHEN f.zoom_level <= 15 AND f.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN f.boost_active THEN 1 ELSE 0 END DESC,
    f.visibility_score DESC,
    f.name ASC
  LIMIT CASE
    WHEN (SELECT zoom_level FROM params) < 13 THEN 300
    WHEN (SELECT zoom_level FROM params) BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

COMMIT;
