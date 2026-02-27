-- -----------------------------------------------------------------------------
-- Fix get_map_pins 57014 Statement Timeout
-- The previous query bypassed the spatial GIST index by using an OR condition
-- falling back to latitude/longitude when location IS NULL.
-- Since 100% of venues have a location, we drop the slow fallback to force index usage.
-- -----------------------------------------------------------------------------

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
AS $$
DECLARE
  v_zoom int := COALESCE(p_zoom, 15);
  v_bbox geometry := st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      v.id,
      v.name,
      COALESCE(st_y(v.location::geometry), v.latitude) AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
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
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
      -- Force index scan using bounding box overlap
      AND v.location::geometry && v_bbox
      AND (
        v_zoom > 15
        OR (v_zoom < 13 AND ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type, '')) = 'giant'))
        OR (v_zoom BETWEEN 13 AND 15 AND (
          (v.giant_until IS NOT NULL AND v.giant_until > now())
          OR lower(COALESCE(v.pin_type, '')) = 'giant'
          OR (v.boost_until IS NOT NULL AND v.boost_until > now())
          OR COALESCE(v.visibility_score, 0) > 0
        ))
      )
  )
  SELECT
    c.id,
    c.name,
    c.lat,
    c.lng,
    CASE WHEN c.giant_active THEN 'giant' ELSE c.pin_type END AS pin_type,
    c.pin_metadata,
    c.visibility_score,
    c.is_verified,
    c.verified_active,
    c.glow_active,
    c.boost_active,
    c.giant_active,
    c.cover_image
  FROM candidates c
  ORDER BY
    CASE WHEN v_zoom <= 15 AND c.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN c.boost_active THEN 1 ELSE 0 END DESC,
    c.visibility_score DESC,
    c.name ASC
  LIMIT CASE
    WHEN v_zoom < 13 THEN 300
    WHEN v_zoom BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;
