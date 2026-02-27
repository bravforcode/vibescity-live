-- -----------------------------------------------------------------------------
-- Fix get_map_pins 57014 Statement Timeout (v3)
-- Root cause: OR fallback for NULL location prevented index usage + casting
-- to geography type didn't match the expression index.
-- Fix: use expression-index-friendly  location::geometry && geometry_bbox ,
--      drop the NULL-location OR branch (100% venues have location),
--      and add a statement_timeout safety net.
-- Requires: idx_venues_location_geometry_gix ON venues USING gist ((location::geometry))
-- -----------------------------------------------------------------------------

-- Ensure the expression index exists (idempotent)
CREATE INDEX IF NOT EXISTS idx_venues_location_geometry_gix
  ON public.venues USING gist ((location::geometry));

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
LANGUAGE plpgsql
STABLE
SET statement_timeout = '4s'
AS $$
DECLARE
  v_zoom int := COALESCE(p_zoom, 15);
  v_bbox geometry := st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.name,
    st_y(v.location::geometry) AS lat,
    st_x(v.location::geometry) AS lng,
    CASE
      WHEN (v.giant_until IS NOT NULL AND v.giant_until > now())
           OR lower(COALESCE(v.pin_type, '')) = 'giant'
      THEN 'giant'
      ELSE 'normal'
    END AS pin_type,
    COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
    COALESCE(v.visibility_score, 0) AS visibility_score,
    COALESCE(v.is_verified, false) AS is_verified,
    (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
    (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
    (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
    ((v.giant_until IS NOT NULL AND v.giant_until > now())
      OR lower(COALESCE(v.pin_type, '')) = 'giant') AS giant_active,
    COALESCE(v.image_urls[1], v."Image_URL1") AS cover_image
  FROM public.venues v
  WHERE v.location IS NOT NULL
    -- Uses expression index idx_venues_location_geometry_gix
    AND v.location::geometry && v_bbox
    AND lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
    AND (
      v_zoom > 15
      OR (v_zoom < 13 AND (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type, '')) = 'giant'
      ))
      OR (v_zoom BETWEEN 13 AND 15 AND (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type, '')) = 'giant'
        OR (v.boost_until IS NOT NULL AND v.boost_until > now())
        OR COALESCE(v.visibility_score, 0) > 0
      ))
    )
  ORDER BY
    CASE WHEN v_zoom <= 15
              AND ((v.giant_until IS NOT NULL AND v.giant_until > now())
                   OR lower(COALESCE(v.pin_type, '')) = 'giant')
         THEN 1 ELSE 0 END DESC,
    CASE WHEN v.boost_until IS NOT NULL AND v.boost_until > now()
         THEN 1 ELSE 0 END DESC,
    COALESCE(v.visibility_score, 0) DESC,
    v.name ASC
  LIMIT CASE
    WHEN v_zoom < 13 THEN 300
    WHEN v_zoom BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;
