-- Step 1: Add schema columns + defaults + lightweight constraint (NOT VALID)
-- Run first in SQL Editor

SET statement_timeout = '15min';

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict TEXT,
  ADD COLUMN IF NOT EXISTS province_th TEXT,
  ADD COLUMN IF NOT EXISTS province_en TEXT,
  ADD COLUMN IF NOT EXISTS district_th TEXT,
  ADD COLUMN IF NOT EXISTS district_en TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict_th TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict_en TEXT,
  ADD COLUMN IF NOT EXISTS province_code TEXT,
  ADD COLUMN IF NOT EXISTS district_code TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict_code TEXT,
  ADD COLUMN IF NOT EXISTS admin_source TEXT,
  ADD COLUMN IF NOT EXISTS admin_confidence SMALLINT,
  ADD COLUMN IF NOT EXISTS admin_resolved_at TIMESTAMPTZ;

ALTER TABLE public.venues
  ALTER COLUMN admin_source SET DEFAULT 'unknown',
  ALTER COLUMN admin_confidence SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venues_admin_confidence_range_ck'
      AND conrelid = 'public.venues'::regclass
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_admin_confidence_range_ck
      CHECK (admin_confidence BETWEEN 0 AND 100) NOT VALID;
  END IF;
END $$;

