-- -----------------------------------------------------------------------------
-- Fix: create GIST index for get_map_pins that was missing from production
-- Root cause: 20260225113000 used status NOT IN (...) without ::text cast in
-- the partial index WHERE clause; PostgreSQL silently skipped creation when
-- venue_status is an enum.  Without this index the function does a full table
-- scan and hits the 5s statement_timeout (code 57014).
-- -----------------------------------------------------------------------------
SET statement_timeout = 0;
SET lock_timeout = '30s';

-- Drop stale versions (may or may not exist)
DROP INDEX IF EXISTS public.idx_venues_map_active_geom_gix;
DROP INDEX IF EXISTS public.idx_venues_map_active_visibility_name_idx;

-- Spatial GIST index — used by get_map_pins bbox filter
-- Predicate is location IS NOT NULL only: ::text cast on enum is not IMMUTABLE
-- so it cannot appear in index predicates.  Status filtering stays in the
-- function WHERE clause (cheap after the spatial filter narrows rows).
CREATE INDEX idx_venues_map_active_geom_gix
  ON public.venues USING gist ((location::geometry))
  WHERE location IS NOT NULL;

-- Covering sort index — ORDER BY visibility_score DESC, name ASC
CREATE INDEX idx_venues_map_active_visibility_name_idx
  ON public.venues (COALESCE(visibility_score, 0) DESC, name)
  WHERE location IS NOT NULL;

RESET lock_timeout;
RESET statement_timeout;
