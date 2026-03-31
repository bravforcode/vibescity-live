-- =============================================================================
-- PR1: Analytics event_id deduplication + Sheet Sync Fallback Queue
-- Purpose:
--   1. Add event_id column to analytics_logs for idempotent ingestion
--   2. Create unique index to prevent duplicate event writes
--   3. Create sheet_sync_fallback_queue table for resilient Sheet sync
-- Safety: Fully idempotent, forward-only
-- Rollback:
--   DROP INDEX IF EXISTS analytics_logs_event_id_uidx;
--   ALTER TABLE public.analytics_logs DROP COLUMN IF EXISTS event_id;
--   DROP TABLE IF EXISTS public.sheet_sync_fallback_queue;
-- =============================================================================

BEGIN;

-- ─── 1. Add event_id to analytics_logs ───────────────────────────────────────

DO $$ BEGIN
  IF to_regclass('public.analytics_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'analytics_logs'
        AND column_name  = 'event_id'
    ) THEN
      ALTER TABLE public.analytics_logs
        ADD COLUMN event_id uuid;
    END IF;
  END IF;
END $$;

-- ─── 2. Unique index for deduplication (NULLS NOT DISTINCT — NULLs are distinct) ──
-- Rows with no event_id are old/legacy rows and are always allowed.
-- Only rows WITH an event_id are deduplicated.

DO $$ BEGIN
  IF to_regclass('public.analytics_logs') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'analytics_logs'
      AND indexname  = 'analytics_logs_event_id_uidx'
  ) THEN
    CREATE UNIQUE INDEX analytics_logs_event_id_uidx
      ON public.analytics_logs (event_id)
      WHERE event_id IS NOT NULL;
  END IF;
END $$;

-- ─── 3. Sheet Sync Fallback Queue ─────────────────────────────────────────────
-- Stores rows that failed to reach Google Sheets so a cron/manual sync can retry.

CREATE TABLE IF NOT EXISTS public.sheet_sync_fallback_queue (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_name  text        NOT NULL,         -- target sheet tab name
  payload     jsonb       NOT NULL,         -- row data to sync
  error_msg   text,                         -- last failure reason
  attempts    smallint    NOT NULL DEFAULT 0,
  synced      boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  synced_at   timestamptz
);

-- Index for efficient un-synced row retrieval
CREATE INDEX IF NOT EXISTS sheet_sync_fallback_queue_pending_idx
  ON public.sheet_sync_fallback_queue (synced, created_at)
  WHERE synced = false;

-- RLS: only service_role can read/write
ALTER TABLE public.sheet_sync_fallback_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sheet_sync_fallback_queue'
      AND policyname = 'sheet_sync_fallback_service_role_all'
  ) THEN
    CREATE POLICY sheet_sync_fallback_service_role_all
      ON public.sheet_sync_fallback_queue
      FOR ALL
      USING     (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
