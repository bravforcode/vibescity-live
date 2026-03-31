-- =============================================================================
-- TRIAD Core Contract
-- Purpose:
--   - Ensure canonical core objects exist for venues + user-generated data
--   - Keep migration idempotent and forward-only
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  category_id UUID,
  location geography(Point, 4326),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  province TEXT,
  status TEXT DEFAULT 'active',
  source TEXT DEFAULT 'manual',
  slug TEXT,
  short_code TEXT,
  owner_id UUID,
  pin_type TEXT,
  rating NUMERIC(3,2) DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  view_count BIGINT DEFAULT 0,
  image_urls TEXT[] DEFAULT '{}',
  "Image_URL1" TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_verified BOOLEAN DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  last_osm_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS short_code TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS pin_type TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS total_views BIGINT DEFAULT 0;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS view_count BIGINT DEFAULT 0;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS last_osm_sync TIMESTAMPTZ;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.venue_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_tag_map (
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.venue_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.venue_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID,
  rating NUMERIC(2,1),
  content TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id UUID PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, venue_id)
);

CREATE TABLE IF NOT EXISTS public.venue_live_counts (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  live_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  province TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_submissions ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.venue_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id UUID PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  submissions_count INTEGER NOT NULL DEFAULT 0,
  check_ins_count INTEGER NOT NULL DEFAULT 0,
  photos_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  achievement_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);

CREATE OR REPLACE FUNCTION public.set_updated_at_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_venues_updated_at'
      AND tgrelid = 'public.venues'::regclass
  ) THEN
    CREATE TRIGGER trg_venues_updated_at
    BEFORE UPDATE ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
  END IF;

  IF to_regclass('public.reviews') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_reviews_updated_at'
      AND tgrelid = 'public.reviews'::regclass
  ) THEN
    CREATE TRIGGER trg_reviews_updated_at
    BEFORE UPDATE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
  END IF;

  IF to_regclass('public.user_profiles') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_user_profiles_updated_at'
      AND tgrelid = 'public.user_profiles'::regclass
  ) THEN
    CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
  END IF;

  IF to_regclass('public.user_stats') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_user_stats_updated_at'
      AND tgrelid = 'public.user_stats'::regclass
  ) THEN
    CREATE TRIGGER trg_user_stats_updated_at
    BEFORE UPDATE ON public.user_stats
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.venues_public') IS NULL AND to_regclass('public.venues') IS NOT NULL THEN
    EXECUTE '
      CREATE VIEW public.venues_public AS
      SELECT
        id,
        name,
        category,
        province,
        status,
        slug,
        short_code,
        image_urls,
        "Image_URL1",
        is_verified,
        pin_type,
        rating,
        total_views,
        created_at,
        updated_at
      FROM public.venues
      WHERE status = ''active''
    ';
    EXECUTE 'ALTER VIEW public.venues_public SET (security_invoker = true, security_barrier = true)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_touch_venues(venue_ids UUID[])
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  UPDATE public.venues
  SET
    last_seen_at = now(),
    last_osm_sync = now()
  WHERE id = ANY(COALESCE(venue_ids, ARRAY[]::uuid[]));
$$;

GRANT EXECUTE ON FUNCTION public.bulk_touch_venues(UUID[]) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_venues_created_at ON public.venues (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_venue_id ON public.reviews (venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_submissions_user_id ON public.user_submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_images_venue_id ON public.venue_images (venue_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_user_favorites_venue_id ON public.user_favorites (venue_id);

COMMIT;
