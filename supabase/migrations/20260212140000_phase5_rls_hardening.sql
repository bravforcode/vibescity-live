-- =============================================================================
-- PHASE 5: Row Level Security Hardening
-- =============================================================================
-- Purpose: Enable RLS on all remaining tables and create granular policies.
-- Safety:  Idempotent. Uses DO blocks for CREATE POLICY IF NOT EXISTS pattern.
-- Rollback: See bottom of file.
-- =============================================================================

BEGIN;

-- ─── 5a) Enable RLS on tables missing it ────────────────────────────────────

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'user_home_locations',
    'emergency_locations',
    'analytics_events_p',
    'map_pins_zoom_cache',
    'venue_stats'
  ];
  v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
      RAISE NOTICE 'Enabled RLS on public.%', v_tbl;
    END IF;
  END LOOP;
END $$;

-- ─── 5b) user_home_locations — owner-only access ────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_home_locations') THEN
    -- SELECT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'user_home_locations' AND policyname = 'uhl_owner_select'
    ) THEN
      CREATE POLICY uhl_owner_select ON public.user_home_locations
        FOR SELECT TO authenticated
        USING (user_id = auth.uid());
    END IF;

    -- INSERT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'user_home_locations' AND policyname = 'uhl_owner_insert'
    ) THEN
      CREATE POLICY uhl_owner_insert ON public.user_home_locations
        FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid());
    END IF;

    -- UPDATE
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'user_home_locations' AND policyname = 'uhl_owner_update'
    ) THEN
      CREATE POLICY uhl_owner_update ON public.user_home_locations
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid());
    END IF;

    -- DELETE
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'user_home_locations' AND policyname = 'uhl_owner_delete'
    ) THEN
      CREATE POLICY uhl_owner_delete ON public.user_home_locations
        FOR DELETE TO authenticated
        USING (user_id = auth.uid());
    END IF;

    -- Service role full access
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'user_home_locations' AND policyname = 'uhl_service_all'
    ) THEN
      CREATE POLICY uhl_service_all ON public.user_home_locations
        FOR ALL TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ─── 5c) emergency_locations — public read, service write ───────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'emergency_locations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'emergency_locations' AND policyname = 'el_public_read'
    ) THEN
      CREATE POLICY el_public_read ON public.emergency_locations
        FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'emergency_locations' AND policyname = 'el_service_write'
    ) THEN
      CREATE POLICY el_service_write ON public.emergency_locations
        FOR ALL TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ─── 5d) analytics_events_p — service_role only ─────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'analytics_events_p') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'analytics_events_p' AND policyname = 'aep_service_only'
    ) THEN
      CREATE POLICY aep_service_only ON public.analytics_events_p
        FOR ALL TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ─── 5e) map_pins_zoom_cache — public read, service write ───────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'map_pins_zoom_cache') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'map_pins_zoom_cache' AND policyname = 'mpc_public_read'
    ) THEN
      CREATE POLICY mpc_public_read ON public.map_pins_zoom_cache
        FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'map_pins_zoom_cache' AND policyname = 'mpc_service_write'
    ) THEN
      CREATE POLICY mpc_service_write ON public.map_pins_zoom_cache
        FOR ALL TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ─── 5f) venue_stats — public read, service write ───────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venue_stats') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'venue_stats' AND policyname = 'vs_public_read'
    ) THEN
      CREATE POLICY vs_public_read ON public.venue_stats
        FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'venue_stats' AND policyname = 'vs_service_write'
    ) THEN
      CREATE POLICY vs_service_write ON public.venue_stats
        FOR ALL TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK PLAN:
-- =============================================================================
-- DROP POLICY IF EXISTS uhl_owner_select ON public.user_home_locations;
-- DROP POLICY IF EXISTS uhl_owner_insert ON public.user_home_locations;
-- DROP POLICY IF EXISTS uhl_owner_update ON public.user_home_locations;
-- DROP POLICY IF EXISTS uhl_owner_delete ON public.user_home_locations;
-- DROP POLICY IF EXISTS uhl_service_all ON public.user_home_locations;
-- ALTER TABLE public.user_home_locations DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS el_public_read ON public.emergency_locations;
-- DROP POLICY IF EXISTS el_service_write ON public.emergency_locations;
-- ALTER TABLE public.emergency_locations DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS aep_service_only ON public.analytics_events_p;
-- ALTER TABLE public.analytics_events_p DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS mpc_public_read ON public.map_pins_zoom_cache;
-- DROP POLICY IF EXISTS mpc_service_write ON public.map_pins_zoom_cache;
-- ALTER TABLE public.map_pins_zoom_cache DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS vs_public_read ON public.venue_stats;
-- DROP POLICY IF EXISTS vs_service_write ON public.venue_stats;
-- ALTER TABLE public.venue_stats DISABLE ROW LEVEL SECURITY;
