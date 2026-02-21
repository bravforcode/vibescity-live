-- Purpose: Finalize server-driven feed/search v2 and venue_stats rollup semantics.
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.venue_stats, public.refresh_venue_stats, public.get_feed_cards_v2, public.search_venues_v2, public.feature_flags
-- Risks (tier): High
-- Rollback plan:
--   - Recreate prior function signatures from previous migrations.
--   - Keep added columns (non-breaking) and forward-fix behavior if needed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.safe_to_double(p_text TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL THEN NULL
    WHEN p_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN p_text::DOUBLE PRECISION
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_venue_search_vector_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_doc TEXT;
BEGIN
  v_doc := concat_ws(
    ' ',
    COALESCE(NEW.name, ''),
    COALESCE(NEW.name_en, ''),
    COALESCE(NEW.name_th, ''),
    COALESCE(NEW.category, ''),
    COALESCE(NEW.description, ''),
    COALESCE(NEW.floor, ''),
    COALESCE(NEW.zone, ''),
    COALESCE(NEW.district, ''),
    COALESCE(NEW.province, '')
  );

  NEW.search_vector := to_tsvector('simple', v_doc);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_search_vector_v2_trg ON public.venues;
CREATE TRIGGER venues_search_vector_v2_trg
BEFORE INSERT OR UPDATE OF name, name_en, name_th, category, description, floor, zone, district, province
ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.set_venue_search_vector_v2();

UPDATE public.venues
SET search_vector = to_tsvector(
  'simple',
  concat_ws(
    ' ',
    COALESCE(name, ''),
    COALESCE(name_en, ''),
    COALESCE(name_th, ''),
    COALESCE(category, ''),
    COALESCE(description, ''),
    COALESCE(floor, ''),
    COALESCE(zone, ''),
    COALESCE(district, ''),
    COALESCE(province, '')
  )
)
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS venues_search_vector_gin_v2_idx
  ON public.venues USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS venues_name_trgm_v2_idx
  ON public.venues USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.venue_stats (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE
);

ALTER TABLE public.venue_stats
  ADD COLUMN IF NOT EXISTS total_views BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkin_count_24h INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_24h INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks_24h INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_24h INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkouts_24h INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_24h INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vibe_score NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ranking_score NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS venue_stats_ranking_score_v2_idx
  ON public.venue_stats (ranking_score DESC, refreshed_at DESC);

CREATE OR REPLACE FUNCTION public.refresh_venue_stats()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  WITH src AS (
    SELECT
      CASE
        WHEN COALESCE(shop_id::TEXT, venue_ref) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN COALESCE(shop_id::TEXT, venue_ref)::UUID
        ELSE NULL
      END AS venue_id,
      lower(COALESCE(event_type, '')) AS event_type,
      created_at,
      COALESCE(metadata, '{}'::jsonb) AS metadata
    FROM public.analytics_events_p
    WHERE created_at >= (NOW() - INTERVAL '24 hours')
  ),
  agg AS (
    SELECT
      venue_id,
      COUNT(*) FILTER (
        WHERE
          event_type = 'open_detail'
          OR (
            event_type = 'video_view'
            AND GREATEST(
              COALESCE(NULLIF((metadata ->> 'view_seconds'), '')::NUMERIC, 0),
              COALESCE(NULLIF((metadata ->> 'watch_seconds'), '')::NUMERIC, 0),
              COALESCE(NULLIF((metadata ->> 'duration_seconds'), '')::NUMERIC, 0),
              COALESCE(NULLIF((metadata ->> 'duration_ms'), '')::NUMERIC / 1000.0, 0)
            ) >= 3
          )
      ) AS total_views,
      COUNT(*) FILTER (WHERE event_type = 'checkin_confirm') AS checkin_count_24h,
      COUNT(*) FILTER (WHERE event_type IN ('click', 'tap')) AS clicks_24h,
      COUNT(*) FILTER (WHERE event_type IN ('call', 'click_call')) AS calls_24h,
      COUNT(*) FILTER (WHERE event_type IN ('checkout_start', 'checkout')) AS checkouts_24h,
      COUNT(*) FILTER (WHERE event_type IN ('paid', 'payment_success', 'invoice.payment_succeeded')) AS paid_24h
    FROM src
    WHERE venue_id IS NOT NULL
    GROUP BY venue_id
  )
  INSERT INTO public.venue_stats (
    venue_id,
    total_views,
    view_count,
    views_24h,
    checkin_count_24h,
    clicks_24h,
    calls_24h,
    checkouts_24h,
    paid_24h,
    vibe_score,
    ranking_score,
    refreshed_at,
    updated_at
  )
  SELECT
    a.venue_id,
    COALESCE(a.total_views, 0),
    COALESCE(a.total_views, 0),
    COALESCE(a.total_views, 0)::INTEGER,
    COALESCE(a.checkin_count_24h, 0),
    COALESCE(a.clicks_24h, 0),
    COALESCE(a.calls_24h, 0),
    COALESCE(a.checkouts_24h, 0),
    COALESCE(a.paid_24h, 0),
    (
      COALESCE(a.total_views, 0) * 1.0 +
      COALESCE(a.checkin_count_24h, 0) * 2.0 +
      COALESCE(a.clicks_24h, 0) * 0.5 +
      COALESCE(a.checkouts_24h, 0) * 2.5 +
      COALESCE(a.paid_24h, 0) * 4.0
    )::NUMERIC(12, 2) AS vibe_score,
    (
      COALESCE(a.total_views, 0) * 1.0 +
      COALESCE(a.checkin_count_24h, 0) * 3.0 +
      COALESCE(a.paid_24h, 0) * 5.0
    )::NUMERIC(14, 2) AS ranking_score,
    NOW(),
    NOW()
  FROM agg a
  ON CONFLICT (venue_id) DO UPDATE
  SET
    total_views = EXCLUDED.total_views,
    view_count = EXCLUDED.view_count,
    views_24h = EXCLUDED.views_24h,
    checkin_count_24h = EXCLUDED.checkin_count_24h,
    clicks_24h = EXCLUDED.clicks_24h,
    calls_24h = EXCLUDED.calls_24h,
    checkouts_24h = EXCLUDED.checkouts_24h,
    paid_24h = EXCLUDED.paid_24h,
    vibe_score = EXCLUDED.vibe_score,
    ranking_score = EXCLUDED.ranking_score,
    refreshed_at = NOW(),
    updated_at = NOW();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN COALESCE(v_rows, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_feed_cards_v2(
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  image_url TEXT,
  category TEXT,
  rating NUMERIC,
  status TEXT,
  distance_meters DOUBLE PRECISION,
  view_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      v.id,
      v.name,
      NULLIF(v.slug, '') AS slug,
      COALESCE((v.image_urls)[1], to_jsonb(v) ->> 'Image_URL1') AS image_url,
      v.category,
      COALESCE(v.rating, 0)::NUMERIC AS rating,
      COALESCE(v.status, 'OPEN') AS status,
      COALESCE(vs.total_views, 0)::BIGINT AS view_count,
      (
        COALESCE((v.pin_metadata ->> 'is_promoted')::BOOLEAN, FALSE)
        OR (v.boost_until IS NOT NULL AND v.boost_until > NOW())
        OR COALESCE(v.visibility_score, 0) > 0
      ) AS is_promoted,
      public.safe_to_double(COALESCE(to_jsonb(v) ->> 'latitude', to_jsonb(v) ->> 'lat')) AS lat,
      public.safe_to_double(COALESCE(to_jsonb(v) ->> 'longitude', to_jsonb(v) ->> 'lng')) AS lng
    FROM public.venues v
    LEFT JOIN public.venue_stats vs ON vs.venue_id = v.id
    WHERE COALESCE(v.status, 'OPEN') NOT IN ('OFF', 'INACTIVE')
  )
  SELECT
    b.id,
    b.name,
    b.slug,
    b.image_url,
    b.category,
    b.rating,
    b.status,
    CASE
      WHEN b.lat IS NULL OR b.lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN NULL
      ELSE ST_Distance(
        ST_SetSRID(ST_MakePoint(b.lng, b.lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      )
    END AS distance_meters,
    b.view_count
  FROM base b
  ORDER BY
    CASE WHEN b.is_promoted THEN 1 ELSE 0 END DESC,
    CASE WHEN upper(COALESCE(b.status, '')) = 'LIVE' THEN 1 ELSE 0 END DESC,
    distance_meters ASC NULLS LAST,
    b.view_count DESC,
    b.name ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.search_venues_v2(
  p_query TEXT,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_radius_meters DOUBLE PRECISION DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  image_url TEXT,
  category TEXT,
  rating NUMERIC,
  status TEXT,
  distance_meters DOUBLE PRECISION,
  view_count BIGINT,
  highlight_snippet TEXT,
  floor TEXT,
  zone TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_query TEXT := trim(COALESCE(p_query, ''));
  v_tsquery tsquery;
BEGIN
  IF v_query = '' THEN
    RETURN;
  END IF;

  BEGIN
    v_tsquery := websearch_to_tsquery('simple', v_query);
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := to_tsquery('simple', regexp_replace(v_query, '\s+', ':* & ', 'g') || ':*');
  END;

  RETURN QUERY
  WITH base AS (
    SELECT
      v.id,
      v.name,
      NULLIF(v.slug, '') AS slug,
      COALESCE((v.image_urls)[1], to_jsonb(v) ->> 'Image_URL1') AS image_url,
      v.category,
      COALESCE(v.rating, 0)::NUMERIC AS rating,
      COALESCE(v.status, 'OPEN') AS status,
      COALESCE(vs.total_views, 0)::BIGINT AS view_count,
      COALESCE(v.floor, NULLIF(to_jsonb(v) ->> 'Floor', '')) AS floor,
      COALESCE(v.zone, v.district, NULLIF(to_jsonb(v) ->> 'Zone', '')) AS zone,
      (
        COALESCE((v.pin_metadata ->> 'is_promoted')::BOOLEAN, FALSE)
        OR (v.boost_until IS NOT NULL AND v.boost_until > NOW())
        OR COALESCE(v.visibility_score, 0) > 0
      ) AS is_promoted,
      public.safe_to_double(COALESCE(to_jsonb(v) ->> 'latitude', to_jsonb(v) ->> 'lat')) AS lat,
      public.safe_to_double(COALESCE(to_jsonb(v) ->> 'longitude', to_jsonb(v) ->> 'lng')) AS lng,
      ts_rank_cd(v.search_vector, v_tsquery) AS search_rank,
      ts_headline(
        'simple',
        concat_ws(' ', v.name, v.category, v.description),
        v_tsquery,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=18, MinWords=6'
      ) AS highlight_snippet
    FROM public.venues v
    LEFT JOIN public.venue_stats vs ON vs.venue_id = v.id
    WHERE
      COALESCE(v.status, 'OPEN') NOT IN ('OFF', 'INACTIVE')
      AND (
        v.search_vector @@ v_tsquery
        OR v.name ILIKE (v_query || '%')
      )
  ),
  with_dist AS (
    SELECT
      b.*,
      CASE
        WHEN b.lat IS NULL OR b.lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN NULL
        ELSE ST_Distance(
          ST_SetSRID(ST_MakePoint(b.lng, b.lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        )
      END AS distance_meters
    FROM base b
  )
  SELECT
    w.id,
    w.name,
    w.slug,
    w.image_url,
    w.category,
    w.rating,
    w.status,
    w.distance_meters,
    w.view_count,
    w.highlight_snippet,
    w.floor,
    w.zone
  FROM with_dist w
  WHERE p_radius_meters IS NULL OR w.distance_meters IS NULL OR w.distance_meters <= p_radius_meters
  ORDER BY
    CASE WHEN w.is_promoted THEN 1 ELSE 0 END DESC,
    CASE WHEN upper(COALESCE(w.status, '')) = 'LIVE' THEN 1 ELSE 0 END DESC,
    w.search_rank DESC,
    w.distance_meters ASC NULLS LAST,
    w.view_count DESC,
    w.name ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_venue_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_feed_cards_v2(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_venues_v2(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'refresh_venue_stats_15m_v2';

    PERFORM cron.schedule(
      'refresh_venue_stats_15m_v2',
      '*/15 * * * *',
      $cron$SELECT public.refresh_venue_stats();$cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'feature_flags'
  ) THEN
    INSERT INTO public.feature_flags (key, description, enabled, public)
    VALUES
      ('use_v2_feed', 'Use feed/search RPC v2 for public feed', TRUE, TRUE),
      ('use_v2_search', 'Use search RPC v2 for global search', TRUE, TRUE),
      ('enable_web_vitals', 'Collect client web-vitals via analytics-ingest', FALSE, TRUE),
      ('enable_partner_program', 'Enable partner program MVP surface', FALSE, TRUE),
      ('enable_cinema_mall_explorer', 'Enable giant-pin cinema mall explorer overlay', FALSE, TRUE)
    ON CONFLICT (key) DO UPDATE
    SET description = EXCLUDED.description;
  END IF;
END;
$$;
