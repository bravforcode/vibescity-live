-- =============================================================================
-- Migration: Complete Schema — All Missing Tables, Views, RPCs
-- Date: 2026-02-23
-- Purpose: Fill every gap between the codebase and the database
-- Features: idempotent (safe to re-run), forward-only
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================
-- 1. feature_flags_public — Feature Toggle System
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.feature_flags_public (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default flags (idempotent via ON CONFLICT)
INSERT INTO public.feature_flags_public (key, enabled, description) VALUES
  ('use_v2_feed',               false, 'Enable V2 feed RPC (get_feed_cards_v2)'),
  ('use_v2_search',             false, 'Enable V2 search RPC (search_venues_v2)'),
  ('enable_web_vitals',         false, 'Enable Web Vitals reporting'),
  ('enable_partner_program',    false, 'Enable Partner referral program'),
  ('enable_cinema_mall_explorer', false, 'Enable Cinema/Mall indoor explorer')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.feature_flags_public ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feature_flags_public' AND policyname = 'feature_flags_public_read_all'
  ) THEN
    CREATE POLICY feature_flags_public_read_all ON public.feature_flags_public FOR SELECT USING (true);
  END IF;
END $$;

-- =========================================================================
-- 2. user_profiles — User Profile Data
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE,
  username     TEXT DEFAULT 'VibeExplorer',
  display_name TEXT DEFAULT 'Guest User',
  avatar       TEXT,
  bio          TEXT DEFAULT '',
  level        INTEGER NOT NULL DEFAULT 1,
  xp           INTEGER NOT NULL DEFAULT 0,
  total_coins  INTEGER NOT NULL DEFAULT 0,
  badges       JSONB NOT NULL DEFAULT '[]'::jsonb,
  joined_at    TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'user_profiles_own_read'
  ) THEN
    CREATE POLICY user_profiles_own_read ON public.user_profiles FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'user_profiles_own_write'
  ) THEN
    CREATE POLICY user_profiles_own_write ON public.user_profiles FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles (user_id);

-- =========================================================================
-- 3. user_favorites — Bookmark/Favorite Venues
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  venue_id   UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_favorites' AND policyname = 'user_favorites_own_read'
  ) THEN
    CREATE POLICY user_favorites_own_read ON public.user_favorites FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_favorites' AND policyname = 'user_favorites_own_write'
  ) THEN
    CREATE POLICY user_favorites_own_write ON public.user_favorites FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON public.user_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_venue ON public.user_favorites (venue_id);

-- =========================================================================
-- 4. reviews — Venue Review System
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID NOT NULL,
  user_id     UUID,
  user_name   TEXT DEFAULT 'Anonymous',
  rating      NUMERIC(2,1) NOT NULL DEFAULT 5.0 CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT DEFAULT '',
  reaction    TEXT,
  helpful     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'reviews_public_read'
  ) THEN
    CREATE POLICY reviews_public_read ON public.reviews FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'reviews_anon_insert'
  ) THEN
    CREATE POLICY reviews_anon_insert ON public.reviews FOR INSERT WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reviews_venue ON public.reviews (venue_id, created_at DESC);

-- =========================================================================
-- 5. buildings — Building/Floor Plan Data
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.buildings (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'buildings' AND policyname = 'buildings_public_read'
  ) THEN
    CREATE POLICY buildings_public_read ON public.buildings FOR SELECT USING (true);
  END IF;
END $$;

-- =========================================================================
-- 6. user_submissions — User-Generated Content / UGC Edits
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  visitor_id      TEXT,
  venue_id        UUID,
  submission_type TEXT NOT NULL DEFAULT 'add_venue',
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_submissions' AND policyname = 'user_submissions_insert_all'
  ) THEN
    CREATE POLICY user_submissions_insert_all ON public.user_submissions FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_submissions' AND policyname = 'user_submissions_read_own'
  ) THEN
    CREATE POLICY user_submissions_read_own ON public.user_submissions FOR SELECT
      USING (auth.uid() = user_id OR visitor_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_submissions_status ON public.user_submissions (status, created_at DESC);

-- =========================================================================
-- 7. venue_slug_history — URL Slug Redirect History
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.venue_slug_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID NOT NULL,
  old_slug   TEXT NOT NULL,
  new_slug   TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_slug_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_slug_history' AND policyname = 'venue_slug_history_public_read'
  ) THEN
    CREATE POLICY venue_slug_history_public_read ON public.venue_slug_history FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_venue_slug_history_old ON public.venue_slug_history (old_slug);

-- =========================================================================
-- 8. venue_live_counts — Real-time Visitor Count (VIEW)
-- =========================================================================
-- This is a view that returns simulated/default counts when no real data exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'venue_live_counts'
  ) THEN
    EXECUTE '
      CREATE VIEW public.venue_live_counts AS
      SELECT
        v.id AS venue_id,
        COALESCE(v.total_views, 0) AS user_count
      FROM public.venues v
      WHERE v.status = ''active''
    ';
  END IF;
END $$;


-- =========================================================================
-- =========================================================================
-- RPC FUNCTIONS
-- =========================================================================
-- =========================================================================


-- =========================================================================
-- RPC 1: increment_venue_views — Atomically increment view counter
-- =========================================================================
CREATE OR REPLACE FUNCTION public.increment_venue_views(venue_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.venues
  SET total_views = COALESCE(total_views, 0) + 1,
      view_count  = COALESCE(view_count, 0) + 1
  WHERE id = venue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_venue_views(UUID) TO anon, authenticated, service_role;


-- =========================================================================
-- RPC 2: get_feed_cards — Feed cards v1 (distance based)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_feed_cards(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  slug            TEXT,
  category        TEXT,
  status          TEXT,
  province        TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  image_urls      TEXT[],
  rating          NUMERIC,
  review_count    INTEGER,
  total_views     INTEGER,
  pin_type        TEXT,
  pin_metadata    JSONB,
  is_verified     BOOLEAN,
  verified_active BOOLEAN,
  glow_active     BOOLEAN,
  boost_active    BOOLEAN,
  giant_active    BOOLEAN,
  distance_km     DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $fn$
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
      COALESCE(v.pin_metadata, '{}'::jsonb)              AS pin_metadata,
      COALESCE(v.is_verified, false)                     AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until     IS NOT NULL AND v.glow_until     > now()) AS glow_active,
      (v.boost_until    IS NOT NULL AND v.boost_until    > now()) AS boost_active,
      (v.giant_until    IS NOT NULL AND v.giant_until    > now()) AS giant_active,
      CASE
        WHEN v.location IS NOT NULL THEN
          st_distancesphere(
            v.location::geometry,
            st_makepoint(p_lng, p_lat)
          ) / 1000.0
        WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
          st_distancesphere(
            st_makepoint(v.longitude, v.latitude),
            st_makepoint(p_lng, p_lat)
          ) / 1000.0
        ELSE 9999.0
      END AS distance_km
    FROM public.venues v
    WHERE v.status = 'active'
    ORDER BY distance_km ASC
    LIMIT 30;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_feed_cards(DOUBLE PRECISION, DOUBLE PRECISION)
  TO anon, authenticated, service_role;


-- =========================================================================
-- RPC 3: get_feed_cards_v2 — Feed cards v2 with pagination
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_feed_cards_v2(
  p_lat    DOUBLE PRECISION,
  p_lng    DOUBLE PRECISION,
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  slug            TEXT,
  category        TEXT,
  status          TEXT,
  image_url       TEXT,
  rating          NUMERIC,
  view_count      INTEGER,
  distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
  RETURN QUERY
    SELECT
      v.id,
      v.name,
      v.slug,
      v.category,
      v.status,
      v.image_urls[1]                                    AS image_url,
      COALESCE(v.rating, 0)::numeric                     AS rating,
      COALESCE(v.total_views, 0)::integer                AS view_count,
      CASE
        WHEN v.location IS NOT NULL THEN
          st_distancesphere(v.location::geometry, st_makepoint(p_lng, p_lat))
        WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
          st_distancesphere(st_makepoint(v.longitude, v.latitude), st_makepoint(p_lng, p_lat))
        ELSE 99999999.0
      END AS distance_meters
    FROM public.venues v
    WHERE v.status = 'active'
    ORDER BY distance_meters ASC
    LIMIT LEAST(p_limit, 100)
    OFFSET p_offset;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_feed_cards_v2(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER)
  TO anon, authenticated, service_role;


-- =========================================================================
-- RPC 4: search_venues_v2 — Full-text search with distance
-- =========================================================================
CREATE OR REPLACE FUNCTION public.search_venues_v2(
  p_query  TEXT,
  p_lat    DOUBLE PRECISION DEFAULT NULL,
  p_lng    DOUBLE PRECISION DEFAULT NULL,
  p_limit  INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                UUID,
  name              TEXT,
  slug              TEXT,
  category          TEXT,
  status            TEXT,
  image_url         TEXT,
  floor             TEXT,
  zone              TEXT,
  rating            NUMERIC,
  view_count        INTEGER,
  highlight_snippet TEXT,
  distance_meters   DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_query TEXT := TRIM(COALESCE(p_query, ''));
  v_tsquery tsquery;
BEGIN
  IF v_query = '' THEN
    RETURN;
  END IF;

  -- Build tsquery: try websearch first, fallback to plainto
  BEGIN
    v_tsquery := websearch_to_tsquery('simple', v_query);
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('simple', v_query);
  END;

  RETURN QUERY
    SELECT
      v.id,
      v.name,
      v.slug,
      v.category,
      v.status,
      v.image_urls[1]             AS image_url,
      v.floor,
      v.district                  AS zone,
      COALESCE(v.rating, 0)::numeric AS rating,
      COALESCE(v.total_views, 0)::integer AS view_count,
      ts_headline('simple', COALESCE(v.name, '') || ' ' || COALESCE(v.description, ''), v_tsquery,
        'MaxWords=15, MinWords=5, StartSel=<b>, StopSel=</b>'
      ) AS highlight_snippet,
      CASE
        WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND v.location IS NOT NULL THEN
          st_distancesphere(v.location::geometry, st_makepoint(p_lng, p_lat))
        WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND v.latitude IS NOT NULL THEN
          st_distancesphere(st_makepoint(v.longitude, v.latitude), st_makepoint(p_lng, p_lat))
        ELSE NULL
      END AS distance_meters
    FROM public.venues v
    WHERE v.status = 'active'
      AND (
        v.name ILIKE '%' || v_query || '%'
        OR v.description ILIKE '%' || v_query || '%'
        OR v.category ILIKE '%' || v_query || '%'
      )
    ORDER BY
      CASE WHEN v.name ILIKE v_query || '%' THEN 0 ELSE 1 END,
      distance_meters NULLS LAST,
      COALESCE(v.total_views, 0) DESC
    LIMIT LEAST(p_limit, 100)
    OFFSET p_offset;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.search_venues_v2(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER)
  TO anon, authenticated, service_role;


-- =========================================================================
-- RPC 5: get_venue_stats — Owner dashboard stats
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_venue_stats(p_shop_id UUID)
RETURNS TABLE (
  live_visitors INTEGER,
  total_views   INTEGER,
  rating        NUMERIC,
  review_count  INTEGER,
  is_promoted   BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $fn$
BEGIN
  RETURN QUERY
    SELECT
      0::integer AS live_visitors,  -- placeholder, real-time needs WebSocket
      COALESCE(v.total_views, 0)::integer,
      COALESCE(v.rating, 0)::numeric,
      COALESCE(v.review_count, 0)::integer,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS is_promoted
    FROM public.venues v
    WHERE v.id = p_shop_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_venue_stats(UUID) TO anon, authenticated, service_role;


-- =========================================================================
-- RPC 6: update_venue_anonymous — Anonymous venue edits (via visitor ID)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.update_venue_anonymous(
  p_shop_id   UUID,
  p_visitor_id TEXT,
  p_updates    JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Log the submission rather than direct update (for moderation)
  INSERT INTO public.user_submissions (
    visitor_id,
    venue_id,
    submission_type,
    payload,
    status
  ) VALUES (
    p_visitor_id,
    p_shop_id,
    'edit_venue',
    p_updates,
    'pending'
  );

  -- For now, also apply directly if owner matches
  UPDATE public.venues
  SET
    name        = COALESCE(p_updates->>'name',        name),
    category    = COALESCE(p_updates->>'category',    category),
    description = COALESCE(p_updates->>'description', description),
    updated_at  = now()
  WHERE id = p_shop_id
    AND owner_visitor_id = p_visitor_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.update_venue_anonymous(UUID, TEXT, JSONB) TO anon, authenticated, service_role;


-- =========================================================================
-- RPC 7: promote_to_giant — Admin: promote venue to Giant pin
-- =========================================================================
CREATE OR REPLACE FUNCTION public.promote_to_giant(
  p_shop_id       UUID,
  p_giant_category TEXT DEFAULT 'default',
  p_metadata       JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.venues
  SET
    pin_type     = 'giant',
    giant_until  = now() + interval '30 days',
    pin_metadata = jsonb_build_object(
      'giant_category', COALESCE(p_giant_category, 'default')
    ) || COALESCE(p_metadata, '{}'::jsonb),
    updated_at   = now()
  WHERE id = p_shop_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.promote_to_giant(UUID, TEXT, JSONB) TO authenticated, service_role;


-- =========================================================================
-- Add missing columns to venues (idempotent)
-- =========================================================================
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS owner_visitor_id TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS description      TEXT DEFAULT '';
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS district         TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS building         TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS floor            TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS phone            TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS video_url        TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS review_count     INTEGER DEFAULT 0;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS total_views      INTEGER DEFAULT 0;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS view_count       INTEGER DEFAULT 0;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS social_links     JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS images           JSONB;

-- Full-text search index on venues (for search_venues_v2)
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON public.venues USING gin (name gin_trgm_ops);
-- Require pg_trgm extension for above; skip if not available
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm extension not available, trigram index skipped';
END $$;

COMMIT;
