-- Purpose: Canonical subscription-ready orders schema + partner MVP schema with encrypted bank secrets.
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.orders, public.partners, public.partner_referrals, public.partner_commission_ledger, public.partner_payouts, private.partner_secrets
-- Risks (tier): High
-- Rollback plan:
--   - Keep added columns/tables (forward-fix preferred).
--   - Disable partner flags and recurring checkout if rollback is required.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS private;

-- Canonical columns for subscription lifecycle.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS partner_id UUID,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS renewal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_mode TEXT NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'purchase_mode'
  ) THEN
    ALTER TABLE public.orders
      DROP CONSTRAINT IF EXISTS orders_purchase_mode_check;
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_purchase_mode_check
      CHECK (purchase_mode IN ('one_time', 'subscription'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS orders_subscription_status_idx
  ON public.orders (subscription_status, renewal_at DESC);

CREATE INDEX IF NOT EXISTS orders_partner_id_idx
  ON public.orders (partner_id);

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_subscription_id_uidx
  ON public.orders (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Partner core profile.
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  subscription_plan TEXT NOT NULL DEFAULT 'partner_monthly_899',
  subscription_started_at TIMESTAMPTZ,
  subscription_renewal_at TIMESTAMPTZ,
  commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.2000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partners_referral_code_idx
  ON public.partners (referral_code);

CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'link',
  referral_code TEXT,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_id, venue_id)
);

CREATE INDEX IF NOT EXISTS partner_referrals_partner_id_idx
  ON public.partner_referrals (partner_id, attributed_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL, -- accrual | clawback | payout
  amount_thb NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'accrued',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_commission_ledger_partner_period_idx
  ON public.partner_commission_ledger (partner_id, period_end DESC);

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  payout_week_start TIMESTAMPTZ NOT NULL,
  payout_week_end TIMESTAMPTZ NOT NULL,
  gross_amount_thb NUMERIC(12, 2) NOT NULL DEFAULT 0,
  clawback_amount_thb NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_amount_thb NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled',
  transfer_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_id, payout_week_start, payout_week_end)
);

CREATE INDEX IF NOT EXISTS partner_payouts_partner_status_idx
  ON public.partner_payouts (partner_id, status, payout_week_end DESC);

-- Encrypted bank details (private schema).
CREATE TABLE IF NOT EXISTS private.partner_secrets (
  partner_id UUID PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  bank_code TEXT NOT NULL CHECK (bank_code IN ('KBANK', 'SCB')),
  account_name TEXT NOT NULL,
  account_number_enc BYTEA,
  promptpay_id_enc BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION private.partner_crypto_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := current_setting('app.settings.partner_data_key', true);
  IF COALESCE(v_key, '') = '' THEN
    v_key := current_setting('partner_data_key', true);
  END IF;
  IF COALESCE(v_key, '') = '' THEN
    RAISE EXCEPTION 'PARTNER_DATA_KEY is not configured';
  END IF;
  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION private.encrypt_partner_secret(p_plain TEXT)
RETURNS BYTEA
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT CASE
    WHEN p_plain IS NULL OR btrim(p_plain) = '' THEN NULL
    ELSE pgp_sym_encrypt(p_plain, private.partner_crypto_key())
  END;
$$;

CREATE OR REPLACE FUNCTION private.decrypt_partner_secret(p_cipher BYTEA)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT CASE
    WHEN p_cipher IS NULL THEN NULL
    ELSE pgp_sym_decrypt(p_cipher, private.partner_crypto_key())
  END;
$$;

CREATE OR REPLACE FUNCTION private.set_partner_secrets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_secrets_set_updated_at_trg ON private.partner_secrets;
CREATE TRIGGER partner_secrets_set_updated_at_trg
BEFORE UPDATE ON private.partner_secrets
FOR EACH ROW
EXECUTE FUNCTION private.set_partner_secrets_updated_at();

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.partner_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partners_select_own ON public.partners;
CREATE POLICY partners_select_own
ON public.partners
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS partners_update_own ON public.partners;
CREATE POLICY partners_update_own
ON public.partners
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS partner_referrals_select_own ON public.partner_referrals;
CREATE POLICY partner_referrals_select_own
ON public.partner_referrals
FOR SELECT TO authenticated
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS partner_commission_ledger_select_own ON public.partner_commission_ledger;
CREATE POLICY partner_commission_ledger_select_own
ON public.partner_commission_ledger
FOR SELECT TO authenticated
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS partner_payouts_select_own ON public.partner_payouts;
CREATE POLICY partner_payouts_select_own
ON public.partner_payouts
FOR SELECT TO authenticated
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS partner_secrets_select_own ON private.partner_secrets;
CREATE POLICY partner_secrets_select_own
ON private.partner_secrets
FOR SELECT TO authenticated
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS partner_secrets_update_own ON private.partner_secrets;
CREATE POLICY partner_secrets_update_own
ON private.partner_secrets
FOR UPDATE TO authenticated
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  )
);

-- Service role full access policies (documents intended access).
DROP POLICY IF EXISTS partners_service_all ON public.partners;
CREATE POLICY partners_service_all
ON public.partners
FOR ALL TO service_role
USING (TRUE)
WITH CHECK (TRUE);

DROP POLICY IF EXISTS partner_referrals_service_all ON public.partner_referrals;
CREATE POLICY partner_referrals_service_all
ON public.partner_referrals
FOR ALL TO service_role
USING (TRUE)
WITH CHECK (TRUE);

DROP POLICY IF EXISTS partner_commission_ledger_service_all ON public.partner_commission_ledger;
CREATE POLICY partner_commission_ledger_service_all
ON public.partner_commission_ledger
FOR ALL TO service_role
USING (TRUE)
WITH CHECK (TRUE);

DROP POLICY IF EXISTS partner_payouts_service_all ON public.partner_payouts;
CREATE POLICY partner_payouts_service_all
ON public.partner_payouts
FOR ALL TO service_role
USING (TRUE)
WITH CHECK (TRUE);

DROP POLICY IF EXISTS partner_secrets_service_all ON private.partner_secrets;
CREATE POLICY partner_secrets_service_all
ON private.partner_secrets
FOR ALL TO service_role
USING (TRUE)
WITH CHECK (TRUE);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_partner_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id);
  END IF;
END;
$$;

-- Weekly payout batch generation (Friday 17:00 Asia/Bangkok = 10:00 UTC).
CREATE OR REPLACE FUNCTION public.generate_partner_weekly_payouts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
  v_week_end TIMESTAMPTZ := date_trunc('minute', NOW());
  v_week_start TIMESTAMPTZ := v_week_end - INTERVAL '7 days';
BEGIN
  WITH agg AS (
    SELECT
      l.partner_id,
      SUM(CASE WHEN l.entry_type = 'accrual' THEN l.amount_thb ELSE 0 END) AS gross_amount_thb,
      SUM(CASE WHEN l.entry_type = 'clawback' THEN ABS(l.amount_thb) ELSE 0 END) AS clawback_amount_thb
    FROM public.partner_commission_ledger l
    WHERE l.status = 'accrued'
      AND l.period_end <= v_week_end
      AND l.period_end > v_week_start
    GROUP BY l.partner_id
  )
  INSERT INTO public.partner_payouts (
    partner_id,
    payout_week_start,
    payout_week_end,
    gross_amount_thb,
    clawback_amount_thb,
    net_amount_thb,
    status
  )
  SELECT
    a.partner_id,
    v_week_start,
    v_week_end,
    COALESCE(a.gross_amount_thb, 0),
    COALESCE(a.clawback_amount_thb, 0),
    GREATEST(COALESCE(a.gross_amount_thb, 0) - COALESCE(a.clawback_amount_thb, 0), 0),
    'scheduled'
  FROM agg a
  ON CONFLICT (partner_id, payout_week_start, payout_week_end) DO UPDATE
  SET
    gross_amount_thb = EXCLUDED.gross_amount_thb,
    clawback_amount_thb = EXCLUDED.clawback_amount_thb,
    net_amount_thb = EXCLUDED.net_amount_thb;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN COALESCE(v_rows, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_partner_weekly_payouts() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'partner_weekly_payouts_1700_bkk';

    PERFORM cron.schedule(
      'partner_weekly_payouts_1700_bkk',
      '0 10 * * 5',
      $cron$SELECT public.generate_partner_weekly_payouts();$cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END;
$$;
