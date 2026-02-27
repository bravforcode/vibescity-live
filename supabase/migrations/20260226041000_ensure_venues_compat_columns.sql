-- =============================================================================
-- Ensure venues compatibility columns (idempotent)
-- Purpose:
-- - Backfill missing columns used by feed/modal/media/admin pipelines
-- - Prevent runtime errors from schema drift across environments
-- =============================================================================

BEGIN;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS short_code TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB,
  ADD COLUMN IF NOT EXISTS open_time TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours TEXT,
  ADD COLUMN IF NOT EXISTS close_time TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "Image_URL1" TEXT,
  ADD COLUMN IF NOT EXISTS "Image_URL2" TEXT,
  ADD COLUMN IF NOT EXISTS "Image_URL3" TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS "Video_URL" TEXT,
  ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_views BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_type TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS pin_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS building_id TEXT,
  ADD COLUMN IF NOT EXISTS floor TEXT,
  ADD COLUMN IF NOT EXISTS owner_visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS ig_url TEXT,
  ADD COLUMN IF NOT EXISTS fb_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS "IG_URL" TEXT,
  ADD COLUMN IF NOT EXISTS "FB_URL" TEXT,
  ADD COLUMN IF NOT EXISTS "TikTok_URL" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'social_links'
  ) THEN
    ALTER TABLE public.venues
      ALTER COLUMN social_links SET DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- NOTE: Bulk UPDATE statements removed — they cause statement_timeout on large tables.
-- Columns have DEFAULT values from ALTER TABLE above, so new rows are covered.
-- Existing NULLs are harmless; runtime code uses COALESCE defensively.

CREATE INDEX IF NOT EXISTS venues_slug_idx ON public.venues (slug);
CREATE INDEX IF NOT EXISTS venues_short_code_idx ON public.venues (short_code);
CREATE INDEX IF NOT EXISTS venues_category_idx ON public.venues (category);
CREATE INDEX IF NOT EXISTS venues_province_idx ON public.venues (province);
CREATE INDEX IF NOT EXISTS venues_district_idx ON public.venues (district);
CREATE INDEX IF NOT EXISTS venues_pin_type_idx ON public.venues (pin_type);
CREATE INDEX IF NOT EXISTS venues_status_idx ON public.venues (status);
CREATE INDEX IF NOT EXISTS venues_video_url_idx
  ON public.venues (video_url)
  WHERE video_url IS NOT NULL;

COMMIT;
