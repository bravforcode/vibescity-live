-- =============================================================================
-- OSM Spatial Index + Staleness Support
-- Purpose:
--   - Add GIST spatial index on venues.location for fast geo queries
--   - Add composite index for staleness detection (source + status + last_seen_at)
--   - Add index on category for filtered queries
-- =============================================================================

BEGIN;

-- Spatial index for ST_DWithin / ST_Distance / bounding-box queries
CREATE INDEX IF NOT EXISTS venues_location_gist_idx
  ON public.venues USING GIST (location);

-- Staleness detection: find OSM venues not seen recently
CREATE INDEX IF NOT EXISTS venues_osm_staleness_idx
  ON public.venues (source, status, last_seen_at)
  WHERE source = 'osm';

-- Category filtering (feeds, search, maps)
CREATE INDEX IF NOT EXISTS venues_category_idx
  ON public.venues (category)
  WHERE category IS NOT NULL;

-- Latitude/longitude for non-PostGIS queries
CREATE INDEX IF NOT EXISTS venues_lat_lon_idx
  ON public.venues (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;
