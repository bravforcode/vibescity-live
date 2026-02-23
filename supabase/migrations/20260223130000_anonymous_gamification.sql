-- =============================================================================
-- Migration: Update RPCs to accept visitor_id (no login required)
-- Date: 2026-02-23 (Migration #4)
-- =============================================================================

BEGIN;

-- Drop existing RPCs that require auth.uid()
DROP FUNCTION IF EXISTS public.get_daily_checkin_status();
DROP FUNCTION IF EXISTS public.claim_daily_checkin();
DROP FUNCTION IF EXISTS public.get_lucky_wheel_status();
DROP FUNCTION IF EXISTS public.spin_lucky_wheel();

-- ==========================================================================
-- Recreate RPCs with p_visitor_id parameter (works without login)
-- ==========================================================================

-- 1. get_daily_checkin_status(p_visitor_id)
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
  FROM public.user_stats
  WHERE visitor_id = p_visitor_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_stats (visitor_id, streak, total_days, balance, coins)
    VALUES (p_visitor_id, 0, 0, 0, 0)
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

-- 2. claim_daily_checkin(p_visitor_id)
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
  FROM public.user_stats
  WHERE visitor_id = p_visitor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_stats (visitor_id, streak, total_days, balance, coins, last_checkin_at)
    VALUES (p_visitor_id, 0, 0, 0, 0, NULL);
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

  UPDATE public.user_stats
  SET streak = _streak,
      total_days = _total,
      balance = _balance,
      coins = _balance,
      last_checkin_at = NOW(),
      check_ins_count = COALESCE(check_ins_count, 0) + 1
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

-- 3. get_lucky_wheel_status(p_visitor_id)
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
  FROM public.user_stats
  WHERE visitor_id = p_visitor_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_stats (visitor_id, streak, total_days, balance, coins)
    VALUES (p_visitor_id, 0, 0, 0, 0)
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

-- 4. spin_lucky_wheel(p_visitor_id)
CREATE OR REPLACE FUNCTION public.spin_lucky_wheel(p_visitor_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  _last_spin TIMESTAMPTZ;
  _balance INT;
  _prize_index INT;
  _prize_coins INT;
  _prizes INT[] := ARRAY[10, 20, 5, 50, 15, 30, 0, 25];
  _prize_labels TEXT[] := ARRAY['10 Coins', '20 Coins', '5 Coins', '50 Coins', '15 Coins', '30 Coins', 'Try Again', '25 Coins'];
BEGIN
  SELECT last_spin_at, balance
  INTO _last_spin, _balance
  FROM public.user_stats
  WHERE visitor_id = p_visitor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_stats (visitor_id, streak, total_days, balance, coins, last_spin_at)
    VALUES (p_visitor_id, 0, 0, 0, 0, NULL);
    _last_spin := NULL; _balance := 0;
  END IF;

  IF _last_spin IS NOT NULL AND _last_spin::date = CURRENT_DATE THEN
    result := json_build_object(
      'already_spun', true,
      'balance', _balance
    );
    RETURN result;
  END IF;

  -- Random prize (1-8)
  _prize_index := floor(random() * 8)::int + 1;
  _prize_coins := _prizes[_prize_index];
  _balance := COALESCE(_balance, 0) + _prize_coins;

  UPDATE public.user_stats
  SET balance = _balance,
      coins = _balance,
      last_spin_at = NOW()
  WHERE visitor_id = p_visitor_id;

  result := json_build_object(
    'already_spun', false,
    'prize_index', _prize_index - 1,
    'prize_coins', _prize_coins,
    'prize_label', _prize_labels[_prize_index],
    'balance', _balance
  );
  RETURN result;
END;
$$;

-- Ensure user_stats has visitor_id as unique key and last_spin_at column
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS visitor_id TEXT;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS last_spin_at TIMESTAMPTZ;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS last_checkin_at TIMESTAMPTZ;

-- Create unique index on visitor_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'user_stats' AND indexname = 'idx_user_stats_visitor_id'
  ) THEN
    CREATE UNIQUE INDEX idx_user_stats_visitor_id ON public.user_stats (visitor_id);
  END IF;
END $$;

-- Grant execute to anon (no login needed)
GRANT EXECUTE ON FUNCTION public.get_daily_checkin_status(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_checkin(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_lucky_wheel_status(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.spin_lucky_wheel(TEXT) TO anon;

COMMIT;
