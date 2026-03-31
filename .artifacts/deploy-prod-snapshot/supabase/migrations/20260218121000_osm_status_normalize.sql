-- =============================================================================
-- OSM Status Normalization (public.venues.status)
-- Purpose:
--   - Normalize drifted status values for OSM data
--   - Enforce active/pending/archived/draft policy set
-- =============================================================================

BEGIN;

DO $$
DECLARE
  venues_tbl regclass := to_regclass('public.venues');
BEGIN
  IF venues_tbl IS NULL THEN
    RAISE EXCEPTION 'public.venues does not exist. Apply core schema first.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status'
  ) THEN
    UPDATE public.venues
    SET status = 'active'
    WHERE status IS NOT NULL
      AND lower(status) = 'live';

    UPDATE public.venues
    SET status = 'archived'
    WHERE status IS NOT NULL
      AND lower(status) = 'off';

    UPDATE public.venues
    SET status = lower(status)
    WHERE status IS NOT NULL
      AND lower(status) IN ('active', 'pending', 'archived', 'draft')
      AND status <> lower(status);

    UPDATE public.venues
    SET status = 'active'
    WHERE status IS NULL
      AND lower(COALESCE(source, '')) = 'osm';

    ALTER TABLE public.venues
      ALTER COLUMN status SET DEFAULT 'active';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'venues_status_check'
        AND conrelid = venues_tbl
    ) THEN
      ALTER TABLE public.venues
        ADD CONSTRAINT venues_status_check
        CHECK (status IN ('active', 'pending', 'archived', 'draft'))
        NOT VALID;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'venues_status_check'
        AND conrelid = venues_tbl
    ) THEN
      ALTER TABLE public.venues
        VALIDATE CONSTRAINT venues_status_check;
    END IF;
  END IF;
END $$;

COMMIT;
