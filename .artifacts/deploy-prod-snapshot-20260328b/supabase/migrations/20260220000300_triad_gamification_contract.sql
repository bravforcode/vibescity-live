-- =============================================================================
-- TRIAD Gamification Contract
-- Purpose:
--   - Ensure core gamification tables exist
--   - Preserve required RPC signatures used by application clients
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.xp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  xp_delta INTEGER NOT NULL,
  action_name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  coin_delta INTEGER NOT NULL,
  action_name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gamification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id TEXT,
  note TEXT,
  checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, checkin_date)
);

CREATE TABLE IF NOT EXISTS public.lucky_wheel_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  spin_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_logs_user_id ON public.xp_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON public.coin_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gamification_logs_user_id ON public.gamification_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON public.daily_checkins (user_id, checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_lucky_wheel_spins_user_id ON public.lucky_wheel_spins (user_id, spin_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_daily_checkin_status'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_daily_checkin_status()
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        v_user_id uuid := auth.uid();
        v_checked boolean := false;
      BEGIN
        IF v_user_id IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.daily_checkins
          WHERE user_id = v_user_id
            AND checkin_date = CURRENT_DATE
        ) INTO v_checked;

        RETURN jsonb_build_object(
          'success', true,
          'checked_in_today', v_checked
        );
      END;
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
      AND p.proname = 'claim_daily_checkin'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.claim_daily_checkin()
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        v_user_id uuid := auth.uid();
        v_rowcount integer := 0;
      BEGIN
        IF v_user_id IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
        END IF;

        INSERT INTO public.daily_checkins (user_id, checkin_date)
        VALUES (v_user_id, CURRENT_DATE)
        ON CONFLICT (user_id, checkin_date) DO NOTHING;
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;

        IF v_rowcount = 0 THEN
          RETURN jsonb_build_object('success', false, 'error', 'already_checked_in');
        END IF;

        INSERT INTO public.user_stats (user_id, coins, xp, level, check_ins_count)
        VALUES (v_user_id, 3, 15, 1, 1)
        ON CONFLICT (user_id) DO UPDATE
          SET coins = public.user_stats.coins + 3,
              xp = public.user_stats.xp + 15,
              check_ins_count = public.user_stats.check_ins_count + 1,
              level = GREATEST(1, ((public.user_stats.xp + 15) / 100) + 1),
              updated_at = now();

        INSERT INTO public.coin_transactions (user_id, coin_delta, action_name, metadata)
        VALUES (v_user_id, 3, 'daily_checkin', '{}'::jsonb);
        INSERT INTO public.xp_logs (user_id, xp_delta, action_name, metadata)
        VALUES (v_user_id, 15, 'daily_checkin', '{}'::jsonb);

        RETURN jsonb_build_object(
          'success', true,
          'reward_coins', 3,
          'reward_xp', 15
        );
      END;
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
      AND p.proname = 'get_lucky_wheel_status'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_lucky_wheel_status()
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        v_user_id uuid := auth.uid();
        v_last_spin timestamptz;
      BEGIN
        IF v_user_id IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
        END IF;

        SELECT max(spin_at)
        INTO v_last_spin
        FROM public.lucky_wheel_spins
        WHERE user_id = v_user_id;

        RETURN jsonb_build_object(
          'success', true,
          'last_spin_at', v_last_spin,
          'can_spin', (v_last_spin IS NULL OR v_last_spin <= now() - interval '24 hours')
        );
      END;
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
      AND p.proname = 'spin_lucky_wheel'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.spin_lucky_wheel()
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        v_user_id uuid := auth.uid();
        v_last_spin timestamptz;
        v_reward int := 5 + floor(random() * 46)::int;
      BEGIN
        IF v_user_id IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
        END IF;

        SELECT max(spin_at)
        INTO v_last_spin
        FROM public.lucky_wheel_spins
        WHERE user_id = v_user_id;

        IF v_last_spin IS NOT NULL AND v_last_spin > now() - interval '24 hours' THEN
          RETURN jsonb_build_object('success', false, 'error', 'cooldown');
        END IF;

        INSERT INTO public.lucky_wheel_spins (user_id, reward_coins)
        VALUES (v_user_id, v_reward);

        INSERT INTO public.user_stats (user_id, coins, xp, level)
        VALUES (v_user_id, v_reward, 0, 1)
        ON CONFLICT (user_id) DO UPDATE
          SET coins = public.user_stats.coins + v_reward,
              updated_at = now();

        INSERT INTO public.coin_transactions (user_id, coin_delta, action_name, metadata)
        VALUES (v_user_id, v_reward, 'lucky_wheel', '{}'::jsonb);

        RETURN jsonb_build_object('success', true, 'reward_coins', v_reward);
      END;
      $body$;
    $fn$;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.get_daily_checkin_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_checkin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_lucky_wheel_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spin_lucky_wheel() TO authenticated, service_role;

COMMIT;
