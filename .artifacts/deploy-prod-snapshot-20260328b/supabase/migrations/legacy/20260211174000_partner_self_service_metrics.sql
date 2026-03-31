-- Purpose: Partner self-service RPCs + dashboard metrics + missing insert policies
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.partners, private.partner_secrets, public.create_partner_profile, public.upsert_partner_secrets, public.get_partner_dashboard_metrics
-- Risks (tier): High
-- Rollback plan:
--   - Disable feature flag enable_partner_program.
--   - Revoke EXECUTE on new RPCs if needed.

CREATE SCHEMA IF NOT EXISTS private;

DROP POLICY IF EXISTS partners_insert_own ON public.partners;
CREATE POLICY partners_insert_own
ON public.partners
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS partner_secrets_insert_own ON private.partner_secrets;
CREATE POLICY partner_secrets_insert_own
ON private.partner_secrets
FOR INSERT TO authenticated
WITH CHECK (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.create_partner_profile(
  p_display_name TEXT,
  p_referral_code TEXT DEFAULT NULL
)
RETURNS public.partners
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_partner public.partners;
  v_code TEXT;
  v_try INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_partner
  FROM public.partners
  WHERE user_id = v_uid
  LIMIT 1;

  IF FOUND THEN
    RETURN v_partner;
  END IF;

  v_code := UPPER(REGEXP_REPLACE(COALESCE(p_referral_code, ''), '[^A-Za-z0-9_-]', '', 'g'));
  IF v_code = '' THEN
    v_code := NULL;
  END IF;

  IF v_code IS NOT NULL THEN
    IF LENGTH(v_code) < 4 OR LENGTH(v_code) > 24 THEN
      RAISE EXCEPTION 'Referral code length must be between 4 and 24 characters';
    END IF;
  END IF;

  FOR v_try IN 1..8 LOOP
    IF v_code IS NULL THEN
      v_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
    END IF;

    BEGIN
      INSERT INTO public.partners (
        user_id,
        display_name,
        referral_code,
        status,
        subscription_status
      )
      VALUES (
        v_uid,
        COALESCE(NULLIF(BTRIM(p_display_name), ''), 'VibeCity Partner'),
        v_code,
        'active',
        'inactive'
      )
      RETURNING * INTO v_partner;

      RETURN v_partner;
    EXCEPTION
      WHEN unique_violation THEN
        v_code := NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Unable to generate unique referral code';
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_partner_profile(TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_partner_secrets(
  p_bank_code TEXT,
  p_account_name TEXT,
  p_account_number TEXT DEFAULT NULL,
  p_promptpay_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_partner_id UUID;
  v_bank_code TEXT := UPPER(COALESCE(BTRIM(p_bank_code), ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_bank_code NOT IN ('KBANK', 'SCB') THEN
    RAISE EXCEPTION 'Unsupported bank_code';
  END IF;

  SELECT id
  INTO v_partner_id
  FROM public.partners
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Partner profile not found';
  END IF;

  INSERT INTO private.partner_secrets (
    partner_id,
    bank_code,
    account_name,
    account_number_enc,
    promptpay_id_enc
  )
  VALUES (
    v_partner_id,
    v_bank_code,
    COALESCE(NULLIF(BTRIM(p_account_name), ''), 'N/A'),
    private.encrypt_partner_secret(NULLIF(BTRIM(p_account_number), '')),
    private.encrypt_partner_secret(NULLIF(BTRIM(p_promptpay_id), ''))
  )
  ON CONFLICT (partner_id)
  DO UPDATE SET
    bank_code = EXCLUDED.bank_code,
    account_name = EXCLUDED.account_name,
    account_number_enc = EXCLUDED.account_number_enc,
    promptpay_id_enc = EXCLUDED.promptpay_id_enc,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_partner_secrets(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_partner_dashboard_metrics()
RETURNS TABLE (
  partner_id UUID,
  referral_code TEXT,
  referred_venues BIGINT,
  subscription_orders BIGINT,
  renewal_orders BIGINT,
  accrued_balance NUMERIC,
  scheduled_payout NUMERIC,
  lifetime_commission NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_partner_id UUID;
  v_referral_code TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT p.id, p.referral_code
  INTO v_partner_id, v_referral_code
  FROM public.partners p
  WHERE p.user_id = v_uid
  LIMIT 1;

  IF v_partner_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_partner_id,
    v_referral_code,
    COALESCE((
      SELECT COUNT(*)
      FROM public.partner_referrals pr
      WHERE pr.partner_id = v_partner_id
    ), 0)::BIGINT,
    COALESCE((
      SELECT COUNT(*)
      FROM public.orders o
      WHERE o.partner_id = v_partner_id
        AND o.purchase_mode = 'subscription'
        AND o.status IN ('paid', 'completed')
    ), 0)::BIGINT,
    COALESCE((
      SELECT COUNT(*)
      FROM public.orders o
      WHERE o.partner_id = v_partner_id
        AND o.purchase_mode = 'subscription'
        AND o.subscription_status IN ('active', 'trialing', 'past_due')
    ), 0)::BIGINT,
    COALESCE((
      SELECT SUM(l.amount_thb)
      FROM public.partner_commission_ledger l
      WHERE l.partner_id = v_partner_id
        AND l.status = 'accrued'
    ), 0::NUMERIC),
    COALESCE((
      SELECT SUM(p.net_amount_thb)
      FROM public.partner_payouts p
      WHERE p.partner_id = v_partner_id
        AND p.status = 'scheduled'
    ), 0::NUMERIC),
    COALESCE((
      SELECT SUM(
        CASE
          WHEN l.entry_type = 'clawback' THEN -ABS(l.amount_thb)
          ELSE l.amount_thb
        END
      )
      FROM public.partner_commission_ledger l
      WHERE l.partner_id = v_partner_id
    ), 0::NUMERIC);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_dashboard_metrics() TO authenticated, service_role;
