-- =============================================================================
-- TRIAD Ads + Analytics Contract
-- Purpose:
--   - Ensure ad delivery tables, analytics logs, hotspot artifacts, and ops logs exist
--   - Keep backward-compatible RPC entrypoints for map effects/hotspots
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS public.local_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID,
  title TEXT NOT NULL,
  image_url TEXT,
  target_url TEXT,
  location geography(Point, 4326),
  radius_m INTEGER NOT NULL DEFAULT 3000,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.local_ads(id) ON DELETE CASCADE,
  venue_id UUID,
  user_id UUID,
  visitor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.local_ads(id) ON DELETE CASCADE,
  venue_id UUID,
  user_id UUID,
  visitor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hotspot_5m (
  bucket_start TIMESTAMPTZ NOT NULL,
  venue_ref TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_start, venue_ref)
);

CREATE TABLE IF NOT EXISTS ops.osm_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.schema_contract_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.map_effect_queue (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_ads_status ON public.local_ads (status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_id ON public.ad_impressions (ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad_id ON public.ad_clicks (ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_logs_event_type ON public.analytics_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotspot_5m_score ON public.hotspot_5m (score DESC, event_count DESC, unique_visitors DESC);
CREATE INDEX IF NOT EXISTS idx_hotspot_5m_bucket ON public.hotspot_5m (bucket_start DESC);
CREATE INDEX IF NOT EXISTS idx_map_effect_queue_created_at ON public.map_effect_queue (created_at);

DO $$
BEGIN
  IF to_regclass('analytics.hotspot_5m') IS NULL THEN
    IF to_regclass('public.hotspot_5m') IS NOT NULL THEN
      EXECUTE '
        CREATE MATERIALIZED VIEW analytics.hotspot_5m AS
        SELECT bucket_start, venue_ref, event_count, unique_visitors, score
        FROM public.hotspot_5m
      ';
    ELSE
      EXECUTE '
        CREATE MATERIALIZED VIEW analytics.hotspot_5m AS
        SELECT
          NULL::timestamptz AS bucket_start,
          NULL::text AS venue_ref,
          0::int AS event_count,
          0::int AS unique_visitors,
          0::numeric AS score
        WHERE false
      ';
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS analytics_hotspot_5m_uidx
  ON analytics.hotspot_5m (bucket_start, venue_ref);

CREATE OR REPLACE VIEW analytics.leaderboard_view AS
SELECT
  us.user_id,
  us.xp,
  us.level,
  us.coins,
  ROW_NUMBER() OVER (ORDER BY us.xp DESC, us.coins DESC, us.user_id::text) AS rank
FROM public.user_stats us;

DO $outer$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rollup_hotspot_5m'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.rollup_hotspot_5m()
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $fndef$
      BEGIN
        IF to_regclass('analytics.hotspot_5m') IS NOT NULL THEN
          BEGIN
            EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.hotspot_5m';
          EXCEPTION WHEN OTHERS THEN
            EXECUTE 'REFRESH MATERIALIZED VIEW analytics.hotspot_5m';
          END;
        END IF;
        RETURN jsonb_build_object('success', true);
      END;
      $fndef$;
    $fn$;
  END IF;
END $outer$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_hotspot_snapshot'
      AND pg_get_function_identity_arguments(p.oid) = 'p_limit integer'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_hotspot_snapshot(p_limit integer DEFAULT 20)
      RETURNS TABLE (
        bucket_start timestamptz,
        venue_ref text,
        event_count integer,
        unique_visitors integer,
        score numeric
      )
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      AS $fndef$
        SELECT
          h.bucket_start,
          h.venue_ref,
          h.event_count,
          h.unique_visitors,
          h.score
        FROM public.hotspot_5m h
        ORDER BY h.score DESC, h.event_count DESC, h.unique_visitors DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));
      $fndef$;
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
      AND p.proname = 'dequeue_map_effects'
      AND pg_get_function_identity_arguments(p.oid) = 'p_limit integer'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.dequeue_map_effects(p_limit integer DEFAULT 50)
      RETURNS TABLE (
        id bigint,
        event_type text,
        payload jsonb,
        created_at timestamptz
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $fndef$
      BEGIN
        RETURN QUERY
        WITH picked AS (
          SELECT q.id
          FROM public.map_effect_queue q
          ORDER BY q.created_at ASC
          LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500))
          FOR UPDATE SKIP LOCKED
        ),
        popped AS (
          DELETE FROM public.map_effect_queue d
          USING picked p
          WHERE d.id = p.id
          RETURNING d.id, d.event_type, d.payload, d.created_at
        )
        SELECT popped.id, popped.event_type, popped.payload, popped.created_at
        FROM popped
        ORDER BY popped.created_at ASC;
      END;
      $fndef$;
    $fn$;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.rollup_hotspot_5m() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_hotspot_snapshot(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dequeue_map_effects(integer) TO authenticated, service_role;

COMMIT;
