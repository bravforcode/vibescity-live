-- =============================================================================
-- OSM Contract Hardening (public.venues)
-- Purpose:
--   - Ensure required OSM columns exist for production writer (osm-sync)
--   - Set safe defaults and backfill nulls
--   - Enforce idempotent dedupe keys for upsert
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.venues') IS NULL THEN
    RAISE EXCEPTION 'public.venues does not exist. Apply core schema first.';
  END IF;
END $$;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS legacy_shop_id BIGINT,
  ADD COLUMN IF NOT EXISTS osm_id TEXT,
  ADD COLUMN IF NOT EXISTS osm_type TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS h3_cell TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS osm_version INTEGER,
  ADD COLUMN IF NOT EXISTS osm_timestamp TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_osm_sync TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_time TEXT,
  ADD COLUMN IF NOT EXISTS vibe_info TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'osm_type'
  ) THEN
    ALTER TABLE public.venues ALTER COLUMN osm_type SET DEFAULT 'node';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.venues ALTER COLUMN source SET DEFAULT 'osm';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'social_links'
      AND udt_name = 'jsonb'
  ) THEN
    ALTER TABLE public.venues ALTER COLUMN social_links SET DEFAULT '{}'::jsonb;
  END IF;
END $$;

UPDATE public.venues
SET osm_type = 'node'
WHERE osm_type IS NULL;

UPDATE public.venues
SET source = 'osm'
WHERE source IS NULL
  AND legacy_shop_id IS NOT NULL;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY osm_type, legacy_shop_id
      ORDER BY ctid DESC
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
      ORDER BY ctid DESC
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

CREATE INDEX IF NOT EXISTS venues_h3_cell_idx
  ON public.venues (h3_cell)
  WHERE h3_cell IS NOT NULL;

CREATE INDEX IF NOT EXISTS venues_last_osm_sync_idx
  ON public.venues (last_osm_sync DESC);

CREATE INDEX IF NOT EXISTS venues_source_idx
  ON public.venues (source);

COMMENT ON COLUMN public.venues.legacy_shop_id IS
  'OSM legacy numeric ID used with osm_type as dedupe/upsert key.';
COMMENT ON COLUMN public.venues.osm_type IS
  'OSM element type: node, way, relation.';
COMMENT ON COLUMN public.venues.osm_id IS
  'OSM ID string for compatibility imports and diagnostics.';
COMMENT ON COLUMN public.venues.content_hash IS
  'Hash used by OSM sync diff engine to skip unchanged rows.';
COMMENT ON COLUMN public.venues.last_osm_sync IS
  'Timestamp of last successful OSM ingestion touch.';

COMMIT;
