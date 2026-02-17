-- =============================================================================
-- analytics_logs RLS lockdown
-- Purpose: Enable RLS and restrict all access to service_role only.
--          anon/authenticated get zero access (logs are server-side only).
-- Safety: idempotent, SQL Editor safe
-- Rollback: ALTER TABLE public.analytics_logs DISABLE ROW LEVEL SECURITY;
-- =============================================================================

BEGIN;

-- 1. Enable RLS (idempotent — no-op if already enabled)
DO $$
BEGIN
  IF to_regclass('public.analytics_logs') IS NOT NULL THEN
    ALTER TABLE public.analytics_logs ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 2. Revoke direct grants from anon and authenticated
DO $$
BEGIN
  IF to_regclass('public.analytics_logs') IS NOT NULL THEN
    REVOKE ALL ON public.analytics_logs FROM anon;
    REVOKE ALL ON public.analytics_logs FROM authenticated;
  END IF;
END $$;

-- 3. service_role bypass: RLS is bypassed by service_role by default in Supabase,
--    but add an explicit policy as defense-in-depth.
DO $$
BEGIN
  IF to_regclass('public.analytics_logs') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'analytics_logs'
      AND policyname = 'analytics_logs_service_role_all'
  ) THEN
    CREATE POLICY analytics_logs_service_role_all
    ON public.analytics_logs
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
