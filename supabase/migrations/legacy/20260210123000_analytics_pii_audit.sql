-- Purpose: Add PII audit tables for raw IP logging (separate from product analytics) + 30-day retention purge
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.pii_audit_sessions, public.pii_audit_access_log, public.purge_pii_audit_sessions, public.purge_pii_audit_access_log
-- Risks (tier): High (PII storage + retention purge + admin access surface)
-- Rollback plan:
--   - Disable PII ingest at the Edge layer (PII_AUDIT_ENABLED=false)
--   - DROP TABLE IF EXISTS public.pii_audit_access_log;
--   - DROP TABLE IF EXISTS public.pii_audit_sessions;
--   - DROP FUNCTION IF EXISTS public.purge_pii_audit_sessions(INTEGER);
--   - DROP FUNCTION IF EXISTS public.purge_pii_audit_access_log(INTEGER);

-- 1) PII sessions table (raw IP; do NOT expose via PostgREST)
CREATE TABLE IF NOT EXISTS public.pii_audit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL,
  user_id UUID NULL,
  ip_raw TEXT NULL,
  user_agent TEXT NULL,
  country TEXT NULL,
  city TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pii_audit_sessions_created_at_idx
  ON public.pii_audit_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS pii_audit_sessions_last_seen_at_idx
  ON public.pii_audit_sessions (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS pii_audit_sessions_visitor_id_idx
  ON public.pii_audit_sessions (visitor_id);
CREATE INDEX IF NOT EXISTS pii_audit_sessions_user_id_idx
  ON public.pii_audit_sessions (user_id);
CREATE INDEX IF NOT EXISTS pii_audit_sessions_ip_raw_idx
  ON public.pii_audit_sessions (ip_raw);

ALTER TABLE public.pii_audit_sessions ENABLE ROW LEVEL SECURITY;

-- Deny by default. Only Edge Functions using service_role should access.
DROP POLICY IF EXISTS "pii_audit_sessions_service_role_all" ON public.pii_audit_sessions;
CREATE POLICY "pii_audit_sessions_service_role_all" ON public.pii_audit_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 2) Access log (who viewed/exported PII audit and when)
CREATE TABLE IF NOT EXISTS public.pii_audit_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NULL,
  action TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pii_audit_access_log_created_at_idx
  ON public.pii_audit_access_log (created_at DESC);
CREATE INDEX IF NOT EXISTS pii_audit_access_log_actor_idx
  ON public.pii_audit_access_log (actor_user_id);
CREATE INDEX IF NOT EXISTS pii_audit_access_log_action_idx
  ON public.pii_audit_access_log (action);

ALTER TABLE public.pii_audit_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pii_audit_access_log_service_role_all" ON public.pii_audit_access_log;
CREATE POLICY "pii_audit_access_log_service_role_all" ON public.pii_audit_access_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3) Retention: purge functions (default 30 days)
CREATE OR REPLACE FUNCTION public.purge_pii_audit_sessions(p_keep_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  DELETE FROM public.pii_audit_sessions
  WHERE created_at < NOW() - make_interval(days => GREATEST(COALESCE(p_keep_days, 30), 1));

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN COALESCE(v_rows, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_pii_audit_access_log(p_keep_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  DELETE FROM public.pii_audit_access_log
  WHERE created_at < NOW() - make_interval(days => GREATEST(COALESCE(p_keep_days, 30), 1));

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN COALESCE(v_rows, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_pii_audit_sessions(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_pii_audit_access_log(INTEGER) TO service_role;

-- 4) Cron schedules (best-effort; safe if pg_cron not installed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pii-audit-purge-sessions-daily') THEN
      PERFORM cron.schedule(
        'pii-audit-purge-sessions-daily',
        '50 0 * * *',
        'SELECT public.purge_pii_audit_sessions(30);'
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pii-audit-purge-access-log-daily') THEN
      PERFORM cron.schedule(
        'pii-audit-purge-access-log-daily',
        '55 0 * * *',
        'SELECT public.purge_pii_audit_access_log(30);'
      );
    END IF;
  END IF;
END;
$$;

