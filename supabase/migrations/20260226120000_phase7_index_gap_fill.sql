-- =============================================================================
-- PHASE 7: Index Gap-Fill — FK, Partial, GIN/GiST, Autovacuum
-- Date: 2026-02-26
-- Purpose:
--   Fill all missing FK indexes across every table
--   Add partial indexes for hot query paths (pending moderation, active ads)
--   Add GIN/GiST indexes on remaining JSONB/spatial columns
--   Tune autovacuum on high-churn tables
-- Safety: All IF NOT EXISTS — safe to re-run
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. FK B-Tree Indexes (22 indexes)
-- ─────────────────────────────────────────────────────────────

-- reviews
CREATE INDEX IF NOT EXISTS idx_reviews_user_id
  ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_venue_created
  ON public.reviews (venue_id, created_at DESC);

-- check_ins
CREATE INDEX IF NOT EXISTS idx_checkins_user_created
  ON public.check_ins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_venue_id
  ON public.check_ins (venue_id);

-- daily_checkins
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date
  ON public.daily_checkins (user_id, checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_venue_id
  ON public.daily_checkins (venue_id);

-- coin_transactions
CREATE INDEX IF NOT EXISTS idx_coin_tx_user_created
  ON public.coin_transactions (user_id, created_at DESC);

-- xp_logs (user_id compound — complements existing BRIN on created_at)
CREATE INDEX IF NOT EXISTS idx_xp_logs_user_created
  ON public.xp_logs (user_id, created_at DESC);

-- lucky_wheel_spins
CREATE INDEX IF NOT EXISTS idx_lucky_spins_user_spin
  ON public.lucky_wheel_spins (user_id, spin_at DESC);

-- venue_images
CREATE INDEX IF NOT EXISTS idx_venue_images_venue_sort
  ON public.venue_images (venue_id, sort_order);

-- venue_photos (user lookup)
CREATE INDEX IF NOT EXISTS idx_venue_photos_user_id
  ON public.venue_photos (user_id);

-- redemptions
CREATE INDEX IF NOT EXISTS idx_redemptions_user_id
  ON public.redemptions (user_id);

-- ad_clicks & ad_impressions (FK to local_ads)
CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad_id
  ON public.ad_clicks (ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_id
  ON public.ad_impressions (ad_id);

-- partner_referrals
CREATE INDEX IF NOT EXISTS idx_partner_referrals_partner
  ON public.partner_referrals (partner_id);

-- partner_commission_ledger
CREATE INDEX IF NOT EXISTS idx_partner_comm_partner_created
  ON public.partner_commission_ledger (partner_id, created_at DESC);

-- partner_memberships
CREATE INDEX IF NOT EXISTS idx_partner_memberships_partner
  ON public.partner_memberships (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_memberships_user
  ON public.partner_memberships (user_id);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_order_id
  ON public.payments (order_id);

-- user_favorites (reverse lookup by venue)
CREATE INDEX IF NOT EXISTS idx_user_favorites_venue_id
  ON public.user_favorites (venue_id);

-- entitlements_ledger (user lookup)
CREATE INDEX IF NOT EXISTS idx_entitlements_user_id
  ON public.entitlements_ledger (user_id);

-- gamification_logs
CREATE INDEX IF NOT EXISTS idx_gamification_logs_user_id
  ON public.gamification_logs (user_id);


-- ─────────────────────────────────────────────────────────────
-- 2. Partial Indexes for Hot Query Paths (5 indexes)
-- ─────────────────────────────────────────────────────────────

-- Pending reviews awaiting moderation
CREATE INDEX IF NOT EXISTS idx_reviews_pending
  ON public.reviews (created_at DESC)
  WHERE status = 'pending';

-- Pending venue photos awaiting approval
CREATE INDEX IF NOT EXISTS idx_venue_photos_pending
  ON public.venue_photos (created_at DESC)
  WHERE status = 'pending';

-- Pending user submissions
CREATE INDEX IF NOT EXISTS idx_user_submissions_pending
  ON public.user_submissions (created_at DESC)
  WHERE status = 'pending';

-- Active local ads (for map radius queries)
CREATE INDEX IF NOT EXISTS idx_local_ads_active
  ON public.local_ads (starts_at, ends_at)
  WHERE status = 'active';

-- Pending orders (payment processing queue)
CREATE INDEX IF NOT EXISTS idx_orders_pending
  ON public.orders (created_at DESC)
  WHERE status = 'pending';


-- ─────────────────────────────────────────────────────────────
-- 3. GIN / GiST Indexes on Remaining Columns (2 indexes)
-- ─────────────────────────────────────────────────────────────

-- orders.metadata (for JSONB queries like sku filtering, partner lookups)
CREATE INDEX IF NOT EXISTS idx_orders_metadata_gin
  ON public.orders USING GIN (metadata);

-- local_ads.location — GiST spatial index for proximity queries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'local_ads' AND column_name = 'location'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_local_ads_location_gist
             ON public.local_ads USING GIST (location)';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 4. Autovacuum Tuning for High-Churn Tables
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.reviews SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02)';
  END IF;
  IF to_regclass('public.check_ins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.check_ins SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02)';
  END IF;
  IF to_regclass('public.daily_checkins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.daily_checkins SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02)';
  END IF;
  IF to_regclass('public.lucky_wheel_spins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lucky_wheel_spins SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02)';
  END IF;
  IF to_regclass('public.venue_photos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.venue_photos SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02)';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 5. Refresh Statistics
-- ─────────────────────────────────────────────────────────────

ANALYZE public.reviews;
ANALYZE public.check_ins;
ANALYZE public.daily_checkins;
ANALYZE public.coin_transactions;
ANALYZE public.xp_logs;
ANALYZE public.venue_photos;
ANALYZE public.orders;
ANALYZE public.local_ads;
ANALYZE public.partner_commission_ledger;
ANALYZE public.payments;

COMMIT;
