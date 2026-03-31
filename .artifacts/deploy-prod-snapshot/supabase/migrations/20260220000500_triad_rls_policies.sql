-- =============================================================================
-- TRIAD RLS Policies
-- Purpose:
--   - Ensure baseline RLS posture across high-value tables
--   - Keep policy creation idempotent
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL THEN
    ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.user_favorites') IS NOT NULL THEN
    ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.user_submissions') IS NOT NULL THEN
    ALTER TABLE public.user_submissions ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.venue_photos') IS NOT NULL THEN
    ALTER TABLE public.venue_photos ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.user_stats') IS NOT NULL THEN
    ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.user_achievements') IS NOT NULL THEN
    ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.partners') IS NOT NULL THEN
    ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
  END IF;
  IF to_regclass('public.local_ads') IS NOT NULL THEN
    ALTER TABLE public.local_ads ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venues' AND policyname = 'venues_select_public_active'
  ) THEN
    CREATE POLICY venues_select_public_active
    ON public.venues
    FOR SELECT
    USING (
      status = 'active'
      OR auth.role() = 'service_role'
      OR owner_id = auth.uid()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_select_own_or_service'
  ) THEN
    CREATE POLICY orders_select_own_or_service
    ON public.orders
    FOR SELECT
    USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  IF to_regclass('public.orders') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_insert_own_or_service'
  ) THEN
    CREATE POLICY orders_insert_own_or_service
    ON public.orders
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid() OR user_id IS NULL);
  END IF;

  IF to_regclass('public.orders') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_update_service_only'
  ) THEN
    CREATE POLICY orders_update_service_only
    ON public.orders
    FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'subscriptions_select_own_or_service'
  ) THEN
    CREATE POLICY subscriptions_select_own_or_service
    ON public.subscriptions
    FOR SELECT
    USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'user_profiles_select_own_or_service'
  ) THEN
    CREATE POLICY user_profiles_select_own_or_service
    ON public.user_profiles
    FOR SELECT
    USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  IF to_regclass('public.user_profiles') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'user_profiles_upsert_own_or_service'
  ) THEN
    CREATE POLICY user_profiles_upsert_own_or_service
    ON public.user_profiles
    FOR ALL
    USING (auth.role() = 'service_role' OR user_id = auth.uid())
    WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_favorites') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_favorites' AND policyname = 'user_favorites_own_or_service'
  ) THEN
    CREATE POLICY user_favorites_own_or_service
    ON public.user_favorites
    FOR ALL
    USING (auth.role() = 'service_role' OR user_id = auth.uid())
    WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_submissions') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_submissions' AND policyname = 'user_submissions_select_own_or_service'
  ) THEN
    CREATE POLICY user_submissions_select_own_or_service
    ON public.user_submissions
    FOR SELECT
    USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  IF to_regclass('public.user_submissions') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_submissions' AND policyname = 'user_submissions_insert_own_or_service'
  ) THEN
    CREATE POLICY user_submissions_insert_own_or_service
    ON public.user_submissions
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.venue_photos') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venue_photos' AND policyname = 'venue_photos_select_public_or_own'
  ) THEN
    CREATE POLICY venue_photos_select_public_or_own
    ON public.venue_photos
    FOR SELECT
    USING (status = 'approved' OR auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  IF to_regclass('public.venue_photos') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venue_photos' AND policyname = 'venue_photos_insert_own_or_service'
  ) THEN
    CREATE POLICY venue_photos_insert_own_or_service
    ON public.venue_photos
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_stats') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_stats' AND policyname = 'user_stats_select_own_or_service'
  ) THEN
    CREATE POLICY user_stats_select_own_or_service
    ON public.user_stats
    FOR SELECT
    USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_achievements') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_achievements' AND policyname = 'user_achievements_select_own_or_service'
  ) THEN
    CREATE POLICY user_achievements_select_own_or_service
    ON public.user_achievements
    FOR SELECT
    USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.partners') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'partners' AND policyname = 'partners_select_own_or_service'
  ) THEN
    CREATE POLICY partners_select_own_or_service
    ON public.partners
    FOR SELECT
    USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  IF to_regclass('public.partners') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'partners' AND policyname = 'partners_upsert_own_or_service'
  ) THEN
    CREATE POLICY partners_upsert_own_or_service
    ON public.partners
    FOR ALL
    USING (auth.role() = 'service_role' OR user_id = auth.uid())
    WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.local_ads') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'local_ads' AND policyname = 'local_ads_select_active'
  ) THEN
    CREATE POLICY local_ads_select_active
    ON public.local_ads
    FOR SELECT
    USING (status = 'active' OR auth.role() = 'service_role');
  END IF;

  IF to_regclass('public.local_ads') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'local_ads' AND policyname = 'local_ads_service_write'
  ) THEN
    CREATE POLICY local_ads_service_write
    ON public.local_ads
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
