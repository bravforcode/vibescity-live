-- =============================================================================
-- Fix: get_map_pins 500 (57014 statement timeout) — GIST index rebuild
--
-- Root cause: The GIST expression index on venues.location::geometry is either
-- missing or not being used by the planner. Every call to get_map_pins triggers
-- a full sequential scan on venues, which exceeds the 5s statement_timeout.
--
-- Fix:
--   1. Drop and recreate all GIST indexes on venues.location
--   2. ANALYZE venues so the planner picks up the new index
--   3. Increase function statement_timeout from 5s → 30s
-- =============================================================================
SET statement_timeout = 0;
SET lock_timeout = '30s';

-- Step 1: Drop old GIST indexes (may exist under various names)
DROP INDEX IF EXISTS idx_venues_location_gist;
DROP INDEX IF EXISTS idx_venues_location_geom_gist;
DROP INDEX IF EXISTS venues_location_gist_idx;
DROP INDEX IF EXISTS venues_location_geom_gist;

-- Step 2: Create the correct GIST expression index
-- The function casts location::geometry, so the index must match that expression
CREATE INDEX IF NOT EXISTS idx_venues_location_geom_gist
  ON public.venues
  USING gist ((location::geometry));

-- Step 3: Also create a plain geography GIST index as backup
CREATE INDEX IF NOT EXISTS idx_venues_location_gist
  ON public.venues
  USING gist (location);

-- Step 4: Refresh planner statistics
ANALYZE public.venues;

-- Step 5: Rebuild get_map_pins with relaxed timeout (30s instead of 5s)
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
SET statement_timeout = '30s'
AS $$
DECLARE
  v_zoom int      := COALESCE(p_zoom, 15);
  v_bbox geometry := ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);
BEGIN

  -- ── Low zoom: giants only ─────────────────────────────────────────────────
  IF v_zoom < 13 THEN
    RETURN QUERY
    SELECT
      v.id, v.name,
      ST_Y(v.location::geometry)::double precision,
      ST_X(v.location::geometry)::double precision,
      'giant'::text,
      COALESCE(v.pin_metadata, '{}'::jsonb),
      COALESCE(v.visibility_score, 0),
      COALESCE(v.is_verified, false),
      (v.verified_until IS NOT NULL AND v.verified_until > now()),
      (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
      (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
      true,
      COALESCE(v.image_urls[1], v."Image_URL1")
    FROM public.venues v
    WHERE v.location IS NOT NULL
      AND v.location::geometry && v_bbox
      AND (v.status IS NULL OR v.status::text NOT IN ('off','inactive','disabled','deleted'))
      AND (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type::text,'')) = 'giant'
      )
    ORDER BY
      CASE WHEN v.boost_until IS NOT NULL AND v.boost_until > now() THEN 1 ELSE 0 END DESC,
      COALESCE(v.visibility_score, 0) DESC,
      v.name ASC
    LIMIT 300;
    RETURN;
  END IF;

  -- ── Mid zoom: giants + boosted + scored ───────────────────────────────────
  IF v_zoom <= 15 THEN
    RETURN QUERY
    SELECT
      v.id, v.name,
      ST_Y(v.location::geometry)::double precision,
      ST_X(v.location::geometry)::double precision,
      CASE
        WHEN (v.giant_until IS NOT NULL AND v.giant_until > now())
             OR lower(COALESCE(v.pin_type::text,'')) = 'giant'
        THEN 'giant'::text
        ELSE 'normal'::text
      END,
      COALESCE(v.pin_metadata, '{}'::jsonb),
      COALESCE(v.visibility_score, 0),
      COALESCE(v.is_verified, false),
      (v.verified_until IS NOT NULL AND v.verified_until > now()),
      (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
      (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
      ((v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type::text,'')) = 'giant'),
      COALESCE(v.image_urls[1], v."Image_URL1")
    FROM public.venues v
    WHERE v.location IS NOT NULL
      AND v.location::geometry && v_bbox
      AND (v.status IS NULL OR v.status::text NOT IN ('off','inactive','disabled','deleted'))
      AND (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type::text,'')) = 'giant'
        OR (v.boost_until IS NOT NULL AND v.boost_until > now())
        OR COALESCE(v.visibility_score, 0) > 0
      )
    ORDER BY
      CASE WHEN (v.giant_until IS NOT NULL AND v.giant_until > now())
                OR lower(COALESCE(v.pin_type::text,'')) = 'giant'
           THEN 1 ELSE 0 END DESC,
      CASE WHEN v.boost_until IS NOT NULL AND v.boost_until > now() THEN 1 ELSE 0 END DESC,
      COALESCE(v.visibility_score, 0) DESC,
      v.name ASC
    LIMIT 500;
    RETURN;
  END IF;

  -- ── High zoom: all active venues ─────────────────────────────────────────
  RETURN QUERY
  SELECT
    v.id, v.name,
    ST_Y(v.location::geometry)::double precision,
    ST_X(v.location::geometry)::double precision,
    CASE
      WHEN (v.giant_until IS NOT NULL AND v.giant_until > now())
           OR lower(COALESCE(v.pin_type::text,'')) = 'giant'
      THEN 'giant'::text
      ELSE 'normal'::text
    END,
    COALESCE(v.pin_metadata, '{}'::jsonb),
    COALESCE(v.visibility_score, 0),
    COALESCE(v.is_verified, false),
    (v.verified_until IS NOT NULL AND v.verified_until > now()),
    (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
    (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
    ((v.giant_until IS NOT NULL AND v.giant_until > now())
      OR lower(COALESCE(v.pin_type::text,'')) = 'giant'),
    COALESCE(v.image_urls[1], v."Image_URL1")
  FROM public.venues v
  WHERE v.location IS NOT NULL
    AND v.location::geometry && v_bbox
    AND (v.status IS NULL OR v.status::text NOT IN ('off','inactive','disabled','deleted'))
  ORDER BY
    CASE WHEN (v.giant_until IS NOT NULL AND v.giant_until > now())
              OR lower(COALESCE(v.pin_type::text,'')) = 'giant'
         THEN 1 ELSE 0 END DESC,
    CASE WHEN v.boost_until IS NOT NULL AND v.boost_until > now() THEN 1 ELSE 0 END DESC,
    COALESCE(v.visibility_score, 0) DESC,
    v.name ASC
  LIMIT 1000;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

RESET lock_timeout;
RESET statement_timeout;
