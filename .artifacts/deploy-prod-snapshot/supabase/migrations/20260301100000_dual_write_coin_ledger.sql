-- =============================================================================
-- Migration: Dual-write coin ledger (safe, additive, non-breaking)
-- Date: 2026-03-01
--
-- Strategy: Dual-write = write to BOTH existing table AND coin_ledger in same tx.
-- Existing balance update stays untouched (Primary write — user-facing).
-- coin_ledger write is secondary (Audit trail — never read by UI yet).
-- Once verified correct over 7+ days, Phase 2 = flip reads to coin_ledger.
--
-- Tables touched (existing, no schema change):
--   visitor_gamification_stats.balance  ← Primary (unchanged)
--   user_stats.coins                    ← Primary (unchanged)
--   gamification_logs                   ← Shadow trail for visitors (additive)
--   coin_transactions                   ← Existing auth-user audit trail (already used)
--   coin_ledger                         ← New unified trail for auth users (additive)
--
-- Rollback: DROP this migration file and redeploy.
--           Old functions return automatically (they're CREATE OR REPLACE).
-- =============================================================================

BEGIN;

-- ==========================================================================
-- 1. claim_daily_checkin(p_visitor_id TEXT)
--    Add: INSERT INTO gamification_logs as shadow audit trail for visitors
--         (visitor coins have no ledger trail at all currently)
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

  -- PRIMARY WRITE (unchanged): update visitor_gamification_stats
  UPDATE public.visitor_gamification_stats
  SET streak = _streak,
      total_days = _total,
      balance = _balance,
      last_checkin_at = NOW(),
      updated_at = NOW()
  WHERE visitor_id = p_visitor_id;

  -- DUAL-WRITE (additive): shadow audit trail for visitors
  -- Allows reconciliation: SUM(coin_delta) per visitor_id vs current balance
  INSERT INTO public.gamification_logs (user_id, event_name, payload, created_at)
  VALUES (
    NULL,
    'claim_daily_checkin',
    jsonb_build_object(
      'visitor_id', p_visitor_id,
      'coin_delta', _reward,
      'new_balance', _balance,
      'streak', _streak,
      'total_days', _total,
      'source', 'dual_write_v1'
    ),
    NOW()
  );

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
-- 2. spin_lucky_wheel(p_visitor_id TEXT)
--    Add: INSERT INTO gamification_logs as shadow audit trail
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
  _prize_values  INT[]  := ARRAY[10, 20, 50, 0, 5, 100, 15, 0];
  _prize_codes   TEXT[] := ARRAY['coins_10','coins_20','coins_50','try_again','coins_5','coins_100','coins_15','vip_badge'];
  _prize_labels  TEXT[] := ARRAY['10 Coins','20 Coins','50 Coins','Try Again','5 Coins','100 Coins','15 Coins','VIP Badge'];
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

  -- PRIMARY WRITE (unchanged): update visitor_gamification_stats
  UPDATE public.visitor_gamification_stats
  SET balance = _balance,
      last_spin_at = NOW(),
      updated_at = NOW()
  WHERE visitor_id = p_visitor_id;

  -- DUAL-WRITE (additive): shadow audit trail
  IF _prize_coins > 0 THEN
    INSERT INTO public.gamification_logs (user_id, event_name, payload, created_at)
    VALUES (
      NULL,
      'spin_lucky_wheel',
      jsonb_build_object(
        'visitor_id', p_visitor_id,
        'coin_delta', _prize_coins,
        'new_balance', _balance,
        'prize_code', _prize_code,
        'prize_index', _prize_index - 1,
        'source', 'dual_write_v1'
      ),
      NOW()
    );
  END IF;

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
-- 3. grant_rewards(UUID, INTEGER, INTEGER, TEXT)
--    Add: INSERT INTO coin_ledger as shadow (coin_transactions already exists)
--    coin_ledger = future unified source of truth across visitor + auth
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.grant_rewards(
  target_user_id UUID,
  reward_coins   INTEGER,
  reward_xp      INTEGER,
  action_name    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_daily_count INTEGER;
  v_max_daily   INTEGER;
  v_new_coins   INTEGER;
  v_new_xp      INTEGER;
BEGIN
  -- Per-action daily limits
  CASE action_name
    WHEN 'daily_login'   THEN v_max_daily := 1;
    WHEN 'first_review'  THEN v_max_daily := 1;
    WHEN 'check_in'      THEN v_max_daily := 10;
    WHEN 'submit_shop'   THEN v_max_daily := 5;
    WHEN 'upload_photo'  THEN v_max_daily := 20;
    WHEN 'approve_shop'  THEN v_max_daily := 50;
    ELSE v_max_daily := 10;
  END CASE;

  -- Advisory lock serializes concurrent requests for same user+action
  PERFORM pg_advisory_xact_lock(
    hashtext(target_user_id::text),
    hashtext(action_name)
  );

  -- Atomic upsert: increment daily counter or insert first grant
  INSERT INTO public.reward_daily_limits (user_id, action_name, grant_date, grant_count)
  VALUES (target_user_id, action_name, CURRENT_DATE, 1)
  ON CONFLICT (user_id, action_name, grant_date)
  DO UPDATE SET grant_count = public.reward_daily_limits.grant_count + 1
  RETURNING grant_count INTO v_daily_count;

  -- Reject if over daily cap
  IF v_daily_count > v_max_daily THEN
    UPDATE public.reward_daily_limits
    SET grant_count = grant_count - 1
    WHERE user_id = target_user_id
      AND action_name = action_name
      AND grant_date = CURRENT_DATE;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'daily_limit_exceeded',
      'daily_count', v_daily_count - 1,
      'daily_max', v_max_daily
    );
  END IF;

  -- PRIMARY WRITE (unchanged): atomic upsert on user_stats
  INSERT INTO public.user_stats (user_id, coins, xp, level)
  VALUES (
    target_user_id,
    COALESCE(reward_coins, 0),
    COALESCE(reward_xp, 0),
    GREATEST(1, (COALESCE(reward_xp, 0) / 100) + 1)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET coins = public.user_stats.coins + COALESCE(reward_coins, 0),
        xp    = public.user_stats.xp + COALESCE(reward_xp, 0),
        level = GREATEST(1, ((public.user_stats.xp + COALESCE(reward_xp, 0)) / 100) + 1),
        updated_at = now()
  RETURNING coins, xp INTO v_new_coins, v_new_xp;

  -- Existing audit trail: coin_transactions (unchanged)
  IF COALESCE(reward_coins, 0) <> 0 THEN
    INSERT INTO public.coin_transactions (user_id, coin_delta, action_name, metadata)
    VALUES (target_user_id, reward_coins, action_name, '{}'::jsonb);
  END IF;

  IF COALESCE(reward_xp, 0) <> 0 THEN
    INSERT INTO public.xp_logs (user_id, xp_delta, action_name, metadata)
    VALUES (target_user_id, reward_xp, action_name, '{}'::jsonb);
  END IF;

  INSERT INTO public.gamification_logs (user_id, event_name, payload)
  VALUES (
    target_user_id,
    action_name,
    jsonb_build_object('reward_coins', reward_coins, 'reward_xp', reward_xp)
  );

  -- DUAL-WRITE (additive): coin_ledger — future unified source of truth
  -- Only write when there's a coin change (not XP-only events)
  IF COALESCE(reward_coins, 0) <> 0 THEN
    INSERT INTO public.coin_ledger (
      user_id, amount, description, transaction_type, idempotency_key, created_at
    ) VALUES (
      target_user_id,
      reward_coins,
      action_name,
      'reward',
      -- Idempotency key: user + action + date (matches daily_limits guard)
      target_user_id::text || ':' || action_name || ':' || CURRENT_DATE::text,
      NOW()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_coins', v_new_coins,
    'new_xp', v_new_xp,
    'daily_count', v_daily_count,
    'daily_max', v_max_daily
  );
END;
$$;

-- ==========================================================================
-- 4. Reconciliation helper — run manually to verify dual-write health
--    Returns rows where coin_ledger SUM disagrees with user_stats.coins
--    After 7+ days of dual-write, this should return 0 rows if all is well.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.reconcile_coin_balances(p_limit INT DEFAULT 100)
RETURNS TABLE(
  user_id UUID,
  stats_coins INTEGER,
  ledger_sum INTEGER,
  discrepancy INTEGER
) LANGUAGE SQL AS $$
  SELECT
    us.user_id,
    us.coins AS stats_coins,
    COALESCE(SUM(cl.amount), 0)::INTEGER AS ledger_sum,
    ABS(us.coins - COALESCE(SUM(cl.amount), 0)::INTEGER) AS discrepancy
  FROM public.user_stats us
  LEFT JOIN public.coin_ledger cl ON cl.user_id = us.user_id
  GROUP BY us.user_id, us.coins
  HAVING us.coins <> COALESCE(SUM(cl.amount), 0)::INTEGER
  ORDER BY discrepancy DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_coin_balances(INT) TO service_role;

-- ==========================================================================
-- 5. Visitor balance reconciliation helper
--    Compares visitor_gamification_stats.balance vs SUM of gamification_logs
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.reconcile_visitor_balances(p_limit INT DEFAULT 100)
RETURNS TABLE(
  visitor_id TEXT,
  stats_balance INTEGER,
  log_sum BIGINT,
  discrepancy BIGINT
) LANGUAGE SQL AS $$
  SELECT
    vgs.visitor_id,
    vgs.balance AS stats_balance,
    COALESCE(SUM((gl.payload->>'coin_delta')::INTEGER), 0) AS log_sum,
    ABS(vgs.balance - COALESCE(SUM((gl.payload->>'coin_delta')::INTEGER), 0)) AS discrepancy
  FROM public.visitor_gamification_stats vgs
  LEFT JOIN public.gamification_logs gl
    ON gl.payload->>'visitor_id' = vgs.visitor_id
    AND gl.payload->>'source' = 'dual_write_v1'
  GROUP BY vgs.visitor_id, vgs.balance
  HAVING vgs.balance <> COALESCE(SUM((gl.payload->>'coin_delta')::INTEGER), 0)
  ORDER BY discrepancy DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_visitor_balances(INT) TO service_role;

COMMIT;
