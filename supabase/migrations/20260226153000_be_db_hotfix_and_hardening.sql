-- =============================================================================
-- BE/DB Hotfix + Hardening Pack (Phase 1 + Phase 2)
-- Date: 2026-02-26
-- Safety: idempotent, no edits to historical migrations
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Critical hotfix: moderation enum-safe mapping
--    auto_soft_hide -> off, auto_block -> disabled (venues only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_moderate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_count INTEGER;
  v_has_violence BOOLEAN;
  v_action TEXT;
  v_venue_status TEXT;
  v_content_status TEXT;
BEGIN
  SELECT COUNT(DISTINCT reporter_id)
  INTO v_report_count
  FROM public.reports
  WHERE entity_type = NEW.entity_type
    AND entity_id   = NEW.entity_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.reports
    WHERE entity_type = NEW.entity_type
      AND entity_id   = NEW.entity_id
      AND reason      = 'violence'
  )
  INTO v_has_violence;

  IF v_report_count >= 10 OR v_has_violence THEN
    v_action := 'auto_block';
    v_venue_status := 'disabled';
    v_content_status := 'blocked';
  ELSIF v_report_count >= 5 THEN
    v_action := 'auto_soft_hide';
    v_venue_status := 'off';
    v_content_status := 'hidden';
  ELSE
    RETURN NEW;
  END IF;

  CASE NEW.entity_type
    WHEN 'venue' THEN
      UPDATE public.venues
      SET status = v_venue_status
      WHERE id = NEW.entity_id
        AND status::text NOT IN ('disabled', 'off');
    WHEN 'review' THEN
      UPDATE public.reviews
      SET status = v_content_status
      WHERE id = NEW.entity_id
        AND COALESCE(status, '') NOT IN ('blocked', 'hidden');
    WHEN 'photo' THEN
      UPDATE public.venue_photos
      SET status = v_content_status
      WHERE id = NEW.entity_id
        AND COALESCE(status, '') NOT IN ('blocked', 'hidden');
    ELSE
      NULL;
  END CASE;

  INSERT INTO public.moderation_logs (entity_type, entity_id, action, reason, metadata)
  VALUES (
    NEW.entity_type,
    NEW.entity_id,
    v_action,
    'Auto-moderation: ' || v_report_count || ' unique reports',
    jsonb_build_object(
      'report_count', v_report_count,
      'has_violence', v_has_violence,
      'trigger_report_id', NEW.id
    )
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Payment idempotency + schema compatibility for active payment flows
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS purchase_mode TEXT;

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id TEXT;

ALTER TABLE IF EXISTS public.partner_commission_ledger
  ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ;

-- Normalize historic subscription statuses (orders side)
UPDATE public.orders
SET subscription_status = CASE
  WHEN subscription_status IS NULL THEN NULL
  WHEN lower(btrim(subscription_status)) IN ('active', 'trialing', 'paused', 'cancelled', 'expired', 'refunded') THEN lower(btrim(subscription_status))
  WHEN lower(btrim(subscription_status)) = 'canceled' THEN 'cancelled'
  WHEN lower(btrim(subscription_status)) IN ('past_due', 'unpaid', 'incomplete', 'incomplete_expired') THEN 'paused'
  ELSE 'paused'
END
WHERE subscription_status IS NOT NULL;

DO $$
DECLARE
  v_status_type TEXT;
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RETURN;
  END IF;

  SELECT udt_name
  INTO v_status_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'subscriptions'
    AND column_name = 'status';

  IF v_status_type = 'subscription_status' THEN
    UPDATE public.subscriptions
    SET status = (
      CASE
        WHEN status IS NULL THEN 'active'
        WHEN lower(btrim(status::text)) = 'canceled' THEN 'cancelled'
        WHEN lower(btrim(status::text)) IN ('past_due', 'unpaid', 'incomplete', 'incomplete_expired') THEN 'paused'
        WHEN lower(btrim(status::text)) IN ('active', 'trialing', 'paused', 'cancelled', 'expired') THEN lower(btrim(status::text))
        ELSE 'paused'
      END
    )::subscription_status
    WHERE status IS NULL
       OR lower(btrim(status::text)) = 'canceled'
       OR lower(btrim(status::text)) IN ('past_due', 'unpaid', 'incomplete', 'incomplete_expired')
       OR lower(btrim(status::text)) NOT IN ('active', 'trialing', 'paused', 'cancelled', 'expired');
  ELSE
    UPDATE public.subscriptions
    SET status = CASE
      WHEN status IS NULL THEN 'active'
      WHEN lower(btrim(status::text)) = 'canceled' THEN 'cancelled'
      WHEN lower(btrim(status::text)) IN ('past_due', 'unpaid', 'incomplete', 'incomplete_expired') THEN 'paused'
      WHEN lower(btrim(status::text)) IN ('active', 'trialing', 'paused', 'cancelled', 'expired') THEN lower(btrim(status::text))
      ELSE 'paused'
    END
    WHERE status IS NULL
       OR lower(btrim(status::text)) = 'canceled'
       OR lower(btrim(status::text)) IN ('past_due', 'unpaid', 'incomplete', 'incomplete_expired')
       OR lower(btrim(status::text)) NOT IN ('active', 'trialing', 'paused', 'cancelled', 'expired');
  END IF;
END $$;

-- Dedupe before unique indexes (keep newest row canonical)
WITH ranked AS (
  SELECT
    id,
    provider_order_id,
    ROW_NUMBER() OVER (
      PARTITION BY provider, provider_order_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.orders
  WHERE provider IS NOT NULL
    AND provider_order_id IS NOT NULL
)
UPDATE public.orders o
SET provider_order_id = o.provider_order_id || '#dup#' || left(o.id::text, 8),
    updated_at = now()
FROM ranked r
WHERE o.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    provider_payment_id,
    ROW_NUMBER() OVER (
      PARTITION BY provider, provider_payment_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.payments
  WHERE provider IS NOT NULL
    AND provider_payment_id IS NOT NULL
)
UPDATE public.payments p
SET provider_payment_id = p.provider_payment_id || '#dup#' || left(p.id::text, 8)
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    stripe_subscription_id,
    ROW_NUMBER() OVER (
      PARTITION BY stripe_subscription_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.subscriptions
  WHERE stripe_subscription_id IS NOT NULL
)
UPDATE public.subscriptions s
SET stripe_subscription_id = s.stripe_subscription_id || '#dup#' || left(s.id::text, 8),
    updated_at = now()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_provider_id
  ON public.orders (provider, provider_order_id)
  WHERE provider IS NOT NULL
    AND provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment_id
  ON public.payments (provider, provider_payment_id)
  WHERE provider IS NOT NULL
    AND provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_stripe_subscription_id
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_provider_lookup
  ON public.orders (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_provider_lookup
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_subscription_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_subscription_status_check
      CHECK (
        subscription_status IS NULL
        OR subscription_status IN ('active', 'trialing', 'paused', 'cancelled', 'expired', 'refunded')
      )
      NOT VALID;
  END IF;
END $$;

-- Canonical idempotency table for Stripe webhooks
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stripe_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;
ALTER TABLE IF EXISTS public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE IF EXISTS public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE IF EXISTS public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY stripe_event_id
      ORDER BY received_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.stripe_webhook_events
  WHERE stripe_event_id IS NOT NULL
)
DELETE FROM public.stripe_webhook_events e
USING ranked r
WHERE e.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_webhook_events_stripe_event_id
  ON public.stripe_webhook_events (stripe_event_id);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed
  ON public.stripe_webhook_events (processed_at, received_at DESC);

DO $$
BEGIN
  IF to_regclass('public.stripe_events') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.stripe_webhook_events (
    stripe_event_id,
    event_type,
    payload,
    received_at,
    processed_at
  )
  SELECT
    se.id,
    'legacy.stripe_events',
    jsonb_build_object('source', 'stripe_events_migration'),
    COALESCE(se.created_at, now()),
    COALESCE(se.created_at, now())
  FROM public.stripe_events se
  ON CONFLICT (stripe_event_id) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Coupon domain completion: table + atomic redeem_coupon
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL DEFAULT 0 CHECK (points_cost >= 0),
  quota_total INTEGER CHECK (quota_total IS NULL OR quota_total >= 0),
  quota_per_user INTEGER NOT NULL DEFAULT 1 CHECK (quota_per_user >= 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS points_cost INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS quota_total INTEGER;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS quota_per_user INTEGER NOT NULL DEFAULT 1;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS public.coupons
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.coupons
SET points_cost = 0
WHERE points_cost IS NULL;

UPDATE public.coupons
SET quota_per_user = 1
WHERE quota_per_user IS NULL;

UPDATE public.coupons
SET used_count = 0
WHERE used_count IS NULL;

DO $$
BEGIN
  IF to_regclass('public.redemptions') IS NULL OR to_regclass('public.coupons') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'redemptions_coupon_id_fkey'
      AND conrelid = 'public.redemptions'::regclass
  ) THEN
    ALTER TABLE public.redemptions
      ADD CONSTRAINT redemptions_coupon_id_fkey
      FOREIGN KEY (coupon_id)
      REFERENCES public.coupons(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_coupons_active_window
  ON public.coupons (is_active, starts_at, expires_at, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_code
  ON public.coupons (code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_redemptions_coupon_created
  ON public.redemptions (coupon_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_user_id uuid, p_coupon_id integer)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_coupon public.coupons%ROWTYPE;
  v_user_used INTEGER := 0;
  v_current_coins INTEGER := 0;
  v_remaining_coins INTEGER := 0;
  v_redemption_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_user');
  END IF;

  SELECT *
  INTO v_coupon
  FROM public.coupons
  WHERE id = p_coupon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'coupon_not_found');
  END IF;

  IF NOT COALESCE(v_coupon.is_active, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'coupon_inactive');
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'coupon_not_started');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'coupon_expired');
  END IF;

  IF v_coupon.quota_total IS NOT NULL AND v_coupon.used_count >= v_coupon.quota_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'coupon_out_of_stock');
  END IF;

  SELECT COUNT(*)
  INTO v_user_used
  FROM public.redemptions r
  WHERE r.user_id = p_user_id
    AND r.coupon_id = p_coupon_id
    AND r.status = 'success';

  IF COALESCE(v_coupon.quota_per_user, 0) > 0 AND v_user_used >= v_coupon.quota_per_user THEN
    RETURN jsonb_build_object('success', false, 'error', 'coupon_quota_per_user_exceeded');
  END IF;

  INSERT INTO public.user_stats (user_id, coins, xp, level, created_at, updated_at)
  VALUES (p_user_id, 0, 0, 1, v_now, v_now)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT coins
  INTO v_current_coins
  FROM public.user_stats
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_current_coins := COALESCE(v_current_coins, 0);

  IF COALESCE(v_coupon.points_cost, 0) > 0 AND v_current_coins < v_coupon.points_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_coins',
      'required', v_coupon.points_cost,
      'balance', v_current_coins
    );
  END IF;

  v_remaining_coins := v_current_coins - COALESCE(v_coupon.points_cost, 0);

  IF COALESCE(v_coupon.points_cost, 0) > 0 THEN
    UPDATE public.user_stats
    SET coins = v_remaining_coins,
        updated_at = v_now
    WHERE user_id = p_user_id;

    INSERT INTO public.coin_transactions (user_id, coin_delta, action_name, metadata, created_at)
    VALUES (
      p_user_id,
      -v_coupon.points_cost,
      'coupon_redeem',
      jsonb_build_object(
        'coupon_id', p_coupon_id,
        'coupon_code', v_coupon.code
      ),
      v_now
    );
  END IF;

  UPDATE public.coupons
  SET used_count = used_count + 1,
      updated_at = v_now
  WHERE id = p_coupon_id;

  INSERT INTO public.redemptions (
    user_id,
    coupon_id,
    points_spent,
    status,
    metadata,
    created_at
  )
  VALUES (
    p_user_id,
    p_coupon_id,
    COALESCE(v_coupon.points_cost, 0),
    'success',
    jsonb_build_object(
      'source', 'redeem_coupon_rpc',
      'coupon_code', v_coupon.code
    ),
    v_now
  )
  RETURNING id INTO v_redemption_id;

  RETURN jsonb_build_object(
    'success', true,
    'coupon_id', p_coupon_id,
    'coupon_code', v_coupon.code,
    'redemption_id', v_redemption_id,
    'points_spent', COALESCE(v_coupon.points_cost, 0),
    'remaining_coins', v_remaining_coins,
    'created_at', v_now
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) RLS/Security hardening (payments, redemptions, partner bank secrets)
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.partner_bank_secrets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.payments') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'payments_select_own_or_service'
  ) THEN
    CREATE POLICY payments_select_own_or_service
      ON public.payments
      FOR SELECT
      USING (
        auth.role() = 'service_role'
        OR EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = payments.order_id
            AND o.user_id = auth.uid()
        )
      );
  END IF;

  IF to_regclass('public.payments') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'payments_insert_service_only'
  ) THEN
    CREATE POLICY payments_insert_service_only
      ON public.payments
      FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF to_regclass('public.payments') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'payments_update_service_only'
  ) THEN
    CREATE POLICY payments_update_service_only
      ON public.payments
      FOR UPDATE
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.redemptions') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'redemptions'
      AND policyname = 'redemptions_select_own_or_service'
  ) THEN
    CREATE POLICY redemptions_select_own_or_service
      ON public.redemptions
      FOR SELECT
      USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  IF to_regclass('public.redemptions') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'redemptions'
      AND policyname = 'redemptions_insert_own_or_service'
  ) THEN
    CREATE POLICY redemptions_insert_own_or_service
      ON public.redemptions
      FOR INSERT
      WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.partner_bank_secrets') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partner_bank_secrets'
      AND policyname = 'partner_bank_secrets_service_only'
  ) THEN
    CREATE POLICY partner_bank_secrets_service_only
      ON public.partner_bank_secrets
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.partner_bank_secrets') IS NULL THEN
    RETURN;
  END IF;

  REVOKE ALL ON TABLE public.partner_bank_secrets FROM anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.partner_bank_secrets TO service_role;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Maintenance automation (pg_cron best effort + manual fallback)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prune_analytics_logs'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.prune_analytics_logs()
      RETURNS void
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        DELETE FROM public.analytics_logs
        WHERE created_at < now() - interval '30 days';
      $body$;
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_old_notifications'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.cleanup_old_notifications()
      RETURNS void
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        DELETE FROM public.notifications
        WHERE is_read = true
          AND created_at < now() - interval '60 days';
      $body$;
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_old_moderation_data'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.cleanup_old_moderation_data()
      RETURNS void
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        DELETE FROM public.reports
        WHERE status IN ('dismissed','actioned')
          AND created_at < now() - INTERVAL '180 days';

        DELETE FROM public.moderation_logs
        WHERE created_at < now() - INTERVAL '365 days';
      $body$;
    $fn$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.run_maintenance_cleanup_now()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.prune_analytics_logs();
  PERFORM public.cleanup_old_notifications();
  PERFORM public.cleanup_old_moderation_data();

  RETURN jsonb_build_object(
    'success', true,
    'ran_at', now()
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'ran_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_analytics_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_moderation_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_maintenance_cleanup_now() TO service_role;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension unavailable: %', SQLERRM;
  END;

  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname IN (
      'vibecity-prune-analytics-logs',
      'vibecity-cleanup-notifications',
      'vibecity-cleanup-moderation'
    );

    PERFORM cron.schedule(
      'vibecity-prune-analytics-logs',
      '15 3 * * *',
      'SELECT public.prune_analytics_logs();'
    );

    PERFORM cron.schedule(
      'vibecity-cleanup-notifications',
      '30 3 * * *',
      'SELECT public.cleanup_old_notifications();'
    );

    PERFORM cron.schedule(
      'vibecity-cleanup-moderation',
      '45 3 * * *',
      'SELECT public.cleanup_old_moderation_data();'
    );
  ELSE
    RAISE NOTICE 'cron.job unavailable; maintenance schedules skipped';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'maintenance cron schedule skipped: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Data consistency: user_stats is source-of-truth for coins/xp/level
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_profile_from_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    user_id,
    coins,
    xp,
    level,
    updated_at
  )
  VALUES (
    NEW.user_id,
    COALESCE(NEW.coins, 0),
    COALESCE(NEW.xp, 0),
    GREATEST(1, COALESCE(NEW.level, 1)),
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    coins = EXCLUDED.coins,
    xp = EXCLUDED.xp,
    level = EXCLUDED.level,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_profile_from_stats ON public.user_stats;
CREATE TRIGGER trg_sync_user_profile_from_stats
AFTER INSERT OR UPDATE OF coins, xp, level
ON public.user_stats
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_profile_from_stats();

INSERT INTO public.user_profiles (
  user_id,
  coins,
  xp,
  level,
  updated_at
)
SELECT
  us.user_id,
  COALESCE(us.coins, 0),
  COALESCE(us.xp, 0),
  GREATEST(1, COALESCE(us.level, 1)),
  now()
FROM public.user_stats us
ON CONFLICT (user_id)
DO UPDATE SET
  coins = EXCLUDED.coins,
  xp = EXCLUDED.xp,
  level = EXCLUDED.level,
  updated_at = now();

COMMIT;
