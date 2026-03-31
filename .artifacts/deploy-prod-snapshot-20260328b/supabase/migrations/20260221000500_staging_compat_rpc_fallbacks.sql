-- =============================================================================
-- Staging Compat RPC Fallbacks (Forward-Only)
-- Purpose:
--   - Fill missing reward/check-in runtime objects
--   - Provide safe_check_in + grant_rewards fallbacks used by API call-sites
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id TEXT,
  note TEXT,
  checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_checkins ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.daily_checkins ADD COLUMN IF NOT EXISTS venue_id TEXT;
ALTER TABLE public.daily_checkins ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.daily_checkins ADD COLUMN IF NOT EXISTS checkin_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.daily_checkins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  coin_delta INTEGER NOT NULL,
  action_name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS coin_delta INTEGER;
ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS action_name TEXT;
ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.coin_transactions SET coin_delta = 0 WHERE coin_delta IS NULL;
UPDATE public.coin_transactions SET action_name = 'unknown' WHERE action_name IS NULL OR TRIM(action_name) = '';
ALTER TABLE public.coin_transactions ALTER COLUMN coin_delta SET NOT NULL;
ALTER TABLE public.coin_transactions ALTER COLUMN action_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.xp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  xp_delta INTEGER NOT NULL,
  action_name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.xp_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.xp_logs ADD COLUMN IF NOT EXISTS xp_delta INTEGER;
ALTER TABLE public.xp_logs ADD COLUMN IF NOT EXISTS action_name TEXT;
ALTER TABLE public.xp_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.xp_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.xp_logs SET xp_delta = 0 WHERE xp_delta IS NULL;
UPDATE public.xp_logs SET action_name = 'unknown' WHERE action_name IS NULL OR TRIM(action_name) = '';
ALTER TABLE public.xp_logs ALTER COLUMN xp_delta SET NOT NULL;
ALTER TABLE public.xp_logs ALTER COLUMN action_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.gamification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gamification_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.gamification_logs ADD COLUMN IF NOT EXISTS event_name TEXT;
ALTER TABLE public.gamification_logs ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.gamification_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.gamification_logs SET event_name = 'unknown' WHERE event_name IS NULL OR TRIM(event_name) = '';
ALTER TABLE public.gamification_logs ALTER COLUMN event_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id UUID PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  submissions_count INTEGER NOT NULL DEFAULT 0,
  check_ins_count INTEGER NOT NULL DEFAULT 0,
  photos_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS coins INTEGER;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS xp INTEGER;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS level INTEGER;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS submissions_count INTEGER;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS check_ins_count INTEGER;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS photos_count INTEGER;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.user_stats SET coins = 0 WHERE coins IS NULL;
UPDATE public.user_stats SET xp = 0 WHERE xp IS NULL;
UPDATE public.user_stats SET level = 1 WHERE level IS NULL OR level < 1;
UPDATE public.user_stats SET submissions_count = 0 WHERE submissions_count IS NULL;
UPDATE public.user_stats SET check_ins_count = 0 WHERE check_ins_count IS NULL;
UPDATE public.user_stats SET photos_count = 0 WHERE photos_count IS NULL;

ALTER TABLE public.user_stats ALTER COLUMN coins SET DEFAULT 0;
ALTER TABLE public.user_stats ALTER COLUMN xp SET DEFAULT 0;
ALTER TABLE public.user_stats ALTER COLUMN level SET DEFAULT 1;
ALTER TABLE public.user_stats ALTER COLUMN submissions_count SET DEFAULT 0;
ALTER TABLE public.user_stats ALTER COLUMN check_ins_count SET DEFAULT 0;
ALTER TABLE public.user_stats ALTER COLUMN photos_count SET DEFAULT 0;

ALTER TABLE public.user_stats ALTER COLUMN coins SET NOT NULL;
ALTER TABLE public.user_stats ALTER COLUMN xp SET NOT NULL;
ALTER TABLE public.user_stats ALTER COLUMN level SET NOT NULL;
ALTER TABLE public.user_stats ALTER COLUMN submissions_count SET NOT NULL;
ALTER TABLE public.user_stats ALTER COLUMN check_ins_count SET NOT NULL;
ALTER TABLE public.user_stats ALTER COLUMN photos_count SET NOT NULL;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, checkin_date
      ORDER BY created_at ASC NULLS FIRST, id ASC
    ) AS rn
  FROM public.daily_checkins
)
DELETE FROM public.daily_checkins d
USING ranked r
WHERE d.ctid = r.ctid
  AND r.rn > 1;

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date
  ON public.daily_checkins (user_id, checkin_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_checkins_user_date
  ON public.daily_checkins (user_id, checkin_date);

CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_created
  ON public.coin_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_logs_user_created
  ON public.xp_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gamification_logs_user_created
  ON public.gamification_logs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public._safe_check_in_base(
  p_user_id UUID,
  p_venue_id_text TEXT,
  p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_exists BOOLEAN := FALSE;
  v_row public.daily_checkins%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'invalid_user');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT || '::' || v_today::TEXT));

  SELECT EXISTS (
    SELECT 1
    FROM public.daily_checkins
    WHERE user_id = p_user_id
      AND checkin_date = v_today
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'already_checked_in');
  END IF;

  INSERT INTO public.daily_checkins (user_id, venue_id, note, checkin_date)
  VALUES (
    p_user_id,
    NULLIF(TRIM(COALESCE(p_venue_id_text, '')), ''),
    NULLIF(TRIM(COALESCE(p_note, '')), ''),
    v_today
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'venue_id', v_row.venue_id,
      'note', v_row.note,
      'checkin_date', v_row.checkin_date,
      'created_at', v_row.created_at
    )
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', FALSE, 'error', 'already_checked_in');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_check_in(
  p_user_id UUID,
  p_venue_id INTEGER,
  p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public._safe_check_in_base(
    p_user_id,
    CASE WHEN p_venue_id IS NULL THEN NULL ELSE p_venue_id::TEXT END,
    p_note
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_check_in(
  p_user_id UUID,
  p_venue_id UUID,
  p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public._safe_check_in_base(
    p_user_id,
    CASE WHEN p_venue_id IS NULL THEN NULL ELSE p_venue_id::TEXT END,
    p_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public._safe_check_in_base(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._safe_check_in_base(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.safe_check_in(UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_check_in(UUID, INTEGER, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.safe_check_in(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_check_in(UUID, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grant_rewards(
  target_user_id UUID,
  reward_coins INTEGER,
  reward_xp INTEGER,
  action_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward_coins INTEGER := COALESCE(reward_coins, 0);
  v_reward_xp INTEGER := COALESCE(reward_xp, 0);
  v_action_name TEXT := COALESCE(NULLIF(TRIM(action_name), ''), 'manual_reward');
  v_coins INTEGER;
  v_xp INTEGER;
  v_level INTEGER;
BEGIN
  IF target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'invalid_user');
  END IF;

  INSERT INTO public.user_stats (
    user_id,
    coins,
    xp,
    level,
    submissions_count,
    check_ins_count,
    photos_count,
    created_at,
    updated_at
  ) VALUES (
    target_user_id,
    v_reward_coins,
    v_reward_xp,
    GREATEST(1, (v_reward_xp / 100) + 1),
    0,
    0,
    0,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET coins = public.user_stats.coins + EXCLUDED.coins,
        xp = public.user_stats.xp + EXCLUDED.xp,
        level = GREATEST(1, ((public.user_stats.xp + EXCLUDED.xp) / 100) + 1),
        updated_at = now()
  RETURNING coins, xp, level INTO v_coins, v_xp, v_level;

  IF v_reward_coins <> 0 THEN
    INSERT INTO public.coin_transactions (user_id, coin_delta, action_name, metadata)
    VALUES (
      target_user_id,
      v_reward_coins,
      v_action_name,
      jsonb_build_object('source', 'grant_rewards')
    );
  END IF;

  IF v_reward_xp <> 0 THEN
    INSERT INTO public.xp_logs (user_id, xp_delta, action_name, metadata)
    VALUES (
      target_user_id,
      v_reward_xp,
      v_action_name,
      jsonb_build_object('source', 'grant_rewards')
    );
  END IF;

  INSERT INTO public.gamification_logs (user_id, event_name, payload)
  VALUES (
    target_user_id,
    v_action_name,
    jsonb_build_object(
      'reward_coins', v_reward_coins,
      'reward_xp', v_reward_xp,
      'source', 'grant_rewards'
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', target_user_id,
    'coins', v_coins,
    'xp', v_xp,
    'level', v_level
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_rewards(UUID, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_rewards(UUID, INTEGER, INTEGER, TEXT) TO authenticated, service_role;

COMMIT;
