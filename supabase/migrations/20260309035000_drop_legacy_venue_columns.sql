-- =============================================================================
-- Migration: Drop Legacy Mixed-Case Columns from venues Table
-- Date: 2026-03-09
-- Purpose: Remove duplicate columns that have canonical lowercase equivalents.
--
-- Canonical column → Legacy column being dropped
--   image_urls[]   → "Image_URL1", "Image_URL2", "Image_URL3"
--   video_url      → "Video_URL"
--   ig_url         → "IG_URL"
--   fb_url         → "FB_URL"
--   tiktok_url     → "TikTok_URL"
--
-- Pre-requisite: Run 20260309030000_comprehensive_perf_indexes_and_rpcs.sql first.
-- All frontend/backend references to legacy column names have been removed.
-- =============================================================================

BEGIN;

-- Step 1: Migrate any data still in legacy columns → canonical columns
-- (safety net in case some rows were updated via legacy columns)
-- Some environments already dropped one or more legacy columns, so guard each
-- copy-forward step with information_schema checks.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'Image_URL1'
  ) THEN
    EXECUTE $sql$
      UPDATE public.venues
      SET image_urls = array_remove(
            array_append(
              COALESCE(image_urls, ARRAY[]::text[]),
              NULLIF(TRIM("Image_URL1"), '')
            ),
            NULL
          )
      WHERE "Image_URL1" IS NOT NULL
        AND TRIM("Image_URL1") <> ''
        AND NOT (TRIM("Image_URL1") = ANY(COALESCE(image_urls, ARRAY[]::text[])))
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'Video_URL'
  ) THEN
    EXECUTE $sql$
      UPDATE public.venues
      SET video_url = TRIM("Video_URL")
      WHERE "Video_URL" IS NOT NULL
        AND TRIM("Video_URL") <> ''
        AND (video_url IS NULL OR video_url = '')
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'IG_URL'
  ) THEN
    EXECUTE $sql$
      UPDATE public.venues
      SET ig_url = TRIM("IG_URL")
      WHERE "IG_URL" IS NOT NULL
        AND TRIM("IG_URL") <> ''
        AND (ig_url IS NULL OR ig_url = '')
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'FB_URL'
  ) THEN
    EXECUTE $sql$
      UPDATE public.venues
      SET fb_url = TRIM("FB_URL")
      WHERE "FB_URL" IS NOT NULL
        AND TRIM("FB_URL") <> ''
        AND (fb_url IS NULL OR fb_url = '')
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'TikTok_URL'
  ) THEN
    EXECUTE $sql$
      UPDATE public.venues
      SET tiktok_url = TRIM("TikTok_URL")
      WHERE "TikTok_URL" IS NOT NULL
        AND TRIM("TikTok_URL") <> ''
        AND (tiktok_url IS NULL OR tiktok_url = '')
    $sql$;
  END IF;
END $$;

-- Step 2: Drop dependent objects before altering the table
-- shops is a simple SELECT * view — will be recreated below without legacy columns
DROP VIEW IF EXISTS public.shops CASCADE;

-- Drop all legacy sync triggers that depend on the columns being dropped
DROP TRIGGER IF EXISTS trg_sync_venue_images_primary ON public.venues;
DROP TRIGGER IF EXISTS trg_sync_venue_video_columns  ON public.venues;

-- Step 3: Drop legacy columns
ALTER TABLE public.venues
  DROP COLUMN IF EXISTS "Image_URL1",
  DROP COLUMN IF EXISTS "Image_URL2",
  DROP COLUMN IF EXISTS "Image_URL3",
  DROP COLUMN IF EXISTS "Video_URL",
  DROP COLUMN IF EXISTS "IG_URL",
  DROP COLUMN IF EXISTS "FB_URL",
  DROP COLUMN IF EXISTS "TikTok_URL";

-- Step 4: Recreate social_links sync function and trigger
-- Ensures ig_url/fb_url/tiktok_url stay in sync with social_links JSONB (realtime)

CREATE OR REPLACE FUNCTION public.sync_social_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.social_links = COALESCE(NEW.social_links, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
        'instagram', NULLIF(TRIM(COALESCE(NEW.ig_url, '')), ''),
        'facebook',  NULLIF(TRIM(COALESCE(NEW.fb_url, '')), ''),
        'tiktok',    NULLIF(TRIM(COALESCE(NEW.tiktok_url, '')), '')
      ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_social_links ON public.venues;
CREATE TRIGGER trg_sync_social_links
  BEFORE INSERT OR UPDATE OF ig_url, fb_url, tiktok_url
  ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_social_links();

-- Step 5: One-time back-fill social_links from existing canonical columns
UPDATE public.venues
SET social_links = COALESCE(social_links, '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
      'instagram', NULLIF(TRIM(COALESCE(ig_url, '')), ''),
      'facebook',  NULLIF(TRIM(COALESCE(fb_url, '')), ''),
      'tiktok',    NULLIF(TRIM(COALESCE(tiktok_url, '')), '')
    ))
WHERE ig_url IS NOT NULL
   OR fb_url IS NOT NULL
   OR tiktok_url IS NOT NULL;

-- Step 6: Recreate the shops view (was SELECT * FROM venues — now excludes dropped columns)
CREATE OR REPLACE VIEW public.shops AS
  SELECT * FROM public.venues;

-- Restore grants (match what the original view had)
GRANT SELECT ON public.shops TO anon;
GRANT SELECT ON public.shops TO authenticated;
GRANT ALL   ON public.shops TO service_role;

-- Step 7: Expression index on image_urls[1] for fast cover image lookup
-- (replaces the dropped Image_URL1 column for cover-image queries)
CREATE INDEX IF NOT EXISTS idx_venues_cover_image
  ON public.venues ((image_urls[1]))
  WHERE image_urls IS NOT NULL AND array_length(image_urls, 1) > 0;

COMMIT;
