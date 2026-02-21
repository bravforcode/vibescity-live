-- =============================================================================
-- PHASE 2: PostGIS Geography Column + Sync Trigger
-- =============================================================================
-- Purpose: Add a proper geography(Point, 4326) column to venues, backfill
--          from lat/lng, and keep both in sync via trigger. Adds GIST index.
-- Safety:  Fully idempotent. Trigger handles both directions of sync.
-- Rollback: See bottom of file.
-- =============================================================================

BEGIN;

-- ─── 2a) Ensure PostGIS extension ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─── 2b) Add geography column if missing ────────────────────────────────────
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

-- ─── 2c) Backfill from existing lat/lng ─────────────────────────────────────
UPDATE public.venues
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND location IS NULL;

-- ─── 2d) Bidirectional sync trigger ─────────────────────────────────────────
-- Priority: location → lat/lng when location changes
--           lat/lng → location when only lat/lng changes

CREATE OR REPLACE FUNCTION public.sync_venue_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Case 1: location column was explicitly set
  IF NEW.location IS NOT NULL AND (
    TG_OP = 'INSERT' OR
    OLD.location IS DISTINCT FROM NEW.location
  ) THEN
    NEW.latitude  := ST_Y(NEW.location::geometry);
    NEW.longitude := ST_X(NEW.location::geometry);

  -- Case 2: lat/lng changed, derive location
  ELSIF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL AND (
    TG_OP = 'INSERT' OR
    OLD.latitude IS DISTINCT FROM NEW.latitude OR
    OLD.longitude IS DISTINCT FROM NEW.longitude
  ) THEN
    NEW.location := ST_SetSRID(
      ST_MakePoint(NEW.longitude, NEW.latitude), 4326
    )::geography;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_venue_location ON public.venues;
CREATE TRIGGER trg_sync_venue_location
BEFORE INSERT OR UPDATE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.sync_venue_location();

-- ─── 2e) Spatial indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_venues_location_gist
  ON public.venues USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_venues_h3_cell
  ON public.venues (h3_cell)
  WHERE h3_cell IS NOT NULL;

-- ─── 2f) Add composite index for category + location queries ────────────────
CREATE INDEX IF NOT EXISTS idx_venues_category_location
  ON public.venues (category)
  WHERE location IS NOT NULL;

COMMIT;

-- =============================================================================
-- ROLLBACK PLAN:
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_sync_venue_location ON public.venues;
-- DROP FUNCTION IF EXISTS public.sync_venue_location();
-- DROP INDEX IF EXISTS idx_venues_location_gist;
-- DROP INDEX IF EXISTS idx_venues_h3_cell;
-- DROP INDEX IF EXISTS idx_venues_category_location;
-- ALTER TABLE public.venues DROP COLUMN IF EXISTS location;
