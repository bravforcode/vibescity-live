-- Purpose: Add missing analytics indexes for admin dashboards and rollups
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.analytics_sessions, public.analytics_events_archive_daily, public.analytics_events_p
-- Risks (tier): High (index creation can be slow/locking on large tables)
-- Rollback plan:
--   - DROP INDEX IF EXISTS public.analytics_sessions_started_at_idx;
--   - DROP INDEX IF EXISTS public.analytics_sessions_created_at_idx;
--   - DROP INDEX IF EXISTS public.analytics_sessions_country_started_at_idx;
--   - DROP INDEX IF EXISTS public.analytics_sessions_country_created_at_idx;
--   - DROP INDEX IF EXISTS public.analytics_sessions_country_last_seen_at_idx;
--   - DROP INDEX IF EXISTS public.analytics_events_archive_daily_event_type_day_idx;
--   - DROP INDEX IF EXISTS public.analytics_events_archive_daily_venue_day_idx;
--   - DROP INDEX IF EXISTS public.analytics_events_p_type_created_idx;
--   - DROP INDEX IF EXISTS public.analytics_events_p_venue_created_idx;

DO $$
DECLARE
  v_has_country BOOLEAN := FALSE;
BEGIN
  -- ---------------------------------------------------------------------------
  -- analytics_sessions: time-range + country filters
  -- Handles schema drift between started_at vs created_at.
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.analytics_sessions') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'analytics_sessions'
        AND column_name = 'country'
    ) INTO v_has_country;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'analytics_sessions'
        AND column_name = 'started_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_sessions_started_at_idx ON public.analytics_sessions (started_at DESC)';
      IF v_has_country THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_sessions_country_started_at_idx ON public.analytics_sessions (country, started_at DESC)';
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'analytics_sessions'
        AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_sessions_created_at_idx ON public.analytics_sessions (created_at DESC)';
      IF v_has_country THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_sessions_country_created_at_idx ON public.analytics_sessions (country, created_at DESC)';
      END IF;
    END IF;

    IF v_has_country AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'analytics_sessions'
        AND column_name = 'last_seen_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_sessions_country_last_seen_at_idx ON public.analytics_sessions (country, last_seen_at DESC)';
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- analytics_events_archive_daily: range-by-day + optional event_type filters
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.analytics_events_archive_daily') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_events_archive_daily_event_type_day_idx ON public.analytics_events_archive_daily (event_type, day DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_events_archive_daily_venue_day_idx ON public.analytics_events_archive_daily (venue_ref, day DESC)';
  END IF;

  -- ---------------------------------------------------------------------------
  -- analytics_events_p: protect common filtering (event_type, venue_ref) by time
  -- Note: this is a partitioned table; index creation may take time as partitions grow.
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.analytics_events_p') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_events_p_type_created_idx ON public.analytics_events_p (event_type, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS analytics_events_p_venue_created_idx ON public.analytics_events_p (venue_ref, created_at DESC)';
  END IF;
END $$;

