-- =============================================================================
-- Migration: Fix Map Pins — Venues Columns + Shops View + get_map_pins RPC
-- Date: 2026-02-22
-- Purpose:
--   1. Add missing pin-related columns to public.venues (additive, idempotent)
--   2. Recreate public.shops view to expose ALL venues columns
--   3. Rewrite get_map_pins RPC to query venues directly with safe defaults
-- =============================================================================

BEGIN;

-- =========================================================================
-- PART 1: Add missing pin columns to public.venues
-- =========================================================================

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS pin_metadata      jsonb            DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility_score  integer          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_until    timestamptz,
  ADD COLUMN IF NOT EXISTS glow_until        timestamptz,
  ADD COLUMN IF NOT EXISTS boost_until       timestamptz,
  ADD COLUMN IF NOT EXISTS giant_until       timestamptz;

-- Indexes for pin queries (idempotent)
CREATE INDEX IF NOT EXISTS venues_visibility_score_idx ON public.venues (visibility_score DESC);
CREATE INDEX IF NOT EXISTS venues_verified_until_idx   ON public.venues (verified_until)  WHERE verified_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS venues_glow_until_idx       ON public.venues (glow_until)       WHERE glow_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS venues_boost_until_idx      ON public.venues (boost_until)      WHERE boost_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS venues_giant_until_idx      ON public.venues (giant_until)       WHERE giant_until IS NOT NULL;

-- Spatial index on venues.location (if not already present)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'venues'
      AND indexname   = 'venues_location_gix'
  ) THEN
    CREATE INDEX venues_location_gix ON public.venues USING gist (location);
  END IF;
END $$;


-- =========================================================================
-- PART 2: Recreate public.shops view → SELECT * FROM public.venues
-- =========================================================================

-- Only drop if it is a VIEW (not a TABLE) to protect legacy installs
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'shops' AND c.relkind = 'v'
  ) THEN
    DROP VIEW public.shops;
  END IF;
END $$;

-- (Re)create only if it doesn't already exist as a base table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'shops' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'CREATE VIEW public.shops AS SELECT * FROM public.venues';
    EXECUTE 'ALTER VIEW public.shops SET (security_invoker = true, security_barrier = true)';
  END IF;
END $$;


-- =========================================================================
-- PART 3: Rewrite get_map_pins RPC → query venues directly
-- =========================================================================

-- Drop old signatures to avoid overload conflicts with pin_type_enum return
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_map_pins'
  ) THEN
    DROP FUNCTION public.get_map_pins;
  END IF;
END $$;

CREATE FUNCTION public.get_map_pins(
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
  visibility_score int,
  is_verified      boolean,
  verified_active  boolean,
  glow_active      boolean,
  boost_active     boolean,
  giant_active     boolean,
  cover_image      text
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_envelope geometry;
BEGIN
  -- Pre-compute bounding box once
  v_envelope := st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);

  -- -----------------------------------------------------------------------
  -- Zoom < 13  →  Giant pins only
  -- -----------------------------------------------------------------------
  IF p_zoom < 13 THEN
    RETURN QUERY
      SELECT
        v.id,
        v.name,
        COALESCE(st_y(v.location::geometry), v.latitude)  AS lat,
        COALESCE(st_x(v.location::geometry), v.longitude)  AS lng,
        COALESCE(v.pin_type, 'normal')::text               AS pin_type,
        COALESCE(v.pin_metadata, '{}'::jsonb)               AS pin_metadata,
        COALESCE(v.visibility_score, 0)                     AS visibility_score,
        COALESCE(v.is_verified, false)                      AS is_verified,
        (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
        (v.glow_until     IS NOT NULL AND v.glow_until     > now()) AS glow_active,
        (v.boost_until    IS NOT NULL AND v.boost_until    > now()) AS boost_active,
        (v.giant_until    IS NOT NULL AND v.giant_until    > now()) AS giant_active,
        v.image_urls[1]                                     AS cover_image
      FROM public.venues v
      WHERE v.status = 'active'
        AND COALESCE(v.pin_type, 'normal') = 'giant'
        AND (
          -- Prefer spatial index on location
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_envelope))
          OR
          -- Fallback to lat/lng columns
          (v.location IS NULL AND v.latitude  BETWEEN p_min_lat AND p_max_lat
                               AND v.longitude BETWEEN p_min_lng AND p_max_lng)
        );

  -- -----------------------------------------------------------------------
  -- Zoom 13–15  →  Giant pins + boosted/visible pins (limit 120)
  -- -----------------------------------------------------------------------
  ELSIF p_zoom BETWEEN 13 AND 15 THEN
    RETURN QUERY
    (
      -- All giant pins in bounds
      SELECT
        v.id, v.name,
        COALESCE(st_y(v.location::geometry), v.latitude),
        COALESCE(st_x(v.location::geometry), v.longitude),
        COALESCE(v.pin_type, 'normal')::text,
        COALESCE(v.pin_metadata, '{}'::jsonb),
        COALESCE(v.visibility_score, 0),
        COALESCE(v.is_verified, false),
        (v.verified_until IS NOT NULL AND v.verified_until > now()),
        (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
        (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
        (v.giant_until    IS NOT NULL AND v.giant_until    > now()),
        v.image_urls[1]
      FROM public.venues v
      WHERE v.status = 'active'
        AND COALESCE(v.pin_type, 'normal') = 'giant'
        AND (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_envelope))
          OR
          (v.location IS NULL AND v.latitude  BETWEEN p_min_lat AND p_max_lat
                               AND v.longitude BETWEEN p_min_lng AND p_max_lng)
        )
    )
    UNION ALL
    (
      -- Boosted / high-visibility pins
      SELECT
        v.id, v.name,
        COALESCE(st_y(v.location::geometry), v.latitude),
        COALESCE(st_x(v.location::geometry), v.longitude),
        COALESCE(v.pin_type, 'normal')::text,
        COALESCE(v.pin_metadata, '{}'::jsonb),
        COALESCE(v.visibility_score, 0),
        COALESCE(v.is_verified, false),
        (v.verified_until IS NOT NULL AND v.verified_until > now()),
        (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
        (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
        (v.giant_until    IS NOT NULL AND v.giant_until    > now()),
        v.image_urls[1]
      FROM public.venues v
      WHERE v.status = 'active'
        AND COALESCE(v.pin_type, 'normal') <> 'giant'
        AND (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_envelope))
          OR
          (v.location IS NULL AND v.latitude  BETWEEN p_min_lat AND p_max_lat
                               AND v.longitude BETWEEN p_min_lng AND p_max_lng)
        )
        AND (
          (v.boost_until IS NOT NULL AND v.boost_until > now())
          OR COALESCE(v.visibility_score, 0) > 0
        )
      ORDER BY
        (CASE WHEN v.boost_until > now() THEN 999999
              ELSE COALESCE(v.visibility_score, 0) END) DESC
      LIMIT 120
    );

  -- -----------------------------------------------------------------------
  -- Zoom > 15  →  All active pins (limit 500)
  -- -----------------------------------------------------------------------
  ELSE
    RETURN QUERY
      SELECT
        v.id, v.name,
        COALESCE(st_y(v.location::geometry), v.latitude),
        COALESCE(st_x(v.location::geometry), v.longitude),
        COALESCE(v.pin_type, 'normal')::text,
        COALESCE(v.pin_metadata, '{}'::jsonb),
        COALESCE(v.visibility_score, 0),
        COALESCE(v.is_verified, false),
        (v.verified_until IS NOT NULL AND v.verified_until > now()),
        (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
        (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
        (v.giant_until    IS NOT NULL AND v.giant_until    > now()),
        v.image_urls[1]
      FROM public.venues v
      WHERE v.status = 'active'
        AND (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_envelope))
          OR
          (v.location IS NULL AND v.latitude  BETWEEN p_min_lat AND p_max_lat
                               AND v.longitude BETWEEN p_min_lng AND p_max_lng)
        )
      ORDER BY COALESCE(v.visibility_score, 0) DESC
      LIMIT LEAST(500, 1000);
  END IF;
END $fn$;

-- Grant execute to relevant roles
GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

COMMIT;
