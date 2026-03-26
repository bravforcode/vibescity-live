-- =============================================================================
-- Migration: Full DB compatibility + performance pack
-- Date: 2026-02-23
-- Purpose:
--   - Restore missing RPC/table compatibility used by frontend/backend
--   - Fix anonymous gamification RPC shape
--   - Add partner compatibility tables/RPCs/policies
--   - Harden map pin query performance at high traffic
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS private;

-- -----------------------------------------------------------------------------
-- 0) Core compatibility columns + indexes
-- -----------------------------------------------------------------------------
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_visitor_id text,
  ADD COLUMN IF NOT EXISTS pin_metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_until timestamptz,
  ADD COLUMN IF NOT EXISTS glow_until timestamptz,
  ADD COLUMN IF NOT EXISTS boost_until timestamptz,
  ADD COLUMN IF NOT EXISTS giant_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_venues_owner_visitor_id
  ON public.venues (owner_visitor_id)
  WHERE owner_visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_location_geometry_gix
  ON public.venues
  USING gist ((location::geometry));

CREATE INDEX IF NOT EXISTS idx_venues_lat_lng_active
  ON public.venues (latitude, longitude)
  WHERE latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND lower(COALESCE(status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted');

CREATE INDEX IF NOT EXISTS idx_venues_map_priority
  ON public.venues (status, pin_type, visibility_score DESC, name);

DO $$
BEGIN
  IF to_regclass('public.venue_live_counts') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='venue_live_counts' AND column_name='live_count'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='venue_live_counts' AND column_name='user_count'
     ) THEN
    EXECUTE 'ALTER TABLE public.venue_live_counts ADD COLUMN user_count integer GENERATED ALWAYS AS (live_count) STORED';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Missing compatibility tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_slug_history (
  slug text PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  venue_id uuid,
  source text,
  referral_code text,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  order_id uuid,
  venue_id uuid,
  entry_type text NOT NULL DEFAULT 'accrual',
  amount_thb numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'accrued',
  period_end timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_payouts
  ADD COLUMN IF NOT EXISTS payout_week_start date,
  ADD COLUMN IF NOT EXISTS payout_week_end date,
  ADD COLUMN IF NOT EXISTS net_amount_thb numeric(12,2),
  ADD COLUMN IF NOT EXISTS transfer_reference text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

UPDATE public.partner_payouts
SET net_amount_thb = amount
WHERE net_amount_thb IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_referrals_partner_attributed
  ON public.partner_referrals (partner_id, attributed_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_ledger_partner_created
  ON public.partner_commission_ledger (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_week
  ON public.partner_payouts (partner_id, payout_week_end DESC);

CREATE TABLE IF NOT EXISTS private.partner_secrets (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  bank_code text,
  account_name text,
  account_number text,
  promptpay_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  user_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_id uuid,
  venue_id uuid,
  venue_ref text,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type
  ON public.analytics_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='check_ins' AND column_name='venue_id' AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.check_ins
      ALTER COLUMN venue_id TYPE text USING venue_id::text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_check_ins_user_created
  ON public.check_ins (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_check_ins_venue_created
  ON public.check_ins (venue_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2) RLS + grants for compatibility tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.venue_slug_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS venue_slug_history_public_read ON public.venue_slug_history;
  CREATE POLICY venue_slug_history_public_read
    ON public.venue_slug_history
    FOR SELECT
    USING (true);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS partner_referrals_select_own ON public.partner_referrals;
  CREATE POLICY partner_referrals_select_own
    ON public.partner_referrals
    FOR SELECT
    USING (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.partners p
        WHERE p.id = partner_referrals.partner_id
          AND p.user_id = auth.uid()
      )
    );

  DROP POLICY IF EXISTS partner_commission_ledger_select_own ON public.partner_commission_ledger;
  CREATE POLICY partner_commission_ledger_select_own
    ON public.partner_commission_ledger
    FOR SELECT
    USING (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.partners p
        WHERE p.id = partner_commission_ledger.partner_id
          AND p.user_id = auth.uid()
      )
    );

  IF to_regclass('public.partner_payouts') IS NOT NULL THEN
    DROP POLICY IF EXISTS partner_payouts_select_own ON public.partner_payouts;
    CREATE POLICY partner_payouts_select_own
      ON public.partner_payouts
      FOR SELECT
      USING (
        auth.role() = 'service_role'
        OR EXISTS (
          SELECT 1 FROM public.partners p
          WHERE p.id = partner_payouts.partner_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.partners') IS NOT NULL THEN
    DROP POLICY IF EXISTS partners_select_own_or_service ON public.partners;
    CREATE POLICY partners_select_own_or_service
      ON public.partners
      FOR SELECT
      USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    DROP POLICY IF EXISTS orders_select_own_or_service ON public.orders;
    CREATE POLICY orders_select_own_or_service
      ON public.orders
      FOR SELECT
      USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    DROP POLICY IF EXISTS subscriptions_select_own_or_service ON public.subscriptions;
    CREATE POLICY subscriptions_select_own_or_service
      ON public.subscriptions
      FOR SELECT
      USING (auth.role() = 'service_role' OR user_id = auth.uid());
  END IF;

  DROP POLICY IF EXISTS analytics_events_service_only ON public.analytics_events;
  CREATE POLICY analytics_events_service_only
    ON public.analytics_events
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS check_ins_select_own_or_service ON public.check_ins;
  CREATE POLICY check_ins_select_own_or_service
    ON public.check_ins
    FOR SELECT
    USING (auth.role() = 'service_role' OR user_id = auth.uid());

  DROP POLICY IF EXISTS check_ins_insert_own_or_service ON public.check_ins;
  CREATE POLICY check_ins_insert_own_or_service
    ON public.check_ins
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());
END $$;

GRANT SELECT ON public.venue_slug_history TO anon, authenticated, service_role;
GRANT SELECT ON public.partner_referrals, public.partner_commission_ledger TO authenticated, service_role;
GRANT SELECT, INSERT ON public.check_ins TO authenticated, service_role;
GRANT INSERT ON public.analytics_events TO service_role;

DO $$ BEGIN
  IF to_regclass('public.partner_payouts') IS NOT NULL THEN
    GRANT SELECT ON public.partner_payouts TO authenticated, service_role;
  END IF;
  IF to_regclass('public.partners') IS NOT NULL THEN
    GRANT SELECT ON public.partners TO authenticated, service_role;
  END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    GRANT SELECT ON public.orders TO authenticated, service_role;
  END IF;
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    GRANT SELECT ON public.subscriptions TO authenticated, service_role;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Anonymous gamification RPCs (visitor_id signatures)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visitor_gamification_stats (
  visitor_id text PRIMARY KEY,
  streak integer NOT NULL DEFAULT 0,
  total_days integer NOT NULL DEFAULT 0,
  balance integer NOT NULL DEFAULT 0,
  last_checkin_at timestamptz,
  last_spin_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP FUNCTION IF EXISTS public.get_daily_checkin_status();
DROP FUNCTION IF EXISTS public.claim_daily_checkin();
DROP FUNCTION IF EXISTS public.get_lucky_wheel_status();
DROP FUNCTION IF EXISTS public.spin_lucky_wheel();
DROP FUNCTION IF EXISTS public.get_daily_checkin_status(text);
DROP FUNCTION IF EXISTS public.claim_daily_checkin(text);
DROP FUNCTION IF EXISTS public.get_lucky_wheel_status(text);
DROP FUNCTION IF EXISTS public.spin_lucky_wheel(text);

CREATE OR REPLACE FUNCTION public.get_daily_checkin_status(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats public.visitor_gamification_stats%ROWTYPE;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_visitor_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_visitor_id');
  END IF;

  INSERT INTO public.visitor_gamification_stats (visitor_id)
  VALUES (p_visitor_id)
  ON CONFLICT (visitor_id) DO NOTHING;

  SELECT * INTO v_stats
  FROM public.visitor_gamification_stats
  WHERE visitor_id = p_visitor_id;

  RETURN jsonb_build_object(
    'streak', COALESCE(v_stats.streak, 0),
    'total_days', COALESCE(v_stats.total_days, 0),
    'balance', COALESCE(v_stats.balance, 0),
    'last_checkin_at', v_stats.last_checkin_at,
    'can_claim_today', (v_stats.last_checkin_at IS NULL OR v_stats.last_checkin_at::date <> CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_checkin(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats public.visitor_gamification_stats%ROWTYPE;
  v_rewards int[] := ARRAY[10,15,20,25,30,40,100];
  v_reward int := 0;
  v_day_index int := 1;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_visitor_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('already_claimed', true, 'error', 'missing_visitor_id');
  END IF;

  INSERT INTO public.visitor_gamification_stats (visitor_id)
  VALUES (p_visitor_id)
  ON CONFLICT (visitor_id) DO NOTHING;

  SELECT * INTO v_stats
  FROM public.visitor_gamification_stats
  WHERE visitor_id = p_visitor_id
  FOR UPDATE;

  IF v_stats.last_checkin_at IS NOT NULL AND v_stats.last_checkin_at::date = CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'already_claimed', true,
      'streak', v_stats.streak,
      'total_days', v_stats.total_days,
      'balance', v_stats.balance,
      'claimed_at', v_stats.last_checkin_at
    );
  END IF;

  IF v_stats.last_checkin_at IS NOT NULL AND v_stats.last_checkin_at::date = CURRENT_DATE - 1 THEN
    v_stats.streak := COALESCE(v_stats.streak, 0) + 1;
  ELSE
    v_stats.streak := 1;
  END IF;

  v_stats.total_days := COALESCE(v_stats.total_days, 0) + 1;
  v_day_index := ((v_stats.streak - 1) % 7) + 1;
  v_reward := v_rewards[v_day_index];
  v_stats.balance := COALESCE(v_stats.balance, 0) + v_reward;
  v_stats.last_checkin_at := now();

  UPDATE public.visitor_gamification_stats
  SET streak = v_stats.streak,
      total_days = v_stats.total_days,
      balance = v_stats.balance,
      last_checkin_at = v_stats.last_checkin_at,
      updated_at = now()
  WHERE visitor_id = p_visitor_id;

  INSERT INTO public.gamification_logs (user_id, event_name, payload)
  VALUES (NULL, 'daily_checkin', jsonb_build_object(
    'visitor_id', p_visitor_id,
    'reward_coins', v_reward,
    'balance', v_stats.balance,
    'streak', v_stats.streak,
    'total_days', v_stats.total_days
  ));

  RETURN jsonb_build_object(
    'already_claimed', false,
    'streak', v_stats.streak,
    'total_days', v_stats.total_days,
    'balance', v_stats.balance,
    'reward_coins', v_reward,
    'claimed_at', v_stats.last_checkin_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lucky_wheel_status(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats public.visitor_gamification_stats%ROWTYPE;
  v_today_prize jsonb;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_visitor_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('can_spin_today', false, 'error', 'missing_visitor_id');
  END IF;

  INSERT INTO public.visitor_gamification_stats (visitor_id)
  VALUES (p_visitor_id)
  ON CONFLICT (visitor_id) DO NOTHING;

  SELECT * INTO v_stats
  FROM public.visitor_gamification_stats
  WHERE visitor_id = p_visitor_id;

  SELECT payload -> 'prize'
  INTO v_today_prize
  FROM public.gamification_logs
  WHERE event_name = 'lucky_wheel_spin'
    AND payload ->> 'visitor_id' = p_visitor_id
    AND created_at::date = CURRENT_DATE
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'can_spin_today', (v_stats.last_spin_at IS NULL OR v_stats.last_spin_at::date <> CURRENT_DATE),
    'last_spin_at', v_stats.last_spin_at,
    'balance', COALESCE(v_stats.balance, 0),
    'today_spin', COALESCE(v_today_prize, 'null'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.spin_lucky_wheel(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats public.visitor_gamification_stats%ROWTYPE;
  v_idx int;
  v_codes text[] := ARRAY['coins_10','coins_20','coins_50','try_again','coins_5','coins_100','coins_15','vip_badge'];
  v_labels text[] := ARRAY['10 Coins','20 Coins','50 Coins','Try Again','5 Coins','100 Coins','15 Coins','VIP Badge'];
  v_rewards int[] := ARRAY[10,20,50,0,5,100,15,0];
  v_prize jsonb;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_visitor_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('already_spun', true, 'error', 'missing_visitor_id');
  END IF;

  INSERT INTO public.visitor_gamification_stats (visitor_id)
  VALUES (p_visitor_id)
  ON CONFLICT (visitor_id) DO NOTHING;

  SELECT * INTO v_stats
  FROM public.visitor_gamification_stats
  WHERE visitor_id = p_visitor_id
  FOR UPDATE;

  IF v_stats.last_spin_at IS NOT NULL AND v_stats.last_spin_at::date = CURRENT_DATE THEN
    RETURN jsonb_build_object('already_spun', true, 'balance', COALESCE(v_stats.balance, 0));
  END IF;

  v_idx := floor(random() * array_length(v_codes, 1))::int + 1;
  v_prize := jsonb_build_object(
    'code', v_codes[v_idx],
    'label', v_labels[v_idx],
    'reward_coins', v_rewards[v_idx],
    'metadata', jsonb_build_object('visitor_only', true)
  );

  UPDATE public.visitor_gamification_stats
  SET balance = COALESCE(balance, 0) + v_rewards[v_idx],
      last_spin_at = now(),
      updated_at = now()
  WHERE visitor_id = p_visitor_id
  RETURNING * INTO v_stats;

  INSERT INTO public.gamification_logs (user_id, event_name, payload)
  VALUES (NULL, 'lucky_wheel_spin', jsonb_build_object(
    'visitor_id', p_visitor_id,
    'prize', v_prize,
    'balance', v_stats.balance
  ));

  RETURN jsonb_build_object(
    'already_spun', false,
    'prize', v_prize,
    'balance', COALESCE(v_stats.balance, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_checkin_status(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_checkin(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_lucky_wheel_status(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spin_lucky_wheel(text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Missing RPC compatibility
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_venues(text, double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.search_venues(
  p_query text DEFAULT '',
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_km double precision DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  category text,
  status text,
  province text,
  latitude double precision,
  longitude double precision,
  image_urls text[],
  rating numeric,
  review_count integer,
  total_views bigint,
  pin_type text,
  distance_km double precision
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_query text := TRIM(COALESCE(p_query, ''));
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      v.id,
      v.name,
      v.slug,
      v.category,
      v.status,
      v.province,
      COALESCE(st_y(v.location::geometry), v.latitude) AS latitude,
      COALESCE(st_x(v.location::geometry), v.longitude) AS longitude,
      COALESCE(v.image_urls, ARRAY[]::text[]) AS image_urls,
      COALESCE(v.rating, 0)::numeric AS rating,
      0::integer AS review_count,
      COALESCE(v.total_views, v.view_count, 0)::bigint AS total_views,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type
    FROM public.venues v
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
      AND (
        v_query = ''
        OR v.name ILIKE '%' || v_query || '%'
        OR COALESCE(v.category, '') ILIKE '%' || v_query || '%'
        OR COALESCE(v.province, '') ILIKE '%' || v_query || '%'
      )
  ),
  ranked AS (
    SELECT
      b.*,
      CASE
        WHEN p_lat IS NULL OR p_lng IS NULL OR b.latitude IS NULL OR b.longitude IS NULL THEN NULL
        ELSE (
          st_distance(
            st_setsrid(st_makepoint(b.longitude, b.latitude), 4326)::geography,
            st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
          ) / 1000.0
        )
      END AS distance_km
    FROM base b
  )
  SELECT
    r.id, r.name, r.slug, r.category, r.status, r.province,
    r.latitude, r.longitude, r.image_urls, r.rating, r.review_count,
    r.total_views, r.pin_type, r.distance_km
  FROM ranked r
  WHERE p_lat IS NULL OR p_lng IS NULL OR p_radius_km IS NULL
     OR r.distance_km IS NULL OR r.distance_km <= GREATEST(COALESCE(p_radius_km, 0), 0)
  ORDER BY r.distance_km ASC NULLS LAST, r.total_views DESC, r.name ASC
  LIMIT 200;
END;
$$;

DROP FUNCTION IF EXISTS public.get_feed_cards(double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_feed_cards(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  category text,
  status text,
  image_urls text[],
  image_url1 text,
  rating numeric,
  total_views bigint,
  distance_km double precision,
  latitude double precision,
  longitude double precision,
  pin_type text,
  pin_metadata jsonb,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  visibility_score integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.id,
    v.name,
    v.slug,
    v.category,
    v.status,
    COALESCE(v.image_urls, ARRAY[]::text[]) AS image_urls,
    COALESCE(v.image_urls[1], v."Image_URL1") AS image_url1,
    COALESCE(v.rating, 0)::numeric AS rating,
    COALESCE(v.total_views, v.view_count, 0)::bigint AS total_views,
    CASE
      WHEN p_lat IS NULL OR p_lng IS NULL THEN NULL
      ELSE st_distance(
        st_setsrid(st_makepoint(COALESCE(st_x(v.location::geometry), v.longitude), COALESCE(st_y(v.location::geometry), v.latitude)), 4326)::geography,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      ) / 1000.0
    END AS distance_km,
    COALESCE(st_y(v.location::geometry), v.latitude) AS latitude,
    COALESCE(st_x(v.location::geometry), v.longitude) AS longitude,
    CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type,
    COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
    false AS verified_active,
    false AS glow_active,
    false AS boost_active,
    (lower(COALESCE(v.pin_type, '')) = 'giant') AS giant_active,
    COALESCE(v.visibility_score, 0) AS visibility_score
  FROM public.venues v
  WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
  ORDER BY distance_km ASC NULLS LAST, total_views DESC, name ASC
  LIMIT 30;
$$;

DROP FUNCTION IF EXISTS public.get_venue_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_venue_stats(p_shop_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'live_visitors', COALESCE(vlc.user_count, vlc.live_count, 0),
    'total_views', COALESCE(v.total_views, v.view_count, 0),
    'rating', COALESCE(v.rating, 0),
    'is_promoted', (lower(COALESCE(v.pin_type, '')) IN ('giant', 'boost'))
  )
  FROM public.venues v
  LEFT JOIN public.venue_live_counts vlc ON vlc.venue_id = v.id
  WHERE v.id = p_shop_id
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.update_venue_anonymous(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.update_venue_anonymous(
  p_shop_id uuid,
  p_visitor_id text,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  IF p_shop_id IS NULL OR NULLIF(TRIM(COALESCE(p_visitor_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  UPDATE public.venues
  SET owner_visitor_id = p_visitor_id
  WHERE id = p_shop_id
    AND (owner_visitor_id IS NULL OR owner_visitor_id = '');

  UPDATE public.venues
  SET name = COALESCE(NULLIF(TRIM(p_updates ->> 'name'), ''), name),
      category = COALESCE(NULLIF(TRIM(p_updates ->> 'category'), ''), category),
      metadata = CASE
        WHEN p_updates ? 'description'
          THEN COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('description', p_updates ->> 'description')
        ELSE metadata
      END,
      updated_at = now()
  WHERE id = p_shop_id
    AND owner_visitor_id = p_visitor_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('success', (v_updated > 0));
END;
$$;

DROP FUNCTION IF EXISTS public.create_partner_profile(text, text);

CREATE OR REPLACE FUNCTION public.create_partner_profile(
  p_display_name text,
  p_referral_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner public.partners%ROWTYPE;
  v_clean_code text;
  v_try int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_partner
  FROM public.partners
  WHERE user_id = v_uid
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_partner);
  END IF;

  v_clean_code := UPPER(REGEXP_REPLACE(COALESCE(p_referral_code, ''), '[^A-Za-z0-9_-]', '', 'g'));

  FOR v_try IN 1..5 LOOP
    IF v_try > 1 OR NULLIF(v_clean_code, '') IS NULL THEN
      v_clean_code := 'VB' || UPPER(SUBSTR(md5(v_uid::text || clock_timestamp()::text || v_try::text), 1, 8));
    END IF;

    BEGIN
      INSERT INTO public.partners (user_id, name, referral_code, status, updated_at)
      VALUES (
        v_uid,
        NULLIF(TRIM(COALESCE(p_display_name, '')), ''),
        v_clean_code,
        'active',
        now()
      )
      RETURNING * INTO v_partner;

      RETURN to_jsonb(v_partner);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'unable_to_generate_referral_code';
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_partner_secrets(text, text, text, text);

CREATE OR REPLACE FUNCTION public.upsert_partner_secrets(
  p_bank_code text,
  p_account_name text,
  p_account_number text DEFAULT NULL,
  p_promptpay_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT id INTO v_partner_id
  FROM public.partners
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'partner_not_found';
  END IF;

  INSERT INTO private.partner_secrets (
    partner_id,
    bank_code,
    account_name,
    account_number,
    promptpay_id,
    updated_at
  )
  VALUES (
    v_partner_id,
    NULLIF(TRIM(COALESCE(p_bank_code, '')), ''),
    NULLIF(TRIM(COALESCE(p_account_name, '')), ''),
    NULLIF(TRIM(COALESCE(p_account_number, '')), ''),
    NULLIF(TRIM(COALESCE(p_promptpay_id, '')), ''),
    now()
  )
  ON CONFLICT (partner_id)
  DO UPDATE SET
    bank_code = EXCLUDED.bank_code,
    account_name = EXCLUDED.account_name,
    account_number = EXCLUDED.account_number,
    promptpay_id = EXCLUDED.promptpay_id,
    updated_at = now();
END;
$$;

DROP FUNCTION IF EXISTS public.get_partner_dashboard_metrics();

CREATE OR REPLACE FUNCTION public.get_partner_dashboard_metrics()
RETURNS TABLE (
  partner_id uuid,
  referred_venues bigint,
  renewal_orders bigint,
  accrued_balance numeric,
  scheduled_payout numeric,
  last_order_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_partner AS (
    SELECT p.id
    FROM public.partners p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  ),
  ref_agg AS (
    SELECT pr.partner_id, COUNT(DISTINCT pr.venue_id)::bigint AS referred_venues
    FROM public.partner_referrals pr
    JOIN my_partner mp ON mp.id = pr.partner_id
    GROUP BY pr.partner_id
  ),
  ledger_agg AS (
    SELECT
      l.partner_id,
      COUNT(*) FILTER (WHERE lower(COALESCE(l.entry_type, '')) IN ('renewal', 'subscription_renewal'))::bigint AS renewal_orders,
      COALESCE(SUM(l.amount_thb) FILTER (WHERE lower(COALESCE(l.status, 'accrued')) IN ('accrued', 'approved', 'pending')), 0)::numeric AS accrued_balance,
      MAX(l.created_at) AS last_order_at
    FROM public.partner_commission_ledger l
    JOIN my_partner mp ON mp.id = l.partner_id
    GROUP BY l.partner_id
  ),
  payout_agg AS (
    SELECT
      pp.partner_id,
      COALESCE(SUM(COALESCE(pp.net_amount_thb, pp.amount)) FILTER (WHERE lower(COALESCE(pp.status, 'pending')) IN ('pending', 'scheduled')), 0)::numeric AS scheduled_payout
    FROM public.partner_payouts pp
    JOIN my_partner mp ON mp.id = pp.partner_id
    GROUP BY pp.partner_id
  )
  SELECT
    mp.id AS partner_id,
    COALESCE(ra.referred_venues, 0) AS referred_venues,
    COALESCE(la.renewal_orders, 0) AS renewal_orders,
    COALESCE(la.accrued_balance, 0) AS accrued_balance,
    COALESCE(pa.scheduled_payout, 0) AS scheduled_payout,
    la.last_order_at
  FROM my_partner mp
  LEFT JOIN ref_agg ra ON ra.partner_id = mp.id
  LEFT JOIN ledger_agg la ON la.partner_id = mp.id
  LEFT JOIN payout_agg pa ON pa.partner_id = mp.id;
$$;

GRANT EXECUTE ON FUNCTION public.search_venues(text, double precision, double precision, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_feed_cards(double precision, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_venue_stats(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_venue_anonymous(uuid, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_partner_profile(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_partner_secrets(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_partner_dashboard_metrics() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) get_map_pins timeout-safe rewrite with index-friendly bbox check
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_map_pins(double precision, double precision, double precision, double precision, int);

CREATE OR REPLACE FUNCTION public.get_map_pins(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom int
)
RETURNS TABLE (
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  pin_type text,
  pin_metadata jsonb,
  visibility_score integer,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  cover_image text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_zoom int := COALESCE(p_zoom, 15);
  v_bbox geometry := st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      v.id,
      v.name,
      COALESCE(st_y(v.location::geometry), v.latitude) AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      COALESCE(v.visibility_score, 0) AS visibility_score,
      COALESCE(v.is_verified, false) AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type, '')) = 'giant') AS giant_active,
      COALESCE(v.image_urls[1], v."Image_URL1") AS cover_image
    FROM public.venues v
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
      AND (
        (
          v.location IS NOT NULL
          AND v.location::geometry && v_bbox
          AND st_intersects(v.location::geometry, v_bbox)
        )
        OR (
          v.location IS NULL
          AND v.latitude BETWEEN p_min_lat AND p_max_lat
          AND v.longitude BETWEEN p_min_lng AND p_max_lng
        )
      )
      AND (
        v_zoom > 15
        OR (v_zoom < 13 AND ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type, '')) = 'giant'))
        OR (v_zoom BETWEEN 13 AND 15 AND (
          (v.giant_until IS NOT NULL AND v.giant_until > now())
          OR lower(COALESCE(v.pin_type, '')) = 'giant'
          OR (v.boost_until IS NOT NULL AND v.boost_until > now())
          OR COALESCE(v.visibility_score, 0) > 0
        ))
      )
  )
  SELECT
    c.id,
    c.name,
    c.lat,
    c.lng,
    CASE WHEN c.giant_active THEN 'giant' ELSE c.pin_type END AS pin_type,
    c.pin_metadata,
    c.visibility_score,
    c.is_verified,
    c.verified_active,
    c.glow_active,
    c.boost_active,
    c.giant_active,
    c.cover_image
  FROM candidates c
  WHERE c.lat IS NOT NULL
    AND c.lng IS NOT NULL
  ORDER BY
    CASE WHEN v_zoom <= 15 AND c.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN c.boost_active THEN 1 ELSE 0 END DESC,
    c.visibility_score DESC,
    c.name ASC
  LIMIT CASE
    WHEN v_zoom < 13 THEN 300
    WHEN v_zoom BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

COMMIT;
