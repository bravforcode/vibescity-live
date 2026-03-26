-- =============================================================================
-- Venue Official Sources Catalog
-- - Canonical store-level official source registry (website/social channels)
-- - Bulk upsert RPC for ingestion scripts
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.venue_official_sources (
  id BIGSERIAL PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'unknown',
  source_kind TEXT NOT NULL DEFAULT 'profile',
  source_url TEXT NOT NULL,
  normalized_source_url TEXT NOT NULL,
  source_domain TEXT,
  source_handle TEXT,
  verification_status TEXT NOT NULL DEFAULT 'verified',
  verification_method TEXT,
  confidence SMALLINT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority SMALLINT NOT NULL DEFAULT 50,
  discovered_from TEXT NOT NULL DEFAULT 'venue_profile',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_official_sources_unique_per_venue UNIQUE (venue_id, normalized_source_url),
  CONSTRAINT venue_official_sources_confidence_ck CHECK (confidence BETWEEN 0 AND 100),
  CONSTRAINT venue_official_sources_priority_ck CHECK (priority BETWEEN 0 AND 100),
  CONSTRAINT venue_official_sources_status_ck CHECK (
    verification_status IN ('unverified', 'verified', 'manual_verified', 'auto_verified', 'rejected')
  )
);

CREATE OR REPLACE FUNCTION public.trg_touch_venue_official_sources_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_venue_official_sources_updated_at ON public.venue_official_sources;
CREATE TRIGGER trg_touch_venue_official_sources_updated_at
BEFORE UPDATE
ON public.venue_official_sources
FOR EACH ROW
EXECUTE FUNCTION public.trg_touch_venue_official_sources_updated_at();

CREATE INDEX IF NOT EXISTS venue_official_sources_venue_idx
  ON public.venue_official_sources (venue_id, is_active, priority DESC);
CREATE INDEX IF NOT EXISTS venue_official_sources_status_idx
  ON public.venue_official_sources (verification_status, is_active, priority DESC);
CREATE INDEX IF NOT EXISTS venue_official_sources_url_idx
  ON public.venue_official_sources (normalized_source_url);
CREATE INDEX IF NOT EXISTS venue_official_sources_domain_idx
  ON public.venue_official_sources (source_domain);

REVOKE ALL ON TABLE public.venue_official_sources FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.venue_official_sources TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.venue_official_sources_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_video_source_url(p_url TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  u TEXT := LOWER(BTRIM(COALESCE(p_url, '')));
  v TEXT;
  id TEXT;
BEGIN
  IF u = '' THEN
    RETURN NULL;
  END IF;

  IF u !~ '^https?://' THEN
    u := 'https://' || u;
  END IF;

  u := REGEXP_REPLACE(u, '^http://', 'https://');
  u := REGEXP_REPLACE(u, '^https://(www\.|m\.)', 'https://');
  u := REGEXP_REPLACE(u, '^https://web\.facebook\.com', 'https://facebook.com');
  u := SPLIT_PART(u, '#', 1);

  IF u ~ '^https://youtu\.be/' THEN
    id := SPLIT_PART(SPLIT_PART(u, 'https://youtu.be/', 2), '?', 1);
    IF id <> '' THEN
      RETURN 'https://youtube.com/watch?v=' || id;
    END IF;
  END IF;

  IF u ~ '^https://youtube\.com/watch' THEN
    v := SUBSTRING(u FROM '[?&]v=([^&]+)');
    IF COALESCE(v, '') <> '' THEN
      RETURN 'https://youtube.com/watch?v=' || v;
    END IF;
  END IF;

  IF u ~ '^https://youtube\.com/shorts/' THEN
    id := SPLIT_PART(SPLIT_PART(u, 'https://youtube.com/shorts/', 2), '?', 1);
    id := REGEXP_REPLACE(id, '/+$', '');
    IF id <> '' THEN
      RETURN 'https://youtube.com/shorts/' || id;
    END IF;
  END IF;

  IF u ~ '^https://facebook\.com/watch' THEN
    v := SUBSTRING(u FROM '[?&]v=([^&]+)');
    IF COALESCE(v, '') <> '' THEN
      RETURN 'https://facebook.com/watch?v=' || v;
    END IF;
  END IF;

  IF u !~ '^https://youtube\.com/watch' AND u !~ '^https://facebook\.com/watch' THEN
    u := SPLIT_PART(u, '?', 1);
  END IF;

  u := REGEXP_REPLACE(u, '/+$', '');
  RETURN NULLIF(u, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_venue_official_sources(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  WITH incoming AS (
    SELECT
      (r->>'venue_id')::uuid AS venue_id,
      NULLIF(BTRIM(r->>'source_url'), '') AS source_url_raw,
      public.normalize_video_source_url(COALESCE(r->>'normalized_source_url', r->>'source_url')) AS normalized_source_url,
      NULLIF(LOWER(BTRIM(r->>'platform')), '') AS platform_raw,
      COALESCE(NULLIF(LOWER(BTRIM(r->>'source_kind')), ''), 'profile') AS source_kind,
      NULLIF(LOWER(BTRIM(r->>'source_handle')), '') AS source_handle,
      COALESCE(NULLIF(LOWER(BTRIM(r->>'verification_status')), ''), 'verified') AS verification_status,
      NULLIF(BTRIM(r->>'verification_method'), '') AS verification_method,
      GREATEST(0, LEAST(100, COALESCE((r->>'confidence')::int, 100)))::smallint AS confidence,
      COALESCE((r->>'is_active')::boolean, true) AS is_active,
      GREATEST(0, LEAST(100, COALESCE((r->>'priority')::int, 50)))::smallint AS priority,
      COALESCE(NULLIF(BTRIM(r->>'discovered_from'), ''), 'venue_profile') AS discovered_from,
      CASE
        WHEN jsonb_typeof(r->'metadata') = 'object' THEN r->'metadata'
        ELSE '{}'::jsonb
      END AS metadata
    FROM jsonb_array_elements(p_rows) AS r
  ),
  valid AS (
    SELECT
      i.venue_id,
      COALESCE(i.source_url_raw, i.normalized_source_url) AS source_url,
      i.normalized_source_url,
      COALESCE(
        i.platform_raw,
        CASE
          WHEN i.normalized_source_url LIKE '%youtube.com%' OR i.normalized_source_url LIKE '%youtu.be%' THEN 'youtube'
          WHEN i.normalized_source_url LIKE '%instagram.com%' THEN 'instagram'
          WHEN i.normalized_source_url LIKE '%tiktok.com%' THEN 'tiktok'
          WHEN i.normalized_source_url LIKE '%facebook.com%' OR i.normalized_source_url LIKE '%fb.watch%' THEN 'facebook'
          WHEN i.normalized_source_url LIKE '%vimeo.com%' THEN 'vimeo'
          ELSE 'website'
        END
      ) AS platform,
      i.source_kind,
      NULLIF(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(i.normalized_source_url, '://', 2), '/', 1), ':\d+$', ''), '') AS source_domain,
      i.source_handle,
      CASE
        WHEN i.verification_status IN ('unverified', 'verified', 'manual_verified', 'auto_verified', 'rejected')
          THEN i.verification_status
        ELSE 'verified'
      END AS verification_status,
      i.verification_method,
      i.confidence,
      i.is_active,
      i.priority,
      i.discovered_from,
      i.metadata
    FROM incoming i
    WHERE i.venue_id IS NOT NULL
      AND i.normalized_source_url IS NOT NULL
  )
  INSERT INTO public.venue_official_sources (
    venue_id,
    platform,
    source_kind,
    source_url,
    normalized_source_url,
    source_domain,
    source_handle,
    verification_status,
    verification_method,
    confidence,
    is_active,
    priority,
    discovered_from,
    metadata
  )
  SELECT
    v.venue_id,
    v.platform,
    v.source_kind,
    v.source_url,
    v.normalized_source_url,
    v.source_domain,
    v.source_handle,
    v.verification_status,
    v.verification_method,
    v.confidence,
    v.is_active,
    v.priority,
    v.discovered_from,
    v.metadata
  FROM valid v
  ON CONFLICT (venue_id, normalized_source_url)
  DO UPDATE SET
    source_url = EXCLUDED.source_url,
    platform = CASE
      WHEN public.venue_official_sources.platform IN ('unknown', 'website') THEN EXCLUDED.platform
      ELSE public.venue_official_sources.platform
    END,
    source_kind = EXCLUDED.source_kind,
    source_domain = COALESCE(EXCLUDED.source_domain, public.venue_official_sources.source_domain),
    source_handle = COALESCE(EXCLUDED.source_handle, public.venue_official_sources.source_handle),
    verification_status = CASE
      WHEN EXCLUDED.verification_status = 'rejected' THEN 'rejected'
      WHEN public.venue_official_sources.verification_status = 'manual_verified' THEN 'manual_verified'
      WHEN public.venue_official_sources.verification_status = 'verified'
        AND EXCLUDED.verification_status IN ('unverified', 'auto_verified') THEN 'verified'
      ELSE EXCLUDED.verification_status
    END,
    verification_method = COALESCE(EXCLUDED.verification_method, public.venue_official_sources.verification_method),
    confidence = GREATEST(public.venue_official_sources.confidence, EXCLUDED.confidence),
    is_active = EXCLUDED.is_active,
    priority = GREATEST(public.venue_official_sources.priority, EXCLUDED.priority),
    discovered_from = COALESCE(EXCLUDED.discovered_from, public.venue_official_sources.discovered_from),
    metadata = CASE
      WHEN public.venue_official_sources.metadata = '{}'::jsonb THEN EXCLUDED.metadata
      WHEN EXCLUDED.metadata = '{}'::jsonb THEN public.venue_official_sources.metadata
      ELSE public.venue_official_sources.metadata || EXCLUDED.metadata
    END,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_video_source_url(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_venue_official_sources(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_video_source_url(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_venue_official_sources(JSONB) TO service_role;

COMMIT;
