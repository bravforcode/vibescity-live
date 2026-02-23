-- =============================================================================
-- No-Auth Partner Gate hardening
-- Purpose:
--   1) Visitor-aware columns/indexes for partner/payment flows
--   2) Enforce service-role-only RLS on sensitive commerce/partner tables
--   3) Add slip replay uniqueness on slip_image_hash
--   4) Ensure analytics_logs is RLS-protected
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Visitor columns/indexes (idempotent)
-- -----------------------------------------------------------------------------

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS visitor_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_partners_visitor_id
  ON public.partners (visitor_id)
  WHERE visitor_id IS NOT NULL;

DO $$
BEGIN
  -- Existing TRIAD tables currently use visitor_id text in some environments.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name = 'visitor_id' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS visitor_id_uuid UUID;

    UPDATE public.orders
    SET visitor_id_uuid = visitor_id::uuid
    WHERE visitor_id_uuid IS NULL
      AND visitor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    CREATE INDEX IF NOT EXISTS idx_orders_visitor_id_uuid
      ON public.orders (visitor_id_uuid, created_at DESC);
  ELSE
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS visitor_id UUID;
    CREATE INDEX IF NOT EXISTS idx_orders_visitor_id_uuid
      ON public.orders (visitor_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'visitor_id' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS visitor_id_uuid UUID;

    UPDATE public.subscriptions
    SET visitor_id_uuid = visitor_id::uuid
    WHERE visitor_id_uuid IS NULL
      AND visitor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    CREATE INDEX IF NOT EXISTS idx_subscriptions_visitor_id_uuid
      ON public.subscriptions (visitor_id_uuid, created_at DESC);
  ELSE
    ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS visitor_id UUID;
    CREATE INDEX IF NOT EXISTS idx_subscriptions_visitor_id_uuid
      ON public.subscriptions (visitor_id, created_at DESC);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Slip replay protection (image hash uniqueness)
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_slip_image_hash_active
  ON public.orders (slip_image_hash)
  WHERE slip_image_hash IS NOT NULL
    AND status IN ('pending', 'pending_review', 'verified');

-- -----------------------------------------------------------------------------
-- 3) Service-role-only RLS on sensitive tables
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
  pol record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['orders', 'subscriptions', 'partners', 'partner_payouts']
  LOOP
    IF to_regclass(format('public.%s', tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      tbl || '_service_role_all',
      tbl
    );

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', tbl);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4) analytics_logs RLS hardening (if table exists)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.analytics_logs') IS NOT NULL THEN
    ALTER TABLE public.analytics_logs ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON public.analytics_logs FROM anon;
    REVOKE ALL ON public.analytics_logs FROM authenticated;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'analytics_logs'
        AND policyname = 'analytics_logs_service_role_all'
    ) THEN
      DROP POLICY analytics_logs_service_role_all ON public.analytics_logs;
    END IF;

    CREATE POLICY analytics_logs_service_role_all
      ON public.analytics_logs
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
