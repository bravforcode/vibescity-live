-- -----------------------------------------------------------------------------
-- Ensure the correct GIST expression index exists for get_map_pins
-- Location column is geography(Point,4326); expression index on (location::geometry)
-- is used by WHERE v.location::geometry && geometry_bbox.
-- Also adds a helper diagnostic view (dropped after use) and ANALYZE.
-- -----------------------------------------------------------------------------
SET statement_timeout = 0;
SET lock_timeout = '60s';

-- Drop stale partial variants (kept non-partial idx_venues_location_gist)
DROP INDEX IF EXISTS public.idx_venues_location_geometry_gix;
DROP INDEX IF EXISTS public.idx_venues_map_active_geom_gix;
DROP INDEX IF EXISTS public.idx_venues_map_active_visibility_name_idx;

-- Ensure canonical GIST expression index exists (idempotent)
CREATE INDEX IF NOT EXISTS idx_venues_location_gist
  ON public.venues USING gist ((location::geometry));

-- Re-run ANALYZE so the planner uses fresh statistics for the index
ANALYZE public.venues;

RESET lock_timeout;
RESET statement_timeout;
