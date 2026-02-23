-- =============================================================================
-- TRIAD Commerce Contract
-- Purpose:
--   - Ensure orders/payments/subscriptions/redemptions/partners contract exists
--   - Keep migration idempotent and compatible with existing environments
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  visitor_id TEXT,
  venue_id UUID,
  sku TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_order_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  renewal_at TIMESTAMPTZ,
  partner_id UUID,
  slip_url TEXT,
  slip_image_hash TEXT,
  slip_text_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS visitor_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS venue_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS provider_order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS renewal_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS partner_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS slip_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS slip_image_hash TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS slip_text_hash TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT,
  provider_payment_id TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  visitor_id TEXT,
  venue_id UUID,
  stripe_subscription_id TEXT,
  plan_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS visitor_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS venue_id UUID;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_code TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  coupon_id INTEGER NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  points_spent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  name TEXT,
  referral_code TEXT UNIQUE,
  commission_rate NUMERIC(6,4) NOT NULL DEFAULT 0.10,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6,4) NOT NULL DEFAULT 0.10;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.partner_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'pending',
  payout_reference TEXT,
  payout_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  orders_tbl regclass := to_regclass('public.orders');
  subs_tbl regclass := to_regclass('public.subscriptions');
  partners_tbl regclass := to_regclass('public.partners');
BEGIN
  IF orders_tbl IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_status_check' AND conrelid = orders_tbl
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_status_check
      CHECK (status IN ('pending','pending_review','verified','rejected','paid','failed','cancelled'))
      NOT VALID;
  END IF;
  IF orders_tbl IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_status_check' AND conrelid = orders_tbl
  ) THEN
    ALTER TABLE public.orders VALIDATE CONSTRAINT orders_status_check;
  END IF;

  IF subs_tbl IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_status_check' AND conrelid = subs_tbl
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_status_check
      CHECK (status IN ('active','paused','cancelled','expired','trialing'))
      NOT VALID;
  END IF;
  IF subs_tbl IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_status_check' AND conrelid = subs_tbl
  ) THEN
    ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_status_check;
  END IF;

  IF partners_tbl IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partners_status_check' AND conrelid = partners_tbl
  ) THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_status_check
      CHECK (status IN ('active','inactive','blocked'))
      NOT VALID;
  END IF;
  IF partners_tbl IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partners_status_check' AND conrelid = partners_tbl
  ) THEN
    ALTER TABLE public.partners VALIDATE CONSTRAINT partners_status_check;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_provider_id
  ON public.orders (provider, provider_order_id)
  WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_stripe_subscription_id
  ON public.orders (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_slip_url_active
  ON public.orders (slip_url)
  WHERE slip_url IS NOT NULL
    AND status IN ('pending','pending_review','verified');

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_visitor_id ON public.orders (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_venue_id ON public.orders (venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_visitor_id ON public.subscriptions (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_venue_id ON public.subscriptions (venue_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_user_id ON public.redemptions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_memberships_user_id ON public.partner_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_id ON public.partner_payouts (partner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.slip_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID,
  visitor_id TEXT,
  consent_personal_data BOOLEAN NOT NULL DEFAULT FALSE,
  buyer_full_name TEXT,
  buyer_phone TEXT,
  buyer_email TEXT,
  buyer_address_line1 TEXT,
  buyer_address_line2 TEXT,
  buyer_country TEXT,
  buyer_province TEXT,
  buyer_district TEXT,
  buyer_postal TEXT,
  ip_address TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  geo_country TEXT,
  geo_region TEXT,
  geo_city TEXT,
  geo_postal TEXT,
  geo_timezone TEXT,
  geo_loc TEXT,
  geo_org TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slip_audit_order_id ON public.slip_audit (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slip_audit_visitor_id ON public.slip_audit (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slip_audit_ip_hash ON public.slip_audit (ip_hash, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'redeem_coupon'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_coupon_id integer'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.redeem_coupon(p_user_id uuid, p_coupon_id integer)
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        v_now timestamptz := now();
      BEGIN
        INSERT INTO public.redemptions (user_id, coupon_id, points_spent, status, metadata, created_at)
        VALUES (p_user_id, p_coupon_id, 0, 'success', '{"source":"fallback"}'::jsonb, v_now);

        RETURN jsonb_build_object(
          'success', true,
          'coupon_id', p_coupon_id,
          'created_at', v_now
        );
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', SQLERRM
        );
      END;
      $body$;
    $fn$;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon(uuid, integer) TO authenticated, service_role;

COMMIT;
