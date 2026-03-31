-- Migration: Add storefront_image_url to venues table
-- Description: Store official storefront photo URL (Priority: 1. Real Upload, 2. Street View fallback)

BEGIN;

-- Add column if not exists
ALTER TABLE IF EXISTS public.venues 
ADD COLUMN IF NOT EXISTS storefront_image_url TEXT;

-- Index for performance (optional, but good for filtering shops with/without official photos)
CREATE INDEX IF NOT EXISTS idx_venues_storefront_image_url ON public.venues (storefront_image_url) 
WHERE storefront_image_url IS NOT NULL;

-- Metadata tracking (optional, helps identifying source of storefront image)
ALTER TABLE IF EXISTS public.venues 
ADD COLUMN IF NOT EXISTS storefront_image_metadata JSONB DEFAULT '{}'::jsonb;

-- Example metadata structure:
-- {
--   "source": "upload" | "google_streetview" | "osm",
--   "updated_at": "timestamp",
--   "credit": "text"
-- }

COMMENT ON COLUMN public.venues.storefront_image_url IS 'Official storefront photo URL for Giant Pins and Detail views';

COMMIT;
