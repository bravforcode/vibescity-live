-- =============================================================================
-- Local Ads Production Hardening
-- Purpose:
--   - Keep canonical contract on local_ads (link_url, radius_km, created_by)
--   - Add impression/click tracking durability fields + dedupe key
--   - Tighten RLS (service-role write only)
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.local_ads') IS NULL THEN
    CREATE TABLE public.local_ads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      location GEOGRAPHY(POINT, 4326) NOT NULL,
      radius_km REAL NOT NULL DEFAULT 5.0,
      status TEXT NOT NULL DEFAULT 'active',
      created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      starts_at TIMESTAMPTZ DEFAULT now(),
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE public.local_ads ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE public.local_ads ADD COLUMN IF NOT EXISTS radius_km REAL;
ALTER TABLE public.local_ads ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'local_ads'
      AND column_name = 'target_url'
  ) THEN
    UPDATE public.local_ads
    SET link_url = COALESCE(NULLIF(link_url, ''), target_url, '')
    WHERE COALESCE(NULLIF(link_url, ''), '') = ''
      AND COALESCE(NULLIF(target_url, ''), '') <> '';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'local_ads'
      AND column_name = 'radius_m'
  ) THEN
    UPDATE public.local_ads
    SET radius_km = COALESCE(radius_km, GREATEST(radius_m::double precision / 1000.0, 0.1)::real)
    WHERE radius_km IS NULL
      AND radius_m IS NOT NULL;
  END IF;
END $$;

UPDATE public.local_ads
SET radius_km = 5.0
WHERE radius_km IS NULL OR radius_km <= 0;

ALTER TABLE public.local_ads
  ALTER COLUMN radius_km SET DEFAULT 5.0,
  ALTER COLUMN radius_km SET NOT NULL;

ALTER TABLE public.local_ads
  ALTER COLUMN link_url SET DEFAULT '';

DO $$
BEGIN
  IF to_regclass('public.ad_impressions') IS NULL THEN
    CREATE TABLE public.ad_impressions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ad_id UUID NOT NULL REFERENCES public.local_ads(id) ON DELETE CASCADE,
      venue_id UUID,
      user_id UUID,
      visitor_id TEXT,
      session_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;

  IF to_regclass('public.ad_clicks') IS NULL THEN
    CREATE TABLE public.ad_clicks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ad_id UUID NOT NULL REFERENCES public.local_ads(id) ON DELETE CASCADE,
      venue_id UUID,
      user_id UUID,
      visitor_id TEXT,
      session_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.ad_clicks ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.ad_clicks ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_id ON public.ad_impressions (ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad_id ON public.ad_clicks (ad_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_impressions_ad_session
  ON public.ad_impressions (ad_id, session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.local_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active ads" ON public.local_ads;
DROP POLICY IF EXISTS "Authenticated users can insert ads" ON public.local_ads;
DROP POLICY IF EXISTS "Authenticated users can update own ads" ON public.local_ads;
DROP POLICY IF EXISTS "Authenticated users can delete own ads" ON public.local_ads;
DROP POLICY IF EXISTS local_ads_select_active ON public.local_ads;
DROP POLICY IF EXISTS local_ads_service_write ON public.local_ads;

CREATE POLICY local_ads_select_active
ON public.local_ads
FOR SELECT
USING (
  status = 'active'
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at > now())
);

CREATE POLICY local_ads_service_write
ON public.local_ads
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS ad_impressions_service_write ON public.ad_impressions;
CREATE POLICY ad_impressions_service_write
ON public.ad_impressions
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS ad_clicks_service_write ON public.ad_clicks;
CREATE POLICY ad_clicks_service_write
ON public.ad_clicks
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMIT;
