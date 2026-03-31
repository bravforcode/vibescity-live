-- =============================================================================
-- Restore SELECT access for authenticated users on commerce/partner tables
-- Background:
--   20260222000000_noauth_partner_gate.sql locked these tables to service_role
--   only (DROP ALL policies + REVOKE ALL FROM anon/authenticated). This broke:
--     • SubscriptionManager.vue: queries subscriptions by venue_id (owner)
--     • partnerService.js: fallback queries partners/orders by visitor_id
--   The noauth gate was right to block mutations, but read access for
--   authenticated venue owners is legitimate and required.
-- Changes:
--   1) GRANT SELECT back to authenticated role (NOT anon — anon goes via API)
--   2) Add idempotent SELECT-only RLS policies for authenticated users
--   3) Keep all existing service_role_all policies (no DROP)
--   4) Keep REVOKE for anon (partner data stays server-side only for guests)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Re-grant SELECT to authenticated role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    GRANT SELECT ON public.subscriptions TO authenticated;
  END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    GRANT SELECT ON public.orders TO authenticated;
  END IF;
  IF to_regclass('public.partners') IS NOT NULL THEN
    GRANT SELECT ON public.partners TO authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) RLS SELECT policies for authenticated users (idempotent)
-- ---------------------------------------------------------------------------

-- subscriptions: owner can see their own (by user_id)
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscriptions'
      AND policyname = 'subscriptions_select_owner'
  ) THEN
    CREATE POLICY subscriptions_select_owner
    ON public.subscriptions
    FOR SELECT
    USING (
      auth.role() = 'service_role'
      OR user_id = auth.uid()
    );
  END IF;
END $$;

-- orders: owner can see their own (by user_id)
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_select_owner'
  ) THEN
    CREATE POLICY orders_select_owner
    ON public.orders
    FOR SELECT
    USING (
      auth.role() = 'service_role'
      OR user_id = auth.uid()
    );
  END IF;
END $$;

-- partners: authenticated user can see their own partner record
DO $$
BEGIN
  IF to_regclass('public.partners') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partners'
      AND policyname = 'partners_select_owner'
  ) THEN
    CREATE POLICY partners_select_owner
    ON public.partners
    FOR SELECT
    USING (
      auth.role() = 'service_role'
      OR user_id = auth.uid()
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) subscriptions: venue owners can also see subs for their venues
--    (needed by SubscriptionManager.vue which queries by venue_id)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL
    AND to_regclass('public.venues') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'subscriptions'
        AND policyname = 'subscriptions_select_venue_owner'
    )
  THEN
    CREATE POLICY subscriptions_select_venue_owner
    ON public.subscriptions
    FOR SELECT
    USING (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.venues v
        WHERE v.id = venue_id
          AND v.owner_id = auth.uid()
      )
    );
  END IF;
END $$;

COMMIT;
