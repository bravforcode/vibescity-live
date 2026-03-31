-- =============================================================================
-- TRIAD Index + Performance Contract
-- Purpose:
--   - Add read-path indexes for feed/map/search
--   - Add churn-table tuning and BRIN indexes
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS name_normalized TEXT;

UPDATE public.venues
SET name_normalized = lower(regexp_replace(COALESCE(name, ''), '[^[:alnum:]]+', '', 'g'))
WHERE name_normalized IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'h3_cell'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_venues_status_h3_cell
             ON public.venues (status, h3_cell)
             WHERE h3_cell IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_venues_status_category_id
             ON public.venues (status, category_id)
             WHERE category_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_venues_status_category
             ON public.venues (status, category)
             WHERE category IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'name_normalized'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_venues_name_normalized_trgm
             ON public.venues USING GIN (name_normalized gin_trgm_ops)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'social_links'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_venues_social_links_gin
             ON public.venues USING GIN (social_links)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'metadata'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_venues_metadata_gin
             ON public.venues USING GIN (metadata)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brin_orders_created_at ON public.orders USING BRIN (created_at)';
  END IF;
  IF to_regclass('public.xp_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brin_xp_logs_created_at ON public.xp_logs USING BRIN (created_at)';
  END IF;
  IF to_regclass('public.coin_transactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brin_coin_transactions_created_at ON public.coin_transactions USING BRIN (created_at)';
  END IF;
  IF to_regclass('public.gamification_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brin_gamification_logs_created_at ON public.gamification_logs USING BRIN (created_at)';
  END IF;
  IF to_regclass('public.ad_impressions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brin_ad_impressions_created_at ON public.ad_impressions USING BRIN (created_at)';
  END IF;
  IF to_regclass('public.ad_clicks') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brin_ad_clicks_created_at ON public.ad_clicks USING BRIN (created_at)';
  END IF;
  IF to_regclass('public.analytics_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brin_analytics_logs_created_at ON public.analytics_logs USING BRIN (created_at)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02)';
  END IF;
  IF to_regclass('public.xp_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.xp_logs SET (autovacuum_vacuum_scale_factor = 0.03, autovacuum_analyze_scale_factor = 0.01)';
  END IF;
  IF to_regclass('public.coin_transactions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.coin_transactions SET (autovacuum_vacuum_scale_factor = 0.03, autovacuum_analyze_scale_factor = 0.01)';
  END IF;
  IF to_regclass('public.gamification_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.gamification_logs SET (autovacuum_vacuum_scale_factor = 0.03, autovacuum_analyze_scale_factor = 0.01)';
  END IF;
  IF to_regclass('public.ad_impressions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ad_impressions SET (autovacuum_vacuum_scale_factor = 0.03, autovacuum_analyze_scale_factor = 0.01)';
  END IF;
  IF to_regclass('public.ad_clicks') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ad_clicks SET (autovacuum_vacuum_scale_factor = 0.03, autovacuum_analyze_scale_factor = 0.01)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('analytics.hotspot_5m') IS NOT NULL THEN
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.hotspot_5m;
    EXCEPTION WHEN OTHERS THEN
      REFRESH MATERIALIZED VIEW analytics.hotspot_5m;
    END;
  END IF;
END $$;

COMMIT;
