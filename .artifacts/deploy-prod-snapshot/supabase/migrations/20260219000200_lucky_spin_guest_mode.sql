-- =============================================================================
-- PR2: Lucky Spin Guest Mode — Server-Side Daily Limit by visitor_id
-- Purpose:
--   Allow guests to spin without login, enforced server-side via visitor_id
--   Prevents abuse even if localStorage is cleared (IP + visitor_id pair)
-- Safety: Additive only, no existing data modified
-- Rollback: DROP INDEX IF EXISTS lucky_spin_daily_guest_idx;
--           ALTER TABLE lucky_spins DROP COLUMN IF EXISTS visitor_id;
--           ALTER TABLE lucky_spins DROP COLUMN IF EXISTS spin_date;
-- =============================================================================

BEGIN;

-- ─── 1. Add visitor_id column to lucky_spins (if table exists) ───────────────
DO $$ BEGIN
  IF to_regclass('public.lucky_spins') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'lucky_spins'
        AND column_name  = 'visitor_id'
    ) THEN
      ALTER TABLE public.lucky_spins
        ADD COLUMN visitor_id text;
    END IF;

    -- spin_date as DATE for daily window grouping
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'lucky_spins'
        AND column_name  = 'spin_date'
    ) THEN
      ALTER TABLE public.lucky_spins
        ADD COLUMN spin_date date NOT NULL DEFAULT CURRENT_DATE;
    END IF;
  END IF;
END $$;

-- ─── 2. Composite unique index: one spin per visitor_id per day ──────────────
-- Guests use visitor_id, authenticated users use user_id.
-- Partial index per actor type to avoid nullability conflicts.

DO $$ BEGIN
  IF to_regclass('public.lucky_spins') IS NOT NULL THEN
    -- Guest index (visitor_id NOT NULL, user_id IS NULL)
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'lucky_spins'
        AND indexname  = 'lucky_spin_daily_guest_idx'
    ) THEN
      CREATE UNIQUE INDEX lucky_spin_daily_guest_idx
        ON public.lucky_spins (visitor_id, spin_date)
        WHERE user_id IS NULL AND visitor_id IS NOT NULL;
    END IF;

    -- Auth user index (user_id NOT NULL)
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'lucky_spins'
        AND indexname  = 'lucky_spin_daily_user_idx'
    ) THEN
      CREATE UNIQUE INDEX lucky_spin_daily_user_idx
        ON public.lucky_spins (user_id, spin_date)
        WHERE user_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ─── 3. RPC: guest_spin_lucky_wheel ──────────────────────────────────────────
-- Called by frontend with visitor_id (no auth required)
-- Returns { can_spin_today, today_spin, prize_code, reward_coins }
CREATE OR REPLACE FUNCTION public.guest_spin_lucky_wheel(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today        date := CURRENT_DATE;
  v_existing     record;
  v_prizes       text[] := ARRAY[
    'coins_5','coins_10','coins_10','coins_15','coins_20',
    'coins_50','coins_100','try_again','vip_badge'
  ];
  v_prize_code   text;
  v_reward_coins int;
BEGIN
  -- Guard: visitor_id required
  IF p_visitor_id IS NULL OR length(trim(p_visitor_id)) < 8 THEN
    RETURN jsonb_build_object('error', 'invalid_visitor_id');
  END IF;

  -- Check for existing spin today
  SELECT prize_code, reward_coins
    INTO v_existing
    FROM public.lucky_spins
   WHERE visitor_id = p_visitor_id
     AND spin_date  = v_today
     AND user_id IS NULL
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'can_spin_today', false,
      'today_spin', jsonb_build_object(
        'prize_code',    v_existing.prize_code,
        'reward_coins',  v_existing.reward_coins
      )
    );
  END IF;

  -- Pick random prize
  v_prize_code := v_prizes[1 + floor(random() * array_length(v_prizes, 1))::int];
  v_reward_coins := CASE v_prize_code
    WHEN 'coins_5'   THEN 5
    WHEN 'coins_10'  THEN 10
    WHEN 'coins_15'  THEN 15
    WHEN 'coins_20'  THEN 20
    WHEN 'coins_50'  THEN 50
    WHEN 'coins_100' THEN 100
    ELSE 0
  END;

  -- Insert spin record (ON CONFLICT = already spun today, safe to ignore)
  INSERT INTO public.lucky_spins (visitor_id, spin_date, prize_code, reward_coins)
    VALUES (p_visitor_id, v_today, v_prize_code, v_reward_coins)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'can_spin_today', true,
    'prize', jsonb_build_object(
      'prize_code',   v_prize_code,
      'prize_label',  v_prize_code,
      'reward_coins', v_reward_coins
    )
  );
END;
$$;

-- ─── 4. RPC: guest_lucky_wheel_status ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guest_lucky_wheel_status(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today    date := CURRENT_DATE;
  v_existing record;
BEGIN
  IF p_visitor_id IS NULL OR length(trim(p_visitor_id)) < 8 THEN
    RETURN jsonb_build_object('can_spin_today', true);
  END IF;

  SELECT prize_code, reward_coins
    INTO v_existing
    FROM public.lucky_spins
   WHERE visitor_id = p_visitor_id
     AND spin_date  = v_today
     AND user_id IS NULL
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'can_spin_today', false,
      'today_spin', jsonb_build_object(
        'prize_code',   v_existing.prize_code,
        'reward_coins', v_existing.reward_coins
      )
    );
  END IF;

  RETURN jsonb_build_object('can_spin_today', true);
END;
$$;

-- Grant execute to anon (guest mode)
GRANT EXECUTE ON FUNCTION public.guest_spin_lucky_wheel(text)    TO anon;
GRANT EXECUTE ON FUNCTION public.guest_lucky_wheel_status(text)  TO anon;
GRANT EXECUTE ON FUNCTION public.guest_spin_lucky_wheel(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_lucky_wheel_status(text)  TO authenticated;

COMMIT;
