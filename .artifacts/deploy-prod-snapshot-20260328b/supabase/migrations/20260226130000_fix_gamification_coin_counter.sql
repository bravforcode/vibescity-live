-- =============================================================================
-- Migration: Fix gamification RPCs to use visitor_gamification_stats
-- Date: 2026-02-26
-- Root Cause:
--   RPCs (get_daily_checkin_status, claim_daily_checkin, spin_lucky_wheel, etc.)
--   were targeting `user_stats` which has `user_id UUID NOT NULL` as PK.
--   Anonymous visitors have no UUID → INSERT fails with NOT NULL violation.
--   The correct table is `visitor_gamification_stats` (PK = visitor_id TEXT).
-- =============================================================================

BEGIN;

-- Drop conflicting RPC versions (both no-arg and p_visitor_id variants)
DROP FUNCTION IF EXISTS public.get_daily_checkin_status();
DROP FUNCTION IF EXISTS public.get_daily_checkin_status(TEXT);
DROP FUNCTION IF EXISTS public.claim_daily_checkin();
DROP FUNCTION IF EXISTS public.claim_daily_checkin(TEXT);
DROP FUNCTION IF EXISTS public.get_lucky_wheel_status();
DROP FUNCTION IF EXISTS public.get_lucky_wheel_status(TEXT);
DROP FUNCTION IF EXISTS public.spin_lucky_wheel();
DROP FUNCTION IF EXISTS public.spin_lucky_wheel(TEXT);

-- ==========================================================================
-- 1. get_daily_checkin_status(p_visitor_id)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.get_daily_checkin_status(p_visitor_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  _streak INT := 0;
  _total INT := 0;
  _balance INT := 0;
  _last_checkin TIMESTAMPTZ;
  _can_claim BOOLEAN := true;
BEGIN
  SELECT streak, total_days, balance, last_checkin_at
  INTO _streak, _total, _balance, _last_checkin
  FROM public.visitor_gamification_stats
  WHERE visitor_id = p_visitor_id;

  IF NOT FOUND THEN
    INSERT INTO public.visitor_gamification_stats (visitor_id, streak, total_days, balance)
    VALUES (p_visitor_id, 0, 0, 0)
    ON CONFLICT (visitor_id) DO NOTHING;
    _streak := 0; _total := 0; _balance := 0; _can_claim := true;
  ELSE
    IF _last_checkin IS NOT NULL AND _last_checkin::date = CURRENT_DATE THEN
      _can_claim := false;
    END IF;
  END IF;

  result := json_build_object(
    'streak', _streak,
    'total_days', _total,
    'balance', _balance,
    'last_checkin_at', _last_checkin,
    'can_claim_today', _can_claim
  );
  RETURN result;
END;
$$;

-- ==========================================================================
-- 2. claim_daily_checkin(p_visitor_id)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.claim_daily_checkin(p_visitor_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  _streak INT;
  _total INT;
  _balance INT;
  _last_checkin TIMESTAMPTZ;
  _reward INT;
  _day_index INT;
  _rewards INT[] := ARRAY[10, 15, 20, 25, 30, 40, 100];
BEGIN
  SELECT streak, total_days, balance, last_checkin_at
  INTO _streak, _total, _balance, _last_checkin
  FROM public.visitor_gamification_stats
  WHERE visitor_id = p_visitor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.visitor_gamification_stats (visitor_id, streak, total_days, balance, last_checkin_at)
    VALUES (p_visitor_id, 0, 0, 0, NULL);
    _streak := 0; _total := 0; _balance := 0; _last_checkin := NULL;
  END IF;

  -- Already claimed today
  IF _last_checkin IS NOT NULL AND _last_checkin::date = CURRENT_DATE THEN
    result := json_build_object(
      'already_claimed', true,
      'streak', _streak,
      'total_days', _total,
      'balance', _balance,
      'claimed_at', _last_checkin
    );
    RETURN result;
  END IF;

  -- Check if streak continues (yesterday) or resets
  IF _last_checkin IS NOT NULL AND _last_checkin::date = CURRENT_DATE - 1 THEN
    _streak := _streak + 1;
  ELSE
    _streak := 1;
  END IF;

  _total := _total + 1;
  _day_index := ((_streak - 1) % 7) + 1;
  _reward := _rewards[_day_index];
  _balance := _balance + _reward;

  UPDATE public.visitor_gamification_stats
  SET streak = _streak,
      total_days = _total,
      balance = _balance,
      last_checkin_at = NOW(),
      updated_at = NOW()
  WHERE visitor_id = p_visitor_id;

  result := json_build_object(
    'already_claimed', false,
    'streak', _streak,
    'total_days', _total,
    'balance', _balance,
    'reward_coins', _reward,
    'claimed_at', NOW()
  );
  RETURN result;
END;
$$;

-- ==========================================================================
-- 3. get_lucky_wheel_status(p_visitor_id)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.get_lucky_wheel_status(p_visitor_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  _last_spin TIMESTAMPTZ;
  _can_spin BOOLEAN := true;
  _balance INT := 0;
BEGIN
  SELECT last_spin_at, balance
  INTO _last_spin, _balance
  FROM public.visitor_gamification_stats
  WHERE visitor_id = p_visitor_id;

  IF NOT FOUND THEN
    INSERT INTO public.visitor_gamification_stats (visitor_id, streak, total_days, balance)
    VALUES (p_visitor_id, 0, 0, 0)
    ON CONFLICT (visitor_id) DO NOTHING;
    _can_spin := true; _balance := 0;
  ELSE
    IF _last_spin IS NOT NULL AND _last_spin::date = CURRENT_DATE THEN
      _can_spin := false;
    END IF;
  END IF;

  result := json_build_object(
    'can_spin_today', _can_spin,
    'last_spin_at', _last_spin,
    'balance', _balance
  );
  RETURN result;
END;
$$;

-- ==========================================================================
-- 4. spin_lucky_wheel(p_visitor_id)
--    Returns prize_code matching LuckyWheel.vue codes:
--    coins_10, coins_20, coins_50, try_again, coins_5, coins_100, coins_15, vip_badge
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.spin_lucky_wheel(p_visitor_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  _last_spin TIMESTAMPTZ;
  _balance INT;
  _prize_index INT;
  _prize_coins INT;
  _prize_code TEXT;
  -- Aligned with LuckyWheel.vue prizes array (1-indexed)
  _prize_values  INT[]  := ARRAY[10, 20, 50, 0, 5, 100, 15, 0];
  _prize_codes   TEXT[] := ARRAY['coins_10','coins_20','coins_50','try_again','coins_5','coins_100','coins_15','vip_badge'];
  _prize_labels  TEXT[] := ARRAY['10 Coins','20 Coins','50 Coins','Try Again','5 Coins','100 Coins','15 Coins','VIP Badge'];
  -- Weighted random: total = 100
  _weights INT[] := ARRAY[25, 20, 8, 15, 15, 2, 10, 5];
  _roll INT;
  _cumulative INT := 0;
BEGIN
  SELECT last_spin_at, balance
  INTO _last_spin, _balance
  FROM public.visitor_gamification_stats
  WHERE visitor_id = p_visitor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.visitor_gamification_stats (visitor_id, streak, total_days, balance, last_spin_at)
    VALUES (p_visitor_id, 0, 0, 0, NULL);
    _last_spin := NULL; _balance := 0;
  END IF;

  IF _last_spin IS NOT NULL AND _last_spin::date = CURRENT_DATE THEN
    result := json_build_object(
      'already_spun', true,
      'balance', _balance
    );
    RETURN result;
  END IF;

  -- Weighted random prize selection
  _roll := floor(random() * 100)::int;
  FOR i IN 1..8 LOOP
    _cumulative := _cumulative + _weights[i];
    IF _roll < _cumulative THEN
      _prize_index := i;
      EXIT;
    END IF;
  END LOOP;

  _prize_coins := _prize_values[_prize_index];
  _prize_code  := _prize_codes[_prize_index];
  _balance     := COALESCE(_balance, 0) + _prize_coins;

  UPDATE public.visitor_gamification_stats
  SET balance = _balance,
      last_spin_at = NOW(),
      updated_at = NOW()
  WHERE visitor_id = p_visitor_id;

  result := json_build_object(
    'already_spun', false,
    'prize_index', _prize_index - 1,
    'prize_coins', _prize_coins,
    'prize_code', _prize_code,
    'prize_label', _prize_labels[_prize_index],
    'balance', _balance
  );
  RETURN result;
END;
$$;

-- ==========================================================================
-- Grant execute to anon + authenticated (works for everyone)
-- ==========================================================================
GRANT EXECUTE ON FUNCTION public.get_daily_checkin_status(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_checkin(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_lucky_wheel_status(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spin_lucky_wheel(TEXT) TO anon, authenticated, service_role;

-- Ensure RLS is enabled with permissive policies for the visitor table
ALTER TABLE public.visitor_gamification_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'vgs_anon_select' AND tablename = 'visitor_gamification_stats'
  ) THEN
    EXECUTE 'CREATE POLICY vgs_anon_select ON public.visitor_gamification_stats FOR SELECT TO anon USING (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'vgs_anon_insert' AND tablename = 'visitor_gamification_stats'
  ) THEN
    EXECUTE 'CREATE POLICY vgs_anon_insert ON public.visitor_gamification_stats FOR INSERT TO anon WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'vgs_anon_update' AND tablename = 'visitor_gamification_stats'
  ) THEN
    EXECUTE 'CREATE POLICY vgs_anon_update ON public.visitor_gamification_stats FOR UPDATE TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
