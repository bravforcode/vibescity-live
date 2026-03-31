-- =============================================================================
-- Ensure venues missing columns (fast/idempotent)
-- Purpose:
-- - Add compatibility columns only (no heavy backfill in this migration)
-- - Safe to run repeatedly on environments with schema drift
-- =============================================================================

BEGIN;
SET LOCAL statement_timeout = 0;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours TEXT,
  ADD COLUMN IF NOT EXISTS close_time TEXT,
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS review_count BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ig_url TEXT,
  ADD COLUMN IF NOT EXISTS fb_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS "IG_URL" TEXT,
  ADD COLUMN IF NOT EXISTS "FB_URL" TEXT,
  ADD COLUMN IF NOT EXISTS "TikTok_URL" TEXT;

COMMIT;
