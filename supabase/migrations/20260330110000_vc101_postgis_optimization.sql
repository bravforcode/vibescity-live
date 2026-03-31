-- Migration: VC-101 PostGIS Geodata Optimization
-- Description: Create Materialized View for static venue geodata to reduce tile generation latency.

BEGIN;

-- 1. Create the Materialized View
-- This combines venue metadata with spatial coordinates for fast retrieval
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_venue_geodata AS
SELECT 
    v.id,
    v.name,
    v.slug,
    v.category,
    v.status,
    v.pin_type,
    v.is_verified,
    v.latitude,
    v.longitude,
    v.location, -- Assuming PostGIS geometry column
    v.storefront_image_url,
    COALESCE(v.rating, 0) as rating,
    COALESCE(v.total_views, 0) as total_views,
    (v.boost_until IS NOT NULL AND v.boost_until > now()) AS is_promoted
FROM public.venues v
WHERE v.status = 'active' 
  AND v.deleted_at IS NULL;

-- 2. Create Spatial Index for fast bounding box queries
CREATE INDEX IF NOT EXISTS idx_mv_venue_geodata_location ON public.mv_venue_geodata USING GIST (location);

-- 3. Create unique index for concurrent refreshes
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_venue_geodata_id ON public.mv_venue_geodata (id);

-- 4. Function to refresh the view (can be called via RPC or Cron)
CREATE OR REPLACE FUNCTION public.refresh_venue_geodata()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_venue_geodata;
END;
$$;

COMMENT ON MATERIALIZED VIEW public.mv_venue_geodata IS 'Optimized geodata cache for map tiles (VC-101)';

COMMIT;
