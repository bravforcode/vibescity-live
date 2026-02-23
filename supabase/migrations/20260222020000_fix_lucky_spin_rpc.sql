-- =============================================================================
-- Fix: Lucky Spin RPCs referencing non-existent `lucky_spins` table
-- The correct table is `public.lucky_wheel_spins`
-- =============================================================================

BEGIN;

-- ─── guest_spin_lucky_wheel ───────────────────────────────────────────────────
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
    FROM public.lucky_wheel_spins
   WHERE visitor_id = p_visitor_id
     AND spin_date  = v_today
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

  -- Insert spin record
  INSERT INTO public.lucky_wheel_spins (visitor_id, spin_date, prize_code, reward_coins)
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

-- ─── guest_lucky_wheel_status ─────────────────────────────────────────────────
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
    FROM public.lucky_wheel_spins
   WHERE visitor_id = p_visitor_id
     AND spin_date  = v_today
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

-- Re-grant to anon + authenticated
GRANT EXECUTE ON FUNCTION public.guest_spin_lucky_wheel(text)   TO anon;
GRANT EXECUTE ON FUNCTION public.guest_lucky_wheel_status(text) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_spin_lucky_wheel(text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_lucky_wheel_status(text) TO authenticated;

COMMIT;
