-- Purpose: Update PII audit retention to 90 days (sessions + access log)
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.purge_pii_audit_sessions, public.purge_pii_audit_access_log, cron.job
-- Risks (tier): High (PII retention policy + cron changes)
-- Rollback plan:
--   - Run a forward-fix migration to change defaults back to 30 days.
--   - Update cron schedules to call purge functions with 30 days.

-- 1) Update purge functions (default 90 days)
CREATE OR REPLACE FUNCTION public.purge_pii_audit_sessions(p_keep_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  DELETE FROM public.pii_audit_sessions
  WHERE created_at < NOW() - make_interval(days => GREATEST(COALESCE(p_keep_days, 90), 1));

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN COALESCE(v_rows, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_pii_audit_access_log(p_keep_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  DELETE FROM public.pii_audit_access_log
  WHERE created_at < NOW() - make_interval(days => GREATEST(COALESCE(p_keep_days, 90), 1));

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN COALESCE(v_rows, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_pii_audit_sessions(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_pii_audit_access_log(INTEGER) TO service_role;

-- 2) Reschedule cron jobs (best-effort; safe if pg_cron not installed)
DO $$
DECLARE
  v_job_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'pii-audit-purge-sessions-daily';

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'pii-audit-purge-sessions-daily',
      '50 0 * * *',
      'SELECT public.purge_pii_audit_sessions(90);'
    );

    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'pii-audit-purge-access-log-daily';

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'pii-audit-purge-access-log-daily',
      '55 0 * * *',
      'SELECT public.purge_pii_audit_access_log(90);'
    );
  END IF;
END;
$$;
