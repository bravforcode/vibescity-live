-- =============================================================================
-- Migration: Follow-Up — search_venues RPC, leaderboard_view, Storage Buckets,
--                        Gamification RPCs, Partner RPCs, Demo Data
-- Date: 2026-02-23 (Migration #2)
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. search_venues RPC — Used by geoService.js + realTimeDataService.js
--    Signature: (p_query TEXT, p_lat FLOAT8, p_lng FLOAT8, p_radius_km FLOAT8)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.search_venues(
  p_query      TEXT DEFAULT '',
  p_lat        DOUBLE PRECISION DEFAULT NULL,
  p_lng        DOUBLE PRECISION DEFAULT NULL,
  p_radius_km  DOUBLE PRECISION DEFAULT 50
)
RETURNS TABLE (
  id           UUID,
  name         TEXT,
  slug         TEXT,
  category     TEXT,
  status       TEXT,
  province     TEXT,
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  image_urls   TEXT[],
  rating       NUMERIC,
  review_count INTEGER,
  total_views  INTEGER,
  pin_type     TEXT,
  distance_km  DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_query TEXT := TRIM(COALESCE(p_query, ''));
  v_radius_m DOUBLE PRECISION := COALESCE(p_radius_km, 50) * 1000;
BEGIN
  RETURN QUERY
    SELECT
      v.id,
      v.name,
      v.slug,
      v.category,
      v.status,
      v.province,
      COALESCE(st_y(v.location::geometry), v.latitude)  AS latitude,
      COALESCE(st_x(v.location::geometry), v.longitude) AS longitude,
      v.image_urls,
      COALESCE(v.rating, 0)::numeric                    AS rating,
      COALESCE(v.review_count, 0)::integer               AS review_count,
      COALESCE(v.total_views, 0)::integer                AS total_views,
      COALESCE(v.pin_type, 'normal')::text               AS pin_type,
      CASE
        WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND v.location IS NOT NULL THEN
          st_distancesphere(v.location::geometry, st_makepoint(p_lng, p_lat)) / 1000.0
        WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND v.latitude IS NOT NULL THEN
          st_distancesphere(st_makepoint(v.longitude, v.latitude), st_makepoint(p_lng, p_lat)) / 1000.0
        ELSE 9999.0
      END AS distance_km
    FROM public.venues v
    WHERE v.status = 'active'
      AND (
        v_query = ''
        OR v.name ILIKE '%' || v_query || '%'
        OR v.category ILIKE '%' || v_query || '%'
        OR v.description ILIKE '%' || v_query || '%'
      )
      AND (
        p_lat IS NULL OR p_lng IS NULL
        OR CASE
          WHEN v.location IS NOT NULL THEN
            st_distancesphere(v.location::geometry, st_makepoint(p_lng, p_lat)) <= v_radius_m
          WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
            st_distancesphere(st_makepoint(v.longitude, v.latitude), st_makepoint(p_lng, p_lat)) <= v_radius_m
          ELSE true
        END
      )
    ORDER BY distance_km ASC
    LIMIT 100;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.search_venues(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  TO anon, authenticated, service_role;


-- =========================================================================
-- 2. leaderboard_view — Fallback public view from user_stats
--    (analytics.leaderboard_view may not exist)
-- =========================================================================
DROP VIEW IF EXISTS public.leaderboard_view;

CREATE VIEW public.leaderboard_view AS
SELECT
  us.user_id  AS id,
  up.username AS email,  -- Leaderboard.vue reads .email
  us.xp,
  us.coins,
  us.level,
  us.check_ins_count,
  ROW_NUMBER() OVER (ORDER BY us.xp DESC) AS rank
FROM public.user_stats us
LEFT JOIN public.user_profiles up ON up.user_id = us.user_id
ORDER BY us.xp DESC;


-- =========================================================================
-- 3. Storage Buckets (Supabase Storage via SQL)
-- =========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('payment-slips', 'payment-slips', true, 10485760,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']),
  ('sensitive-uploads', 'sensitive-uploads', false, 10485760,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage Policies: payment-slips (public read, authenticated upload)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'payment_slips_public_read'
  ) THEN
    CREATE POLICY payment_slips_public_read ON storage.objects FOR SELECT
      USING (bucket_id = 'payment-slips');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'payment_slips_anon_upload'
  ) THEN
    CREATE POLICY payment_slips_anon_upload ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'payment-slips');
  END IF;
END $$;

-- Storage Policies: sensitive-uploads (authenticated only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'sensitive_uploads_auth_read'
  ) THEN
    CREATE POLICY sensitive_uploads_auth_read ON storage.objects FOR SELECT
      USING (bucket_id = 'sensitive-uploads' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'sensitive_uploads_auth_upload'
  ) THEN
    CREATE POLICY sensitive_uploads_auth_upload ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'sensitive-uploads' AND auth.role() = 'authenticated');
  END IF;
END $$;


-- =========================================================================
-- 4. Gamification RPCs
-- =========================================================================

-- get_daily_checkin_status
CREATE OR REPLACE FUNCTION public.get_daily_checkin_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_checked_in BOOLEAN := false;
  v_streak INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Check if already checked in today
  SELECT EXISTS (
    SELECT 1 FROM public.daily_checkins
    WHERE user_id = v_uid AND checkin_date = v_today
  ) INTO v_checked_in;

  -- Calculate streak
  SELECT COUNT(*) INTO v_streak
  FROM (
    SELECT checkin_date
    FROM public.daily_checkins
    WHERE user_id = v_uid
      AND checkin_date >= (v_today - INTERVAL '30 days')
    ORDER BY checkin_date DESC
  ) sub
  WHERE checkin_date >= v_today - (ROW_NUMBER() OVER (ORDER BY checkin_date DESC) - 1)::int;

  RETURN jsonb_build_object(
    'checked_in_today', v_checked_in,
    'current_streak', v_streak,
    'next_reward_coins', 5 + (v_streak * 2),
    'today', v_today
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_daily_checkin_status() TO authenticated, service_role;

-- claim_daily_checkin
CREATE OR REPLACE FUNCTION public.claim_daily_checkin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Use safe_check_in with null venue
  v_result := public._safe_check_in_base(v_uid, NULL, 'daily_checkin');

  -- Award coins via grant_rewards if checkin succeeded
  IF (v_result->>'success')::boolean THEN
    PERFORM public.grant_rewards(v_uid, 5, 25, 'daily_checkin');
  END IF;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.claim_daily_checkin() TO authenticated, service_role;

-- get_lucky_wheel_status
CREATE OR REPLACE FUNCTION public.get_lucky_wheel_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_spins_today INTEGER := 0;
  v_max_spins INTEGER := 3;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT COUNT(*) INTO v_spins_today
  FROM public.gamification_logs
  WHERE user_id = v_uid
    AND event_name = 'lucky_wheel_spin'
    AND created_at >= CURRENT_DATE;

  RETURN jsonb_build_object(
    'spins_remaining', GREATEST(0, v_max_spins - v_spins_today),
    'spins_used', v_spins_today,
    'max_spins', v_max_spins,
    'next_reset', (CURRENT_DATE + 1)::text
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_lucky_wheel_status() TO authenticated, service_role;

-- spin_lucky_wheel
CREATE OR REPLACE FUNCTION public.spin_lucky_wheel()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_spins_today INTEGER;
  v_prize_coins INTEGER;
  v_prizes INTEGER[] := ARRAY[1, 2, 3, 5, 10, 15, 20, 50];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Check spin limit
  SELECT COUNT(*) INTO v_spins_today
  FROM public.gamification_logs
  WHERE user_id = v_uid
    AND event_name = 'lucky_wheel_spin'
    AND created_at >= CURRENT_DATE;

  IF v_spins_today >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_spins_remaining');
  END IF;

  -- Random prize
  v_prize_coins := v_prizes[1 + floor(random() * array_length(v_prizes, 1))::int];

  -- Log spin
  INSERT INTO public.gamification_logs (user_id, event_name, payload)
  VALUES (v_uid, 'lucky_wheel_spin', jsonb_build_object('prize_coins', v_prize_coins));

  -- Award prize
  PERFORM public.grant_rewards(v_uid, v_prize_coins, 10, 'lucky_wheel');

  RETURN jsonb_build_object(
    'success', true,
    'prize_coins', v_prize_coins,
    'spins_remaining', GREATEST(0, 2 - v_spins_today)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.spin_lucky_wheel() TO authenticated, service_role;


-- =========================================================================
-- 5. Partner RPCs
-- =========================================================================

-- create_partner_profile
CREATE OR REPLACE FUNCTION public.create_partner_profile(
  p_business_name   TEXT,
  p_contact_email   TEXT DEFAULT NULL,
  p_referral_code   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_partner_id UUID;
  v_code TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Check if already a partner
  SELECT id INTO v_partner_id FROM public.partners WHERE user_id = v_uid;
  IF v_partner_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_partner', 'partner_id', v_partner_id);
  END IF;

  -- Generate referral code
  v_code := COALESCE(NULLIF(TRIM(p_referral_code), ''),
    'VB-' || UPPER(SUBSTR(md5(v_uid::text || now()::text), 1, 8)));

  INSERT INTO public.partners (user_id, business_name, contact_email, referral_code, status)
  VALUES (v_uid, p_business_name, p_contact_email, v_code, 'active')
  RETURNING id INTO v_partner_id;

  RETURN jsonb_build_object(
    'success', true,
    'partner_id', v_partner_id,
    'referral_code', v_code
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_partner_profile(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- upsert_partner_secrets
CREATE OR REPLACE FUNCTION public.upsert_partner_secrets(
  p_partner_id       UUID,
  p_payout_method    TEXT DEFAULT 'bank_transfer',
  p_bank_account     TEXT DEFAULT NULL,
  p_bank_name        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Verify ownership
  IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = p_partner_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner');
  END IF;

  UPDATE public.partners
  SET
    payout_method = COALESCE(p_payout_method, payout_method),
    bank_account  = COALESCE(p_bank_account, bank_account),
    bank_name     = COALESCE(p_bank_name, bank_name),
    updated_at    = now()
  WHERE id = p_partner_id;

  RETURN jsonb_build_object('success', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.upsert_partner_secrets(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Add missing columns to partners table
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS business_name   TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS contact_email   TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS referral_code   TEXT UNIQUE;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'active';
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS payout_method   TEXT DEFAULT 'bank_transfer';
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS bank_account    TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS bank_name       TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT now();

-- get_local_ads
CREATE OR REPLACE FUNCTION public.get_local_ads(
  p_lat   DOUBLE PRECISION DEFAULT NULL,
  p_lng   DOUBLE PRECISION DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS SETOF public.local_ads
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
  -- Create local_ads table if not exists
  -- (already done in previous migration or here as fallback)
  RETURN QUERY
    SELECT *
    FROM public.local_ads la
    WHERE la.is_active = true
      AND (la.expires_at IS NULL OR la.expires_at > now())
    ORDER BY random()
    LIMIT LEAST(p_limit, 20);
END;
$fn$;

-- Ensure local_ads table exists with proper columns
CREATE TABLE IF NOT EXISTS public.local_ads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,
  link_url    TEXT,
  advertiser  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  priority    INTEGER NOT NULL DEFAULT 0,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  radius_km   DOUBLE PRECISION DEFAULT 50,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.local_ads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'local_ads' AND policyname = 'local_ads_public_read'
  ) THEN
    CREATE POLICY local_ads_public_read ON public.local_ads FOR SELECT USING (true);
  END IF;
END $$;

-- Now grant the function (after table is sure to exist)
GRANT EXECUTE ON FUNCTION public.get_local_ads(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER)
  TO anon, authenticated, service_role;


-- =========================================================================
-- 6. Enable V2 Feature Flags
-- =========================================================================
UPDATE public.feature_flags_public SET enabled = true WHERE key = 'use_v2_feed';
UPDATE public.feature_flags_public SET enabled = true WHERE key = 'use_v2_search';


-- =========================================================================
-- 7. Demo Data — Seed Initial Data
-- =========================================================================

-- Demo reviews (only if table is empty)
INSERT INTO public.reviews (venue_id, user_name, rating, comment, reaction)
SELECT
  v.id,
  names.n,
  ratings.r,
  comments.c,
  reactions.re
FROM (SELECT id FROM public.venues WHERE status = 'active' LIMIT 5) v
CROSS JOIN LATERAL (VALUES ('NightOwl_CM'), ('PartyKing'), ('VibeHunter')) AS names(n)
CROSS JOIN LATERAL (VALUES (5.0), (4.5), (4.0)) AS ratings(r)
CROSS JOIN LATERAL (VALUES ('Great atmosphere! 🎉'), ('Love this place ❤️'), ('Must visit spot 🔥')) AS comments(c)
CROSS JOIN LATERAL (VALUES ('❤️'), ('🔥'), ('😍')) AS reactions(re)
WHERE NOT EXISTS (SELECT 1 FROM public.reviews LIMIT 1)
LIMIT 9;

-- Demo leaderboard data (seed user_stats if empty)
INSERT INTO public.user_stats (user_id, coins, xp, level, check_ins_count)
SELECT
  gen_random_uuid(),
  coins_v,
  xp_v,
  GREATEST(1, (xp_v / 100) + 1),
  check_ins_v
FROM (VALUES
  (2450, 5000, 7, 42),
  (2120, 4200, 6, 35),
  (1890, 3800, 5, 28),
  (1200, 2400, 4, 20),
  (800,  1600, 3, 15)
) AS demo(coins_v, xp_v, level_v, check_ins_v)
WHERE NOT EXISTS (SELECT 1 FROM public.user_stats LIMIT 1);


COMMIT;
