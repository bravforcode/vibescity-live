-- =============================================================================
-- Migration: Comprehensive Performance Indexes + RPC Functions
-- Date: 2026-03-09
-- Purpose:
--   1. Add all missing indexes across every major table
--   2. Add get_venue_stats()      — consolidated venue KPIs
--   3. Add get_user_dashboard()   — user profile + wallet + streak
--   4. Add get_venue_entitlements() — active feature flags per venue
--   5. Add cleanup_expired_data() — maintenance cron helper
-- =============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: analytics_events & analytics_logs
-- Hot path: every page view, map interaction, and event touch here
-- ============================================================================

-- Venue-level event lookup (most frequent: "show me analytics for venue X")
CREATE INDEX IF NOT EXISTS idx_ae_venue_created
  ON public.analytics_events (venue_id, created_at DESC)
  WHERE venue_id IS NOT NULL;

-- Event type rollup (daily/hourly aggregation jobs)
CREATE INDEX IF NOT EXISTS idx_ae_type_created
  ON public.analytics_events (event_type, created_at DESC);

-- User-level event history
CREATE INDEX IF NOT EXISTS idx_ae_user_created
  ON public.analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Dedup by event_id (idempotency guard already in use)
CREATE INDEX IF NOT EXISTS idx_ae_event_id
  ON public.analytics_events (event_id)
  WHERE event_id IS NOT NULL;

-- analytics_logs: same pattern
CREATE INDEX IF NOT EXISTS idx_al_type_created
  ON public.analytics_logs (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_al_user_created
  ON public.analytics_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_al_created
  ON public.analytics_logs (created_at DESC);  -- TTL sweep

-- ============================================================================
-- SECTION 2: ad_clicks & ad_impressions
-- Hot path: CTR calculation, campaign dashboards
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_adclk_ad_created
  ON public.ad_clicks (ad_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adclk_venue_created
  ON public.ad_clicks (venue_id, created_at DESC)
  WHERE venue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adclk_visitor
  ON public.ad_clicks (visitor_id, created_at DESC)
  WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adimp_ad_created
  ON public.ad_impressions (ad_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adimp_venue_created
  ON public.ad_impressions (venue_id, created_at DESC)
  WHERE venue_id IS NOT NULL;

-- ============================================================================
-- SECTION 3: orders & payments
-- Hot path: checkout flow, admin dashboard, Stripe webhooks
-- ============================================================================

-- User order history (most common: "my orders" page)
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created
  ON public.orders (user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Admin pipeline: orders by status
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);

-- Venue-level revenue queries
CREATE INDEX IF NOT EXISTS idx_orders_venue_status
  ON public.orders (venue_id, status)
  WHERE venue_id IS NOT NULL;

-- Stripe webhook dedup (called on every Stripe event)
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session
  ON public.orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_sub
  ON public.orders (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Partner attribution
CREATE INDEX IF NOT EXISTS idx_orders_partner
  ON public.orders (partner_id, status, created_at DESC)
  WHERE partner_id IS NOT NULL;

-- Payments lookup by order (FK, always join)
CREATE INDEX IF NOT EXISTS idx_payments_order
  ON public.payments (order_id);

CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON public.payments (status, created_at DESC);

-- ============================================================================
-- SECTION 4: reviews & venue_photos
-- Hot path: venue detail page, moderation queue
-- ============================================================================

-- Venue reviews feed (approved only — partial index = smaller, faster)
CREATE INDEX IF NOT EXISTS idx_reviews_venue_approved
  ON public.reviews (venue_id, created_at DESC)
  WHERE status = 'approved';

-- All reviews for moderation queue (status filter)
CREATE INDEX IF NOT EXISTS idx_reviews_status_created
  ON public.reviews (status, created_at DESC);

-- User's own reviews
CREATE INDEX IF NOT EXISTS idx_reviews_user_created
  ON public.reviews (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Venue photos: approved display
CREATE INDEX IF NOT EXISTS idx_vphotos_venue_approved
  ON public.venue_photos (venue_id, created_at DESC)
  WHERE status = 'approved';

-- Venue photos: moderation
CREATE INDEX IF NOT EXISTS idx_vphotos_status
  ON public.venue_photos (status, created_at DESC);

-- Venue images ordered display
CREATE INDEX IF NOT EXISTS idx_vimages_venue_order
  ON public.venue_images (venue_id, sort_order ASC);

-- ============================================================================
-- SECTION 5: check_ins & daily_checkins
-- Hot path: streak calculation, venue live count, gamification
-- ============================================================================

-- User check-in history
CREATE INDEX IF NOT EXISTS idx_checkins_user_created
  ON public.check_ins (user_id, created_at DESC);

-- Venue check-in count
CREATE INDEX IF NOT EXISTS idx_checkins_venue_created
  ON public.check_ins (venue_id, created_at DESC)
  WHERE venue_id IS NOT NULL;

-- Daily check-in streak calculation (critical: date-keyed lookup)
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date
  ON public.daily_checkins (user_id, checkin_date DESC);

-- Venue popularity by day
CREATE INDEX IF NOT EXISTS idx_daily_checkins_venue_date
  ON public.daily_checkins (venue_id, checkin_date DESC)
  WHERE venue_id IS NOT NULL;

-- Guest check-ins by visitor_id
CREATE INDEX IF NOT EXISTS idx_daily_checkins_visitor_date
  ON public.daily_checkins (visitor_id, checkin_date DESC)
  WHERE visitor_id IS NOT NULL;

-- ============================================================================
-- SECTION 6: user_favorites
-- Hot path: "is this favorited?" toggle check on every venue card render
-- ============================================================================

-- Venue favorite count (how many users favorited a venue)
CREATE INDEX IF NOT EXISTS idx_ufav_venue_created
  ON public.user_favorites (venue_id, created_at DESC);

-- ============================================================================
-- SECTION 7: gamification — coin_ledger, coin_transactions, xp_logs
-- Hot path: wallet balance, transaction history
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_coin_ledger_user_created
  ON public.coin_ledger (user_id, created_at DESC);

-- Idempotency key lookup (used on every reward grant)
CREATE INDEX IF NOT EXISTS idx_coin_ledger_idempotency
  ON public.coin_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coin_tx_user_created
  ON public.coin_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_logs_user_created
  ON public.xp_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gamification_logs_user_created
  ON public.gamification_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- reward_daily_limits: streak reset guard (looked up on every action)
-- PK already covers (user_id, action_name, grant_date) — no extra index needed

-- lucky_wheel_spins: last spin lookup
CREATE INDEX IF NOT EXISTS idx_lucky_spins_user_spin_at
  ON public.lucky_wheel_spins (user_id, spin_at DESC);

-- ============================================================================
-- SECTION 8: notifications
-- Hot path: unread badge count, notification center
-- ============================================================================

-- Unread notifications per user (the most critical query: unread badge)
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE user_id IS NOT NULL AND is_read = false;

-- All notifications for a user (notification center list)
CREATE INDEX IF NOT EXISTS idx_notif_user_created
  ON public.notifications (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Expired notification cleanup
CREATE INDEX IF NOT EXISTS idx_notif_expires
  ON public.notifications (expires_at)
  WHERE expires_at IS NOT NULL;

-- Visitor notifications (guest users)
CREATE INDEX IF NOT EXISTS idx_notif_visitor
  ON public.notifications (visitor_id, created_at DESC)
  WHERE visitor_id IS NOT NULL;

-- ============================================================================
-- SECTION 9: entitlements_ledger (critical for map pin feature flags)
-- Hot path: every map refresh checks is_verified / glow / boost per venue
-- ============================================================================

-- Active entitlements per venue (the most critical join in map rendering)
-- NOTE: no WHERE now() — IMMUTABLE required for index predicates, time filtering at query time
CREATE INDEX IF NOT EXISTS idx_entitlements_venue_feature_active
  ON public.entitlements_ledger (venue_id, feature, ends_at DESC NULLS FIRST);

-- Lookup by order (for receipt/confirmation page)
CREATE INDEX IF NOT EXISTS idx_entitlements_order
  ON public.entitlements_ledger (order_id)
  WHERE order_id IS NOT NULL;

-- ============================================================================
-- SECTION 10: subscriptions
-- Hot path: subscription guard on gated features
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_subs_user_status
  ON public.subscriptions (user_id, status)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subs_stripe_sub
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subs_venue_status
  ON public.subscriptions (venue_id, status)
  WHERE venue_id IS NOT NULL;

-- ============================================================================
-- SECTION 11: partner tables
-- Hot path: partner dashboard, commission reports
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pcl_partner_status_period
  ON public.partner_commission_ledger (partner_id, status, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_pcl_order
  ON public.partner_commission_ledger (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payouts_partner_status
  ON public.partner_payouts (partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_partner
  ON public.partner_referrals (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_venue
  ON public.partner_referrals (venue_id)
  WHERE venue_id IS NOT NULL;

-- ============================================================================
-- SECTION 12: reports & moderation_logs
-- Hot path: moderation queue (admin)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_reports_entity_status
  ON public.reports (entity_id, entity_type, status);

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON public.reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_modlogs_entity
  ON public.moderation_logs (entity_id, entity_type, created_at DESC);

-- ============================================================================
-- SECTION 13: hotspot_5m
-- Hot path: real-time heatmap rendering
-- ============================================================================

-- Venue hotspot score for last N buckets
CREATE INDEX IF NOT EXISTS idx_hotspot_venue_bucket
  ON public.hotspot_5m (venue_ref, bucket_start DESC);

-- Cleanup old buckets (keep last 24h = 288 rows)
CREATE INDEX IF NOT EXISTS idx_hotspot_bucket_start
  ON public.hotspot_5m (bucket_start DESC);

-- ============================================================================
-- SECTION 14: map_effect_queue
-- Hot path: map animation events (short-lived rows)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_map_effect_created
  ON public.map_effect_queue (created_at DESC);

-- ============================================================================
-- SECTION 15: orders idempotency & stripe_webhook_events
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_idempotency
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- stripe_webhook_events: event_type rollup
CREATE INDEX IF NOT EXISTS idx_stripe_wh_type_received
  ON public.stripe_webhook_events (event_type, received_at DESC);

-- ============================================================================
-- SECTION 16: user_submissions
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_submissions_user_status
  ON public.user_submissions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_status_created
  ON public.user_submissions (status, created_at DESC);

-- ============================================================================
-- SECTION 17: authority_places
-- Hot path: admin place import + geographic search
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_aup_province_category
  ON public.authority_places (province, category);

CREATE INDEX IF NOT EXISTS idx_aup_lat_lng
  ON public.authority_places (lat, lng);

CREATE INDEX IF NOT EXISTS idx_aup_authority_id
  ON public.authority_places (authority_id);

-- ============================================================================
-- SECTION 18: venue_official_sources & venue_video_candidates
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vos_venue_active
  ON public.venue_official_sources (venue_id, is_active, priority DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_vvc_venue_status
  ON public.venue_video_candidates (venue_id, status, confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_vvc_status_confidence
  ON public.venue_video_candidates (status, confidence_score DESC)
  WHERE status = 'pending_review';

-- ============================================================================
-- RPC 1: get_venue_stats — consolidated KPIs for venue detail page
--
-- Returns a single row with all counts the frontend needs.
-- Replaces 5 separate SELECT COUNT(*) calls with one fast parallel query.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_venue_stats(uuid);

CREATE FUNCTION public.get_venue_stats(p_venue_id uuid)
RETURNS TABLE (
  venue_id           uuid,
  review_count       bigint,
  avg_rating         numeric,
  checkin_count      bigint,
  checkin_today      bigint,
  favorite_count     bigint,
  photo_count        bigint,
  live_count         integer,
  is_verified        boolean,
  verified_active    boolean,
  glow_active        boolean,
  boost_active       boolean,
  giant_active       boolean,
  hotspot_score      numeric
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    v.id                                              AS venue_id,

    -- Reviews
    COUNT(DISTINCT r.id)                              AS review_count,
    ROUND(AVG(r.rating)::numeric, 1)                  AS avg_rating,

    -- Check-ins (all time)
    COUNT(DISTINCT ci.id)                             AS checkin_count,

    -- Check-ins today
    COUNT(DISTINCT dc.id) FILTER (
      WHERE dc.checkin_date = CURRENT_DATE
    )                                                 AS checkin_today,

    -- Favorites
    COUNT(DISTINCT uf.user_id)                        AS favorite_count,

    -- Photos (approved only)
    COUNT(DISTINCT vp.id) FILTER (
      WHERE vp.status = 'approved'
    )                                                 AS photo_count,

    -- Live count from dedicated table
    COALESCE(vlc.live_count, 0)                       AS live_count,

    -- Venue flags
    COALESCE(v.is_verified, false)                    AS is_verified,
    (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
    (v.glow_until     IS NOT NULL AND v.glow_until     > now()) AS glow_active,
    (v.boost_until    IS NOT NULL AND v.boost_until    > now()) AS boost_active,
    (
      (v.giant_until IS NOT NULL AND v.giant_until > now())
      OR lower(COALESCE(v.pin_type,'')) = 'giant'
    )                                                 AS giant_active,

    -- Hotspot score: sum of last 12 buckets (≈1 hour)
    COALESCE((
      SELECT SUM(h.score)
      FROM public.hotspot_5m h
      WHERE h.venue_ref = v.id::text
        AND h.bucket_start >= now() - interval '1 hour'
    ), 0)                                             AS hotspot_score

  FROM public.venues v
  LEFT JOIN public.reviews r
         ON r.venue_id = v.id AND r.status = 'approved'
  LEFT JOIN public.check_ins ci
         ON ci.venue_id = v.id
  LEFT JOIN public.daily_checkins dc
         ON dc.venue_id = v.id
  LEFT JOIN public.user_favorites uf
         ON uf.venue_id = v.id
  LEFT JOIN public.venue_photos vp
         ON vp.venue_id = v.id
  LEFT JOIN public.venue_live_counts vlc
         ON vlc.venue_id = v.id
  WHERE v.id = p_venue_id
  GROUP BY v.id, v.is_verified, v.verified_until, v.glow_until,
           v.boost_until, v.giant_until, v.pin_type, vlc.live_count
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_stats(uuid)
  TO anon, authenticated, service_role;

-- ============================================================================
-- RPC 2: get_user_dashboard — user wallet + stats + streak in one call
--
-- Replaces 3-4 separate calls on profile page load.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_user_dashboard(uuid);

CREATE FUNCTION public.get_user_dashboard(p_user_id uuid)
RETURNS TABLE (
  user_id           uuid,
  display_name      text,
  avatar_url        text,
  coins             integer,
  xp                integer,
  level             integer,
  streak            integer,
  total_days        integer,
  submissions_count integer,
  check_ins_count   integer,
  photos_count      integer,
  favorite_count    bigint,
  last_checkin_at   timestamptz,
  last_spin_at      timestamptz,
  is_spin_available boolean
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    us.user_id,
    up.display_name,
    up.avatar_url,

    -- Use user_stats as source of truth for balances
    us.coins,
    us.xp,
    us.level,
    us.streak,
    us.total_days,
    us.submissions_count,
    us.check_ins_count,
    us.photos_count,

    -- Favorite count (live count from user_favorites)
    (SELECT COUNT(*) FROM public.user_favorites uf WHERE uf.user_id = p_user_id)
      AS favorite_count,

    us.last_checkin_at,
    us.last_spin_at,

    -- Spin availability: last spin was >24h ago or never
    (us.last_spin_at IS NULL OR us.last_spin_at < now() - interval '24 hours')
      AS is_spin_available

  FROM public.user_stats us
  LEFT JOIN public.user_profiles up ON up.user_id = us.user_id
  WHERE us.user_id = p_user_id
$$;

GRANT EXECUTE ON FUNCTION public.get_user_dashboard(uuid)
  TO authenticated, service_role;

-- ============================================================================
-- RPC 3: get_venue_entitlements — active feature flags for a venue
--
-- Used by map + venue detail to know which premium features are active.
-- Single fast lookup replacing multiple time-range queries.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_venue_entitlements(uuid);

CREATE FUNCTION public.get_venue_entitlements(p_venue_id uuid)
RETURNS TABLE (
  venue_id        uuid,
  feature         text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  days_remaining  integer,
  is_active       boolean
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    el.venue_id,
    el.feature,
    el.starts_at,
    el.ends_at,
    CASE
      WHEN el.ends_at IS NULL THEN NULL
      ELSE GREATEST(0, (el.ends_at::date - CURRENT_DATE)::integer)
    END                            AS days_remaining,
    (
      (el.starts_at IS NULL OR el.starts_at <= now())
      AND (el.ends_at IS NULL   OR el.ends_at   > now())
    )                              AS is_active
  FROM public.entitlements_ledger el
  WHERE el.venue_id = p_venue_id
    AND (el.ends_at IS NULL OR el.ends_at > now())
  ORDER BY el.feature, el.ends_at DESC NULLS FIRST
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_entitlements(uuid)
  TO anon, authenticated, service_role;

-- ============================================================================
-- RPC 4: cleanup_expired_data — maintenance helper (run as cron or pg_cron)
--
-- Removes rows that are safe to delete to keep tables lean.
-- Returns counts of deleted rows for logging.
-- ============================================================================

DROP FUNCTION IF EXISTS public.cleanup_expired_data();

CREATE FUNCTION public.cleanup_expired_data()
RETURNS TABLE (
  table_name   text,
  deleted_rows bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count bigint;
BEGIN
  -- 1. Expired notifications
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'notifications'::text, v_count;

  -- 2. Old map_effect_queue rows (keep last 1 hour only)
  DELETE FROM public.map_effect_queue
  WHERE created_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'map_effect_queue'::text, v_count;

  -- 3. Old hotspot_5m rows (keep last 48 hours = 576 buckets)
  DELETE FROM public.hotspot_5m
  WHERE bucket_start < now() - interval '48 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'hotspot_5m'::text, v_count;

  -- 4. Old analytics_events (keep 90 days)
  DELETE FROM public.analytics_events
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'analytics_events'::text, v_count;

  -- 5. Old analytics_logs (keep 90 days)
  DELETE FROM public.analytics_logs
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'analytics_logs'::text, v_count;

  -- 6. Old ad_clicks (keep 180 days for billing)
  DELETE FROM public.ad_clicks
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'ad_clicks'::text, v_count;

  -- 7. Old ad_impressions (keep 180 days)
  DELETE FROM public.ad_impressions
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'ad_impressions'::text, v_count;

  -- 8. Old sheet_sync_fallback_queue (keep successfully synced for 7 days)
  DELETE FROM public.sheet_sync_fallback_queue
  WHERE synced = true AND synced_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'sheet_sync_fallback_queue'::text, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_data()
  TO service_role;

-- ============================================================================
-- NOTE: venues table has duplicate columns that are safe to clean up
-- in a future migration after verifying frontend references:
--
--   "Video_URL"   → same as video_url (keep lowercase, drop mixed-case)
--   "Image_URL1"  → redundant with image_urls[1]
--   "IG_URL"      → same as ig_url
--   "FB_URL"      → same as fb_url
--   "TikTok_URL"  → same as tiktok_url
--
-- These are NOT dropped here to avoid breaking existing queries.
-- Run these only after confirming no frontend/backend reads the old names:
--
-- ALTER TABLE public.venues
--   DROP COLUMN IF EXISTS "Video_URL",
--   DROP COLUMN IF EXISTS "Image_URL1",
--   DROP COLUMN IF EXISTS "IG_URL",
--   DROP COLUMN IF EXISTS "FB_URL",
--   DROP COLUMN IF EXISTS "TikTok_URL";
-- ============================================================================

COMMIT;
