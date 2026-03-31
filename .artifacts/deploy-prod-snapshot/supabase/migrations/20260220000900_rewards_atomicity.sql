-- Phase 07: Rewards Atomicity
-- Fixes SELECT→INSERT race condition in grant_rewards by adding:
-- 1. reward_daily_limits table with unique constraint (user_id, action_name, grant_date)
-- 2. pg_advisory_xact_lock to serialize per-user-action grants
-- 3. Per-action daily caps to prevent farming

-- ============================================================
-- 1. Daily limit tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reward_daily_limits (
  user_id      UUID    NOT NULL,
  action_name  TEXT    NOT NULL,
  grant_date   DATE    NOT NULL DEFAULT CURRENT_DATE,
  grant_count  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action_name, grant_date)
);

ALTER TABLE public.reward_daily_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reward limits"
  ON public.reward_daily_limits FOR SELECT
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_reward_daily_limits_lookup
  ON public.reward_daily_limits (user_id, action_name, grant_date);

-- ============================================================
-- 2. Atomic grant_rewards with advisory lock + daily cap
-- ============================================================
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
    WHEN 'approve_shop'  THEN v_max_daily := 50; -- admin action, generous cap
    ELSE v_max_daily := 10; -- safe default
  END CASE;

  -- Advisory lock serializes concurrent requests for same user+action.
  -- hashtext is deterministic: same (user,action) always gets same lock key.
  PERFORM pg_advisory_xact_lock(
    hashtext(target_user_id::text),
    hashtext(action_name)
  );

  -- Atomic upsert: increment daily counter or insert first grant.
  -- ON CONFLICT enforces uniqueness per (user, action, date).
  INSERT INTO public.reward_daily_limits (user_id, action_name, grant_date, grant_count)
  VALUES (target_user_id, action_name, CURRENT_DATE, 1)
  ON CONFLICT (user_id, action_name, grant_date)
  DO UPDATE SET grant_count = public.reward_daily_limits.grant_count + 1
  RETURNING grant_count INTO v_daily_count;

  -- Reject if over daily cap
  IF v_daily_count > v_max_daily THEN
    -- Roll back the counter increment (we're in a transaction)
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

  -- Grant: atomic upsert on user_stats
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

  -- Ledger entries (idempotent via the daily_limits guard above)
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

  RETURN jsonb_build_object(
    'success', true,
    'new_coins', v_new_coins,
    'new_xp', v_new_xp,
    'daily_count', v_daily_count,
    'daily_max', v_max_daily
  );
END;
$$;

-- Ensure grants are accessible
GRANT SELECT, INSERT, UPDATE ON public.reward_daily_limits TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_rewards(UUID, INTEGER, INTEGER, TEXT) TO authenticated, service_role;
