-- =============================================================================
-- Sheet Sync Scheduler Hotfix (Forward-Only)
-- Purpose:
--   - Stabilize scheduler/config in managed Supabase environments
--   - Enforce ledger dedupe + unique key safely
--   - Avoid ALTER DATABASE dependency
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sheet_sync_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_pk TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  sheet_row_index INTEGER,
  row_hash TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS source_table TEXT;
ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS source_pk TEXT;
ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS sheet_name TEXT;
ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS sheet_row_index INTEGER;
ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS row_hash TEXT;
ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.sheet_sync_ledger ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sheet_sync_ledger_last_synced_at
  ON public.sheet_sync_ledger (last_synced_at DESC);

CREATE TABLE IF NOT EXISTS public.sheet_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  actor_id UUID,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS triggered_by TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS request_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS result_stats JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running';
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.sheet_sync_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sheet_sync_runs_started_at
  ON public.sheet_sync_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.sheet_sync_runtime_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  sheet_sync_url TEXT NOT NULL DEFAULT '',
  sheet_sync_secret TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sheet_sync_runtime_config ADD COLUMN IF NOT EXISTS sheet_sync_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.sheet_sync_runtime_config ADD COLUMN IF NOT EXISTS sheet_sync_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE public.sheet_sync_runtime_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.sheet_sync_runtime_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public._set_sheet_sync_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_sheet_sync_ledger_updated_at'
      AND tgrelid = 'public.sheet_sync_ledger'::regclass
  ) THEN
    CREATE TRIGGER trg_sheet_sync_ledger_updated_at
    BEFORE UPDATE ON public.sheet_sync_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public._set_sheet_sync_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_sheet_sync_runs_updated_at'
      AND tgrelid = 'public.sheet_sync_runs'::regclass
  ) THEN
    CREATE TRIGGER trg_sheet_sync_runs_updated_at
    BEFORE UPDATE ON public.sheet_sync_runs
    FOR EACH ROW
    EXECUTE FUNCTION public._set_sheet_sync_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_sheet_sync_runtime_config_updated_at'
      AND tgrelid = 'public.sheet_sync_runtime_config'::regclass
  ) THEN
    CREATE TRIGGER trg_sheet_sync_runtime_config_updated_at
    BEFORE UPDATE ON public.sheet_sync_runtime_config
    FOR EACH ROW
    EXECUTE FUNCTION public._set_sheet_sync_updated_at();
  END IF;
END $$;

ALTER TABLE public.sheet_sync_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_sync_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sheet_sync_ledger_service_all ON public.sheet_sync_ledger;
CREATE POLICY sheet_sync_ledger_service_all
ON public.sheet_sync_ledger
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS sheet_sync_runs_service_all ON public.sheet_sync_runs;
CREATE POLICY sheet_sync_runs_service_all
ON public.sheet_sync_runs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS sheet_sync_runtime_config_service_all ON public.sheet_sync_runtime_config;
CREATE POLICY sheet_sync_runtime_config_service_all
ON public.sheet_sync_runtime_config
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY source_table, source_pk, sheet_name
      ORDER BY COALESCE(last_synced_at, updated_at, created_at) DESC, id DESC
    ) AS rn
  FROM public.sheet_sync_ledger
)
DELETE FROM public.sheet_sync_ledger s
USING ranked r
WHERE s.ctid = r.ctid
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'sheet_sync_ledger'
      AND indexname = 'uq_sheet_sync_ledger_source'
  ) THEN
    CREATE UNIQUE INDEX uq_sheet_sync_ledger_source
      ON public.sheet_sync_ledger (source_table, source_pk, sheet_name);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_sheet_sync_runtime_config(
  p_sheet_sync_url TEXT,
  p_sheet_sync_secret TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.sheet_sync_runtime_config (id, sheet_sync_url, sheet_sync_secret)
  VALUES (TRUE, COALESCE(TRIM(p_sheet_sync_url), ''), COALESCE(p_sheet_sync_secret, ''))
  ON CONFLICT (id)
  DO UPDATE SET
    sheet_sync_url = EXCLUDED.sheet_sync_url,
    sheet_sync_secret = EXCLUDED.sheet_sync_secret,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_sheet_sync_runtime_config(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_sheet_sync_runtime_config(TEXT, TEXT) TO service_role;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension unavailable: %', SQLERRM;
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net extension unavailable: %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.run_admin_sheet_sync()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT := COALESCE(current_setting('app.sheet_sync_url', true), '');
  v_secret TEXT := COALESCE(current_setting('app.sheet_sync_secret', true), '');
  v_headers JSONB := jsonb_build_object('Content-Type', 'application/json');
BEGIN
  IF v_url = '' THEN
    SELECT
      COALESCE(sheet_sync_url, ''),
      COALESCE(sheet_sync_secret, '')
    INTO v_url, v_secret
    FROM public.sheet_sync_runtime_config
    WHERE id = TRUE
    LIMIT 1;
  END IF;

  IF v_url = '' THEN
    RAISE NOTICE 'sheet sync URL is not configured';
    RETURN;
  END IF;

  IF v_secret <> '' THEN
    v_headers := v_headers || jsonb_build_object('x-sheet-sync-secret', v_secret);
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := v_headers,
      body := '{"mode":"incremental","scope":"all"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'sheet sync http trigger skipped: %', SQLERRM;
  END;
END;
$$;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'admin-sheet-sync-daily';

    PERFORM cron.schedule(
      'admin-sheet-sync-daily',
      '5 19 * * *',
      'SELECT public.run_admin_sheet_sync();'
    );
  ELSE
    RAISE NOTICE 'cron.job unavailable; schedule skipped';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sheet sync cron schedule skipped: %', SQLERRM;
END $$;

COMMIT;
