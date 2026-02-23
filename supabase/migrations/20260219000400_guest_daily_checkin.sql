-- Guest Daily Check-in RPCs
-- Mirrors the lucky wheel guest pattern: visitor_id based, no auth required.

-- Ensure daily_checkins table supports guest mode
ALTER TABLE IF EXISTS daily_checkins
  ADD COLUMN IF NOT EXISTS visitor_id text;

-- Unique constraint: one checkin per visitor per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_checkins_visitor_date
  ON daily_checkins (visitor_id, checkin_date)
  WHERE visitor_id IS NOT NULL;

-- ── guest_daily_checkin_status ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guest_daily_checkin_status(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last record;
  v_streak int := 0;
  v_total int := 0;
  v_can_claim boolean := true;
  v_balance int := 0;
BEGIN
  -- Get latest checkin for this visitor
  SELECT *
    INTO v_last
    FROM daily_checkins
   WHERE visitor_id = p_visitor_id
   ORDER BY checkin_date DESC
   LIMIT 1;

  IF v_last IS NOT NULL THEN
    -- Already claimed today?
    IF v_last.checkin_date = CURRENT_DATE THEN
      v_can_claim := false;
    END IF;

    -- Calculate streak
    IF v_last.checkin_date = CURRENT_DATE THEN
      v_streak := COALESCE(v_last.streak, 1);
    ELSIF v_last.checkin_date = CURRENT_DATE - 1 THEN
      v_streak := COALESCE(v_last.streak, 0);
    ELSE
      v_streak := 0; -- streak broken
    END IF;
  END IF;

  -- Total days checked in
  SELECT count(*), COALESCE(sum(reward_coins), 0)
    INTO v_total, v_balance
    FROM daily_checkins
   WHERE visitor_id = p_visitor_id;

  RETURN jsonb_build_object(
    'streak', v_streak,
    'total_days', v_total,
    'last_checkin_at', v_last.checkin_date,
    'balance', v_balance,
    'can_claim_today', v_can_claim
  );
END;
$$;

-- ── guest_claim_daily_checkin ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guest_claim_daily_checkin(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last record;
  v_streak int := 1;
  v_day_index int;
  v_reward int;
  v_total int;
  v_balance int;
  v_rewards int[] := ARRAY[10, 15, 20, 25, 30, 40, 100];
BEGIN
  -- Check if already claimed today
  SELECT *
    INTO v_last
    FROM daily_checkins
   WHERE visitor_id = p_visitor_id
     AND checkin_date = CURRENT_DATE
   LIMIT 1;

  IF v_last IS NOT NULL THEN
    -- Already claimed — return current state
    SELECT count(*), COALESCE(sum(reward_coins), 0)
      INTO v_total, v_balance
      FROM daily_checkins
     WHERE visitor_id = p_visitor_id;

    RETURN jsonb_build_object(
      'already_claimed', true,
      'streak', COALESCE(v_last.streak, 1),
      'total_days', v_total,
      'balance', v_balance,
      'claimed_at', v_last.checkin_date
    );
  END IF;

  -- Calculate streak from yesterday
  SELECT *
    INTO v_last
    FROM daily_checkins
   WHERE visitor_id = p_visitor_id
     AND checkin_date = CURRENT_DATE - 1
   LIMIT 1;

  IF v_last IS NOT NULL THEN
    v_streak := COALESCE(v_last.streak, 0) + 1;
  ELSE
    v_streak := 1;
  END IF;

  -- Reward based on streak day (1-indexed, cycles every 7)
  v_day_index := ((v_streak - 1) % 7) + 1;
  v_reward := v_rewards[v_day_index];

  -- Insert checkin
  INSERT INTO daily_checkins (visitor_id, checkin_date, streak, reward_coins)
  VALUES (p_visitor_id, CURRENT_DATE, v_streak, v_reward);

  -- Get totals
  SELECT count(*), COALESCE(sum(reward_coins), 0)
    INTO v_total, v_balance
    FROM daily_checkins
   WHERE visitor_id = p_visitor_id;

  RETURN jsonb_build_object(
    'already_claimed', false,
    'streak', v_streak,
    'reward_coins', v_reward,
    'total_days', v_total,
    'balance', v_balance,
    'claimed_at', CURRENT_DATE
  );
END;
$$;

-- Grant access to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.guest_daily_checkin_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_claim_daily_checkin(text) TO anon, authenticated;
