-- Step 3: Build indexes concurrently (lower lock risk)
-- Run third in SQL Editor (prefer low-traffic window)

SET statement_timeout = '15min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS venues_province_code_idx
  ON public.venues (province_code) WHERE province_code IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS venues_district_code_idx
  ON public.venues (district_code) WHERE district_code IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS venues_subdistrict_code_idx
  ON public.venues (subdistrict_code) WHERE subdistrict_code IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS venues_admin_resolved_at_idx
  ON public.venues (admin_resolved_at DESC);

