-- =============================================================================
-- Real Venue Video Ingestion Pipeline (verification + matching + confidence + review)
-- - Canonical video columns on venues (video_url + "Video_URL" sync)
-- - Candidate queue with review lifecycle
-- - Bulk RPCs: upsert candidates, review decisions, apply approved videos
-- - Feed contract: include video_url directly in get_feed_cards
-- =============================================================================

BEGIN;
SET LOCAL statement_timeout = 0; -- large UPDATE may take > default session limit

-- -----------------------------------------------------------------------------
-- 1) Canonical video columns on venues + sync trigger
-- -----------------------------------------------------------------------------
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS "Video_URL" TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_confidence SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_source_url TEXT,
  ADD COLUMN IF NOT EXISTS video_source_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS video_review_status TEXT NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS video_updated_by_pipeline_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venues_video_confidence_range_ck'
      AND conrelid = 'public.venues'::regclass
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_video_confidence_range_ck
      CHECK (video_confidence BETWEEN 0 AND 100) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venues_video_review_status_ck'
      AND conrelid = 'public.venues'::regclass
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_video_review_status_ck
      CHECK (video_review_status IN ('unreviewed', 'pending_review', 'approved', 'rejected', 'applied')) NOT VALID;
  END IF;
END $$;

UPDATE public.venues
SET
  video_url = COALESCE(NULLIF(BTRIM(video_url), ''), NULLIF(BTRIM("Video_URL"), '')),
  "Video_URL" = COALESCE(NULLIF(BTRIM("Video_URL"), ''), NULLIF(BTRIM(video_url), ''))
WHERE
  COALESCE(NULLIF(BTRIM(video_url), ''), '') <> COALESCE(NULLIF(BTRIM("Video_URL"), ''), '')
  OR (
    COALESCE(NULLIF(BTRIM(video_url), ''), '') = ''
    AND COALESCE(NULLIF(BTRIM("Video_URL"), ''), '') <> ''
  )
  OR (
    COALESCE(NULLIF(BTRIM("Video_URL"), ''), '') = ''
    AND COALESCE(NULLIF(BTRIM(video_url), ''), '') <> ''
  );

CREATE OR REPLACE FUNCTION public.trg_sync_venue_video_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_video_lower TEXT := NULLIF(BTRIM(NEW.video_url), '');
  new_video_upper TEXT := NULLIF(BTRIM(NEW."Video_URL"), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.video_url := COALESCE(new_video_lower, new_video_upper);
    NEW."Video_URL" := COALESCE(new_video_upper, new_video_lower);
    RETURN NEW;
  END IF;

  IF NEW.video_url IS DISTINCT FROM OLD.video_url THEN
    NEW.video_url := new_video_lower;
    NEW."Video_URL" := COALESCE(new_video_lower, new_video_upper);
    RETURN NEW;
  END IF;

  IF NEW."Video_URL" IS DISTINCT FROM OLD."Video_URL" THEN
    NEW."Video_URL" := new_video_upper;
    NEW.video_url := COALESCE(new_video_upper, new_video_lower);
    RETURN NEW;
  END IF;

  NEW.video_url := COALESCE(new_video_lower, new_video_upper);
  NEW."Video_URL" := COALESCE(new_video_upper, new_video_lower);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_venue_video_columns ON public.venues;
CREATE TRIGGER trg_sync_venue_video_columns
BEFORE INSERT OR UPDATE OF video_url, "Video_URL"
ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_venue_video_columns();

CREATE INDEX IF NOT EXISTS venues_video_review_status_idx
  ON public.venues (video_review_status);
CREATE INDEX IF NOT EXISTS venues_video_updated_pipeline_idx
  ON public.venues (video_updated_by_pipeline_at DESC);

-- -----------------------------------------------------------------------------
-- 2) Candidate queue table (source verification + matching + confidence + review)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_video_candidates (
  id BIGSERIAL PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  normalized_video_url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  source_type TEXT NOT NULL DEFAULT 'unknown',
  source_url TEXT,
  source_domain TEXT,
  source_handle TEXT,
  source_verified BOOLEAN NOT NULL DEFAULT false,
  source_verification_method TEXT,
  match_score SMALLINT NOT NULL DEFAULT 0,
  confidence_score SMALLINT NOT NULL DEFAULT 0,
  quality_score SMALLINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_review',
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  matching_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_video_candidates_unique_per_venue UNIQUE (venue_id, normalized_video_url),
  CONSTRAINT venue_video_candidates_match_score_ck CHECK (match_score BETWEEN 0 AND 100),
  CONSTRAINT venue_video_candidates_confidence_score_ck CHECK (confidence_score BETWEEN 0 AND 100),
  CONSTRAINT venue_video_candidates_quality_score_ck CHECK (quality_score BETWEEN 0 AND 100),
  CONSTRAINT venue_video_candidates_status_ck CHECK (
    status IN ('pending_review', 'approved', 'rejected', 'invalid', 'applied')
  )
);

CREATE OR REPLACE FUNCTION public.trg_touch_venue_video_candidates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_venue_video_candidates_updated_at ON public.venue_video_candidates;
CREATE TRIGGER trg_touch_venue_video_candidates_updated_at
BEFORE UPDATE
ON public.venue_video_candidates
FOR EACH ROW
EXECUTE FUNCTION public.trg_touch_venue_video_candidates_updated_at();

CREATE INDEX IF NOT EXISTS venue_video_candidates_review_idx
  ON public.venue_video_candidates (status, confidence_score DESC, discovered_at DESC);
CREATE INDEX IF NOT EXISTS venue_video_candidates_venue_idx
  ON public.venue_video_candidates (venue_id, status);
CREATE INDEX IF NOT EXISTS venue_video_candidates_source_verified_idx
  ON public.venue_video_candidates (source_verified, confidence_score DESC);
CREATE INDEX IF NOT EXISTS venue_video_candidates_url_idx
  ON public.venue_video_candidates (normalized_video_url);

REVOKE ALL ON TABLE public.venue_video_candidates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.venue_video_candidates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.venue_video_candidates_id_seq TO service_role;

-- -----------------------------------------------------------------------------
-- 3) Bulk upsert / review / apply RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_venue_video_candidates(p_rows JSONB)
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
      NULLIF(BTRIM(r->>'video_url'), '') AS video_url,
      NULLIF(BTRIM(COALESCE(r->>'normalized_video_url', r->>'video_url')), '') AS normalized_video_url,
      COALESCE(NULLIF(BTRIM(r->>'platform'), ''), 'unknown') AS platform,
      COALESCE(NULLIF(BTRIM(r->>'source_type'), ''), 'unknown') AS source_type,
      NULLIF(BTRIM(r->>'source_url'), '') AS source_url,
      NULLIF(BTRIM(r->>'source_domain'), '') AS source_domain,
      NULLIF(BTRIM(r->>'source_handle'), '') AS source_handle,
      COALESCE((r->>'source_verified')::boolean, false) AS source_verified,
      NULLIF(BTRIM(r->>'source_verification_method'), '') AS source_verification_method,
      GREATEST(0, LEAST(100, COALESCE((r->>'match_score')::int, 0)))::smallint AS match_score,
      GREATEST(0, LEAST(100, COALESCE((r->>'confidence_score')::int, 0)))::smallint AS confidence_score,
      GREATEST(0, LEAST(100, COALESCE((r->>'quality_score')::int, 0)))::smallint AS quality_score,
      COALESCE(NULLIF(BTRIM(LOWER(r->>'status')), ''), 'pending_review') AS status,
      NULLIF(BTRIM(r->>'review_note'), '') AS review_note,
      NULLIF(BTRIM(r->>'reviewed_by'), '') AS reviewed_by,
      COALESCE((r->>'reviewed_at')::timestamptz, NOW()) AS reviewed_at,
      COALESCE((r->>'discovered_at')::timestamptz, NOW()) AS discovered_at,
      CASE
        WHEN jsonb_typeof(r->'matching_signals') = 'object' THEN (r->'matching_signals')
        ELSE '{}'::jsonb
      END AS matching_signals,
      CASE
        WHEN jsonb_typeof(r->'metadata') = 'object' THEN (r->'metadata')
        ELSE '{}'::jsonb
      END AS metadata
    FROM jsonb_array_elements(p_rows) AS r
  ),
  valid AS (
    SELECT *
    FROM incoming
    WHERE venue_id IS NOT NULL
      AND video_url IS NOT NULL
      AND normalized_video_url IS NOT NULL
      AND status IN ('pending_review', 'approved', 'rejected', 'invalid', 'applied')
  )
  INSERT INTO public.venue_video_candidates (
    venue_id,
    video_url,
    normalized_video_url,
    platform,
    source_type,
    source_url,
    source_domain,
    source_handle,
    source_verified,
    source_verification_method,
    match_score,
    confidence_score,
    quality_score,
    status,
    review_note,
    reviewed_by,
    reviewed_at,
    discovered_at,
    matching_signals,
    metadata
  )
  SELECT
    v.venue_id,
    v.video_url,
    v.normalized_video_url,
    v.platform,
    v.source_type,
    v.source_url,
    v.source_domain,
    v.source_handle,
    v.source_verified,
    v.source_verification_method,
    v.match_score,
    v.confidence_score,
    v.quality_score,
    v.status,
    v.review_note,
    CASE WHEN v.status IN ('approved', 'rejected') THEN v.reviewed_by ELSE NULL END,
    CASE WHEN v.status IN ('approved', 'rejected') THEN v.reviewed_at ELSE NULL END,
    v.discovered_at,
    v.matching_signals,
    v.metadata
  FROM valid v
  ON CONFLICT (venue_id, normalized_video_url)
  DO UPDATE SET
    video_url = EXCLUDED.video_url,
    platform = EXCLUDED.platform,
    source_type = EXCLUDED.source_type,
    source_url = COALESCE(EXCLUDED.source_url, public.venue_video_candidates.source_url),
    source_domain = COALESCE(EXCLUDED.source_domain, public.venue_video_candidates.source_domain),
    source_handle = COALESCE(EXCLUDED.source_handle, public.venue_video_candidates.source_handle),
    source_verified = (public.venue_video_candidates.source_verified OR EXCLUDED.source_verified),
    source_verification_method = COALESCE(EXCLUDED.source_verification_method, public.venue_video_candidates.source_verification_method),
    match_score = GREATEST(public.venue_video_candidates.match_score, EXCLUDED.match_score),
    confidence_score = GREATEST(public.venue_video_candidates.confidence_score, EXCLUDED.confidence_score),
    quality_score = GREATEST(public.venue_video_candidates.quality_score, EXCLUDED.quality_score),
    status = CASE
      WHEN public.venue_video_candidates.status IN ('applied', 'rejected') AND EXCLUDED.status = 'pending_review'
        THEN public.venue_video_candidates.status
      WHEN public.venue_video_candidates.status = 'approved' AND EXCLUDED.status = 'pending_review'
        THEN public.venue_video_candidates.status
      ELSE EXCLUDED.status
    END,
    review_note = COALESCE(EXCLUDED.review_note, public.venue_video_candidates.review_note),
    reviewed_by = CASE
      WHEN EXCLUDED.status IN ('approved', 'rejected') THEN COALESCE(EXCLUDED.reviewed_by, public.venue_video_candidates.reviewed_by)
      ELSE public.venue_video_candidates.reviewed_by
    END,
    reviewed_at = CASE
      WHEN EXCLUDED.status IN ('approved', 'rejected') THEN COALESCE(EXCLUDED.reviewed_at, public.venue_video_candidates.reviewed_at, NOW())
      ELSE public.venue_video_candidates.reviewed_at
    END,
    discovered_at = LEAST(public.venue_video_candidates.discovered_at, EXCLUDED.discovered_at),
    matching_signals = CASE
      WHEN public.venue_video_candidates.matching_signals = '{}'::jsonb THEN EXCLUDED.matching_signals
      WHEN EXCLUDED.matching_signals = '{}'::jsonb THEN public.venue_video_candidates.matching_signals
      ELSE public.venue_video_candidates.matching_signals || EXCLUDED.matching_signals
    END,
    metadata = CASE
      WHEN public.venue_video_candidates.metadata = '{}'::jsonb THEN EXCLUDED.metadata
      WHEN EXCLUDED.metadata = '{}'::jsonb THEN public.venue_video_candidates.metadata
      ELSE public.venue_video_candidates.metadata || EXCLUDED.metadata
    END,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_venue_video_candidates(
  p_rows JSONB,
  p_actor TEXT DEFAULT NULL
)
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

  WITH decisions AS (
    SELECT
      (r->>'id')::bigint AS id,
      COALESCE(NULLIF(BTRIM(LOWER(r->>'status')), ''), 'pending_review') AS status,
      NULLIF(BTRIM(r->>'review_note'), '') AS review_note,
      NULLIF(BTRIM(r->>'reviewed_by'), '') AS reviewed_by
    FROM jsonb_array_elements(p_rows) AS r
  )
  UPDATE public.venue_video_candidates c
  SET
    status = d.status,
    review_note = COALESCE(d.review_note, c.review_note),
    reviewed_by = COALESCE(d.reviewed_by, NULLIF(BTRIM(p_actor), ''), c.reviewed_by),
    reviewed_at = NOW(),
    updated_at = NOW()
  FROM decisions d
  WHERE c.id = d.id
    AND d.status IN ('approved', 'rejected', 'pending_review', 'invalid');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_approved_venue_videos(
  p_limit INTEGER DEFAULT 1000,
  p_min_confidence INTEGER DEFAULT 85,
  p_actor TEXT DEFAULT 'video-pipeline:auto'
)
RETURNS TABLE (
  applied_count INTEGER,
  candidate_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied INTEGER := 0;
  v_candidates INTEGER := 0;
BEGIN
  WITH ranked AS (
    SELECT DISTINCT ON (c.venue_id)
      c.id,
      c.venue_id,
      c.video_url,
      c.source_url,
      c.confidence_score,
      c.match_score,
      c.discovered_at
    FROM public.venue_video_candidates c
    WHERE c.status = 'approved'
      AND c.source_verified = true
      AND c.confidence_score >= GREATEST(0, LEAST(100, COALESCE(p_min_confidence, 85)))
    ORDER BY c.venue_id, c.confidence_score DESC, c.match_score DESC, c.discovered_at DESC, c.id DESC
  ),
  target AS (
    SELECT *
    FROM ranked
    ORDER BY confidence_score DESC, discovered_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 1000), 0)
  ),
  updated AS (
    UPDATE public.venues v
    SET
      video_url = t.video_url,
      "Video_URL" = t.video_url,
      video_confidence = t.confidence_score,
      video_source_url = COALESCE(t.source_url, v.video_source_url),
      video_source_verified = true,
      video_review_status = 'applied',
      video_last_verified_at = NOW(),
      video_updated_by_pipeline_at = NOW()
    FROM target t
    WHERE v.id = t.venue_id
      AND COALESCE(NULLIF(BTRIM(v.video_url), ''), NULLIF(BTRIM(v."Video_URL"), ''), '') IS DISTINCT FROM t.video_url
    RETURNING t.id AS candidate_id
  ),
  marked AS (
    UPDATE public.venue_video_candidates c
    SET
      status = 'applied',
      applied_at = NOW(),
      reviewed_by = COALESCE(c.reviewed_by, NULLIF(BTRIM(p_actor), ''), 'video-pipeline:auto'),
      reviewed_at = COALESCE(c.reviewed_at, NOW()),
      review_note = COALESCE(NULLIF(c.review_note, ''), 'auto-applied by pipeline'),
      updated_at = NOW()
    WHERE c.id IN (SELECT candidate_id FROM updated)
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM marked),
    (SELECT COUNT(*) FROM target)
  INTO v_applied, v_candidates;

  RETURN QUERY
  SELECT COALESCE(v_applied, 0), COALESCE(v_candidates, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_venue_video_candidates(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_venue_video_candidates(JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_approved_venue_videos(INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_venue_video_candidates(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_venue_video_candidates(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_approved_venue_videos(INTEGER, INTEGER, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 4) Feed contract: include video_url directly for card/modal hydration
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_feed_cards(double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_feed_cards(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  category text,
  status text,
  image_urls text[],
  image_url1 text,
  video_url text,
  rating numeric,
  total_views bigint,
  distance_km double precision,
  latitude double precision,
  longitude double precision,
  pin_type text,
  pin_metadata jsonb,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  visibility_score integer
)
LANGUAGE plpgsql
STABLE
SET statement_timeout = '4s'
AS $$
DECLARE
  v_lat_window double precision := 0.55;
  v_lng_window double precision := 0.55;
  v_min_lat double precision;
  v_max_lat double precision;
  v_min_lng double precision;
  v_max_lng double precision;
BEGIN
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_min_lat := p_lat - v_lat_window;
    v_max_lat := p_lat + v_lat_window;
    v_min_lng := p_lng - v_lng_window;
    v_max_lng := p_lng + v_lng_window;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      v.id,
      v.name,
      v.slug,
      v.category,
      v.status::text AS status,
      COALESCE(v.image_urls, ARRAY[]::text[]) AS image_urls,
      COALESCE(v.image_urls[1], v."Image_URL1") AS image_url1,
      COALESCE(NULLIF(BTRIM(v.video_url), ''), NULLIF(BTRIM(v."Video_URL"), '')) AS video_url,
      COALESCE(v.rating, 0)::numeric AS rating,
      COALESCE(v.total_views, v.view_count, 0)::bigint AS total_views,
      COALESCE(st_y(v.location::geometry), v.latitude) AS latitude,
      COALESCE(st_x(v.location::geometry), v.longitude) AS longitude,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type, '')) = 'giant') AS giant_active,
      COALESCE(v.visibility_score, 0) AS visibility_score
    FROM public.venues v
    WHERE COALESCE(v.status, 'active'::venue_status) NOT IN ('off'::venue_status, 'inactive'::venue_status, 'disabled'::venue_status, 'deleted'::venue_status)
      AND v.deleted_at IS NULL
      AND (
        p_lat IS NULL OR p_lng IS NULL
        OR (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, st_makeenvelope(v_min_lng, v_min_lat, v_max_lng, v_max_lat, 4326)))
          OR (v.location IS NULL AND v.latitude BETWEEN v_min_lat AND v_max_lat AND v.longitude BETWEEN v_min_lng AND v_max_lng)
        )
      )
    LIMIT 2500
  )
  SELECT
    c.id,
    c.name,
    c.slug,
    c.category,
    c.status,
    c.image_urls,
    c.image_url1,
    c.video_url,
    c.rating,
    c.total_views,
    CASE
      WHEN p_lat IS NULL OR p_lng IS NULL OR c.latitude IS NULL OR c.longitude IS NULL THEN NULL
      ELSE round((ST_DistanceSphere(ST_MakePoint(p_lng, p_lat), ST_MakePoint(c.longitude, c.latitude)) / 1000)::numeric, 3)::double precision
    END AS distance_km,
    c.latitude,
    c.longitude,
    c.pin_type,
    c.pin_metadata,
    c.verified_active,
    c.glow_active,
    c.boost_active,
    c.giant_active,
    c.visibility_score
  FROM candidates c
  ORDER BY
    CASE WHEN p_lat IS NULL OR p_lng IS NULL OR c.latitude IS NULL OR c.longitude IS NULL THEN 1 ELSE 0 END ASC,
    distance_km ASC NULLS LAST,
    c.total_views DESC,
    c.name ASC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_cards(double precision, double precision)
  TO anon, authenticated, service_role;

COMMIT;
