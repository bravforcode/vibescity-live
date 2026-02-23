-- =============================================================================
-- TRIAD Backfill + Status Normalize
-- Purpose:
--   - Normalize venue status policy and remove legacy drift values
--   - Backfill OSM contract defaults and dedupe identity rows
-- =============================================================================

BEGIN;

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

UPDATE public.venues
SET osm_type = 'node'
WHERE osm_type IS NULL;

UPDATE public.venues
SET source = 'osm'
WHERE source IS NULL
  AND legacy_shop_id IS NOT NULL;

DO $$
DECLARE
  venues_tbl regclass := to_regclass('public.venues');
BEGIN
  IF venues_tbl IS NOT NULL THEN
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

    ALTER TABLE public.venues
      VALIDATE CONSTRAINT venues_status_check;
  END IF;
END $$;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY osm_type, legacy_shop_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, ctid DESC
    ) AS rn
  FROM public.venues
  WHERE osm_type IS NOT NULL
    AND legacy_shop_id IS NOT NULL
)
DELETE FROM public.venues v
USING ranked r
WHERE v.ctid = r.ctid
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY osm_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, ctid DESC
    ) AS rn
  FROM public.venues
  WHERE osm_id IS NOT NULL
)
DELETE FROM public.venues v
USING ranked r
WHERE v.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS venues_osm_type_legacy_shop_id_uq
  ON public.venues (osm_type, legacy_shop_id)
  WHERE legacy_shop_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS venues_osm_id_uq
  ON public.venues (osm_id)
  WHERE osm_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('analytics.hotspot_5m') IS NOT NULL THEN
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.hotspot_5m;
    EXCEPTION WHEN OTHERS THEN
      REFRESH MATERIALIZED VIEW analytics.hotspot_5m;
    END;
  END IF;
END $$;

COMMIT;
