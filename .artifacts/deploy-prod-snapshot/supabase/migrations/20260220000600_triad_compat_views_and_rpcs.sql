-- =============================================================================
-- TRIAD Compatibility Views + RPCs
-- Purpose:
--   - Maintain legacy compatibility for old table names and RPC call sites
--   - Keep app-facing signatures stable during phased cutover
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.shops') IS NULL AND to_regclass('public.venues') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.shops AS
      SELECT
        id,
        name,
        category,
        province,
        status,
        slug,
        short_code,
        owner_id,
        pin_type,
        rating,
        total_views,
        view_count,
        is_verified,
        metadata,
        created_at,
        updated_at
      FROM public.venues
    ';
    EXECUTE 'ALTER VIEW public.shops SET (security_invoker = true, security_barrier = true)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.leaderboard_view') IS NULL THEN
    EXECUTE '
      CREATE VIEW public.leaderboard_view AS
      SELECT *
      FROM analytics.leaderboard_view
    ';
    EXECUTE 'ALTER VIEW public.leaderboard_view SET (security_invoker = true, security_barrier = true)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'safe_check_in'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_venue_id integer, p_note text'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.safe_check_in(
        p_user_id uuid,
        p_venue_id integer,
        p_note text DEFAULT ''
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        v_exists boolean;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text), p_venue_id);

        SELECT EXISTS (
          SELECT 1
          FROM public.daily_checkins
          WHERE user_id = p_user_id
            AND checkin_date = CURRENT_DATE
        ) INTO v_exists;

        IF v_exists THEN
          RETURN jsonb_build_object('success', false, 'error', 'already_checked_in');
        END IF;

        INSERT INTO public.daily_checkins (user_id, venue_id, note, checkin_date)
        VALUES (p_user_id, p_venue_id::text, NULLIF(p_note, ''), CURRENT_DATE);

        INSERT INTO public.user_stats (user_id, coins, xp, level, check_ins_count)
        VALUES (p_user_id, 5, 25, 1, 1)
        ON CONFLICT (user_id) DO UPDATE
          SET coins = public.user_stats.coins + 5,
              xp = public.user_stats.xp + 25,
              check_ins_count = public.user_stats.check_ins_count + 1,
              level = GREATEST(1, ((public.user_stats.xp + 25) / 100) + 1),
              updated_at = now();

        INSERT INTO public.coin_transactions (user_id, coin_delta, action_name, metadata)
        VALUES (p_user_id, 5, 'check_in', jsonb_build_object('venue_id', p_venue_id));
        INSERT INTO public.xp_logs (user_id, xp_delta, action_name, metadata)
        VALUES (p_user_id, 25, 'check_in', jsonb_build_object('venue_id', p_venue_id));
        INSERT INTO public.gamification_logs (user_id, event_name, payload)
        VALUES (p_user_id, 'check_in', jsonb_build_object('venue_id', p_venue_id, 'note', p_note));

        RETURN jsonb_build_object(
          'success', true,
          'data', jsonb_build_object(
            'user_id', p_user_id,
            'venue_id', p_venue_id,
            'checkin_date', CURRENT_DATE
          )
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
      AND p.proname = 'grant_rewards'
      AND pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid, reward_coins integer, reward_xp integer, action_name text'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.grant_rewards(
        target_user_id uuid,
        reward_coins integer,
        reward_xp integer,
        action_name text
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      BEGIN
        INSERT INTO public.user_stats (user_id, coins, xp, level)
        VALUES (
          target_user_id,
          COALESCE(reward_coins, 0),
          COALESCE(reward_xp, 0),
          GREATEST(1, (COALESCE(reward_xp, 0) / 100) + 1)
        )
        ON CONFLICT (user_id) DO UPDATE
          SET coins = public.user_stats.coins + COALESCE(reward_coins, 0),
              xp = public.user_stats.xp + COALESCE(reward_xp, 0),
              level = GREATEST(1, ((public.user_stats.xp + COALESCE(reward_xp, 0)) / 100) + 1),
              updated_at = now();

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

        RETURN jsonb_build_object('success', true);
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
      AND p.proname = 'get_partner_dashboard_metrics'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_partner_dashboard_metrics()
      RETURNS TABLE (
        partner_id uuid,
        total_orders bigint,
        subscription_orders bigint,
        renewal_orders bigint,
        total_revenue numeric,
        pending_payout numeric,
        paid_payout numeric,
        last_order_at timestamptz
      )
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      AS $body$
        WITH my_partner AS (
          SELECT p.id
          FROM public.partners p
          WHERE p.user_id = auth.uid()
          LIMIT 1
        ),
        order_agg AS (
          SELECT
            o.partner_id,
            COUNT(*)::bigint AS total_orders,
            COUNT(*) FILTER (WHERE o.subscription_status = 'active')::bigint AS subscription_orders,
            COUNT(*) FILTER (WHERE o.subscription_status = 'renewal')::bigint AS renewal_orders,
            COALESCE(SUM(o.amount), 0)::numeric AS total_revenue,
            MAX(o.created_at) AS last_order_at
          FROM public.orders o
          JOIN my_partner mp ON mp.id = o.partner_id
          GROUP BY o.partner_id
        ),
        payout_agg AS (
          SELECT
            pp.partner_id,
            COALESCE(SUM(pp.amount) FILTER (WHERE pp.status = 'pending'), 0)::numeric AS pending_payout,
            COALESCE(SUM(pp.amount) FILTER (WHERE pp.status = 'paid'), 0)::numeric AS paid_payout
          FROM public.partner_payouts pp
          JOIN my_partner mp ON mp.id = pp.partner_id
          GROUP BY pp.partner_id
        )
        SELECT
          mp.id AS partner_id,
          COALESCE(oa.total_orders, 0) AS total_orders,
          COALESCE(oa.subscription_orders, 0) AS subscription_orders,
          COALESCE(oa.renewal_orders, 0) AS renewal_orders,
          COALESCE(oa.total_revenue, 0) AS total_revenue,
          COALESCE(pa.pending_payout, 0) AS pending_payout,
          COALESCE(pa.paid_payout, 0) AS paid_payout,
          oa.last_order_at
        FROM my_partner mp
        LEFT JOIN order_agg oa ON oa.partner_id = mp.id
        LEFT JOIN payout_agg pa ON pa.partner_id = mp.id;
      $body$;
    $fn$;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.safe_check_in(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_rewards(uuid, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_partner_dashboard_metrics() TO authenticated, service_role;

COMMIT;
