-- -----------------------------------------------------------------------------
-- Hotfix: re-create get_map_pins with explicit ::text cast on status/pin_type
-- Root cause: venue_status enum type exists in DB (from partial migration),
--   causing lower(COALESCE(v.status, 'active')) to fail at runtime.
-- Fix: cast every enum-susceptible column to ::text before comparison.
-- Also reverts to simpler single-branch plpgsql (avoids CTE UNION ALL timeout).
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_map_pins(double precision, double precision, double precision, double precision, int);

CREATE OR REPLACE FUNCTION public.get_map_pins(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom    int
)
RETURNS TABLE (
  id               uuid,
  name             text,
  lat              double precision,
  lng              double precision,
  pin_type         text,
  pin_metadata     jsonb,
  visibility_score integer,
  is_verified      boolean,
  verified_active  boolean,
  glow_active      boolean,
  boost_active     boolean,
  giant_active     boolean,
  cover_image      text
)
LANGUAGE plpgsql
STABLE
SET statement_timeout = '5s'
AS $$
DECLARE
  v_zoom int      := COALESCE(p_zoom, 15);
  v_bbox geometry := ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.name,
    ST_Y(v.location::geometry)::double precision AS lat,
    ST_X(v.location::geometry)::double precision AS lng,
    CASE
      WHEN (v.giant_until IS NOT NULL AND v.giant_until > now())
           OR lower(COALESCE(v.pin_type::text, '')) = 'giant'
      THEN 'giant'::text
      ELSE 'normal'::text
    END                                                                         AS pin_type,
    COALESCE(v.pin_metadata, '{}'::jsonb)                                       AS pin_metadata,
    COALESCE(v.visibility_score, 0)                                             AS visibility_score,
    COALESCE(v.is_verified, false)                                              AS is_verified,
    (v.verified_until IS NOT NULL AND v.verified_until > now())                 AS verified_active,
    (v.glow_until     IS NOT NULL AND v.glow_until     > now())                 AS glow_active,
    (v.boost_until    IS NOT NULL AND v.boost_until    > now())                 AS boost_active,
    ((v.giant_until IS NOT NULL AND v.giant_until > now())
      OR lower(COALESCE(v.pin_type::text, '')) = 'giant')                       AS giant_active,
    COALESCE(v.image_urls[1], v."Image_URL1")                                   AS cover_image
  FROM public.venues v
  WHERE v.location IS NOT NULL
    -- hits idx_venues_location_geometry_gix expression index
    AND v.location::geometry && v_bbox
    -- ::text cast works for both text and venue_status enum columns
    AND lower(COALESCE(v.status::text, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
    AND (
      v_zoom > 15
      OR (v_zoom < 13 AND (
            (v.giant_until IS NOT NULL AND v.giant_until > now())
            OR lower(COALESCE(v.pin_type::text, '')) = 'giant'
          ))
      OR (v_zoom BETWEEN 13 AND 15 AND (
            (v.giant_until IS NOT NULL AND v.giant_until > now())
            OR lower(COALESCE(v.pin_type::text, '')) = 'giant'
            OR (v.boost_until IS NOT NULL AND v.boost_until > now())
            OR COALESCE(v.visibility_score, 0) > 0
          ))
    )
  ORDER BY
    CASE WHEN v_zoom <= 15
              AND ((v.giant_until IS NOT NULL AND v.giant_until > now())
                   OR lower(COALESCE(v.pin_type::text, '')) = 'giant')
         THEN 1 ELSE 0 END DESC,
    CASE WHEN v.boost_until IS NOT NULL AND v.boost_until > now()
         THEN 1 ELSE 0 END DESC,
    COALESCE(v.visibility_score, 0) DESC,
    v.name ASC
  LIMIT CASE
    WHEN v_zoom < 13             THEN 300
    WHEN v_zoom BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;
