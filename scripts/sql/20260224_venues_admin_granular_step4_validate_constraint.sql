-- Step 4: Validate CHECK constraint after backfill stabilizes
-- Run last (optional now, recommended after enrichment run finishes)

SET statement_timeout = '15min';

ALTER TABLE public.venues
  VALIDATE CONSTRAINT venues_admin_confidence_range_ck;

