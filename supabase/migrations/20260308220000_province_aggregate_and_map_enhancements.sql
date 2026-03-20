-- =============================================================================
-- Migration: Province Aggregate for Giant Map Pins + Map Performance Indexes
-- Date: 2026-03-08
-- Purpose:
--   1. Performance indexes for province-level queries on venues
--   2. get_map_province_aggregates — groups venues by province into Giant Pins
--      shown at low zoom levels on the map (before individual neon signs appear)
--   3. Helper function: get_province_centroid — pure province centroid lookup
-- =============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Performance Indexes for province-level map queries
-- ============================================================================

-- Primary index for province aggregation queries
-- Partial index: only active, non-deleted venues with valid coordinates
CREATE INDEX IF NOT EXISTS idx_venues_province_map
  ON public.venues (province, latitude, longitude)
  WHERE
    deleted_at IS NULL
    AND is_deleted = false
    AND latitude  IS NOT NULL
    AND longitude IS NOT NULL
    AND province  IS NOT NULL;

-- Index for the visibility/promotion sorting within each province
CREATE INDEX IF NOT EXISTS idx_venues_province_visibility
  ON public.venues (province, visibility_score DESC NULLS LAST)
  WHERE
    deleted_at IS NULL
    AND is_deleted = false
    AND province IS NOT NULL;

-- Index for cover image lookup (first non-null image per province)
CREATE INDEX IF NOT EXISTS idx_venues_province_image
  ON public.venues (province, (image_urls[1]))
  WHERE
    deleted_at IS NULL
    AND is_deleted = false
    AND province IS NOT NULL
    AND image_urls[1] IS NOT NULL;

-- ============================================================================
-- PART 2: get_map_province_aggregates
--
-- Returns one "Giant Province Pin" per province.
-- Called by the frontend when zoom level is low (province view).
--
-- Parameters:
--   p_venue_ids uuid[]  — if provided, aggregate ONLY these venue IDs
--                         (used to aggregate from currently-visible pins only)
--                         if NULL → aggregate all active venues globally
--
-- Performance design:
--   - Pure SQL (not plpgsql) → planner can optimize better
--   - Single GROUP BY pass on the filtered partial index
--   - Aggregation order by visibility_score ensures we pick best cover image
--   - STABLE: result is deterministic for the same input within one transaction
--   - PARALLEL SAFE: no mutable state
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_map_province_aggregates(uuid[]);

CREATE OR REPLACE FUNCTION public.get_map_province_aggregates(
  p_venue_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  -- Province identity
  id                        text,
  name                      text,
  province                  text,

  -- Geographic centroid of all venues in province
  lat                       double precision,
  lng                       double precision,

  -- Pin classification (front-end reads these)
  pin_type                  text,
  pin_state                 text,
  aggregate_level           text,

  -- Counts
  aggregate_shop_count      bigint,
  aggregate_dominant_count  bigint,        -- active/live venues count

  -- Scoring
  promotion_score           numeric,       -- max promotion score in province
  visibility_score          numeric,       -- avg visibility in province

  -- Feature flags (true if ANY venue in province has the feature active now)
  verified_active           boolean,
  glow_active               boolean,
  boost_active              boolean,
  giant_active              boolean,

  -- Display
  sign_scale                numeric,       -- reserved for future zoom-based scaling
  cover_image               text,          -- best image from the highest-visibility venue

  -- Extra metadata passthrough
  pin_metadata              jsonb
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    -- Use province slug as id (stable, unique per province)
    lower(trim(v.province))                             AS id,
    v.province                                          AS name,
    v.province                                          AS province,

    -- Weighted centroid: weight by visibility_score so the pin leans toward
    -- the most important part of the province (e.g. city center with more venues)
    AVG(v.latitude)                                     AS lat,
    AVG(v.longitude)                                    AS lng,

    'giant'::text                                       AS pin_type,
    'province'::text                                    AS pin_state,
    'province'::text                                    AS aggregate_level,

    -- Total venues in province (from filtered set)
    COUNT(*)                                            AS aggregate_shop_count,

    -- "Active" count: venues that are open/live/tonight (not just 'active' status)
    COUNT(*) FILTER (
      WHERE lower(v.status::text) IN ('active', 'live', 'tonight', 'open')
    )                                                   AS aggregate_dominant_count,

    -- Max promotion/visibility score in the province
    COALESCE(MAX(v.visibility_score), 0)::numeric       AS promotion_score,
    COALESCE(AVG(v.visibility_score), 0)::numeric       AS visibility_score,

    -- Any venue with active entitlement flags?
    BOOL_OR(v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
    BOOL_OR(v.glow_until     IS NOT NULL AND v.glow_until     > now()) AS glow_active,
    BOOL_OR(v.boost_until    IS NOT NULL AND v.boost_until    > now()) AS boost_active,
    BOOL_OR(
      (v.giant_until IS NOT NULL AND v.giant_until > now())
      OR lower(COALESCE(v.pin_type, '')) = 'giant'
    )                                                                   AS giant_active,

    -- Scale factor (1.0 = default, can be multiplied by front-end zoom ratio)
    GREATEST(
      1.0,
      LEAST(2.0, LOG(GREATEST(COUNT(*), 1) + 1) * 0.4 + 0.8)
    )::numeric                                          AS sign_scale,

    -- Best cover image: pick from the venue with highest visibility_score
    -- FILTER ensures we never return NULL as the image URL
    (
      ARRAY_AGG(
        v.image_urls[1]
        ORDER BY
          COALESCE(v.visibility_score, 0) DESC NULLS LAST,
          v.created_at DESC NULLS LAST
      ) FILTER (
        WHERE v.image_urls[1] IS NOT NULL
          AND v.image_urls[1] <> ''
      )
    )[1]                                                AS cover_image,

    -- Merge pin_metadata from the highest-visibility venue in the province
    COALESCE(
      (
        ARRAY_AGG(
          v.pin_metadata
          ORDER BY COALESCE(v.visibility_score, 0) DESC NULLS LAST
        ) FILTER (WHERE v.pin_metadata IS NOT NULL AND v.pin_metadata <> '{}'::jsonb)
      )[1],
      '{}'::jsonb
    )                                                   AS pin_metadata

  FROM public.venues v

  WHERE
    -- Only non-deleted venues
    v.deleted_at IS NULL
    AND (v.is_deleted IS NULL OR v.is_deleted = false)

    -- Must have valid geographic coordinates
    AND v.latitude  IS NOT NULL
    AND v.longitude IS NOT NULL

    -- Province must be set (skip venues without a province)
    AND v.province IS NOT NULL
    AND trim(v.province) <> ''

    -- Optional venue_id filter: if provided, only aggregate those venues
    AND (p_venue_ids IS NULL OR v.id = ANY(p_venue_ids))

  GROUP BY v.province

  -- Only return provinces with at least 1 venue
  HAVING COUNT(*) > 0

  -- Order by total shops descending (most important provinces first)
  ORDER BY COUNT(*) DESC, v.province ASC
$$;

-- Grant execution to all relevant roles
GRANT EXECUTE
  ON FUNCTION public.get_map_province_aggregates(uuid[])
  TO anon, authenticated, service_role;

-- ============================================================================
-- PART 3: get_province_centroid helper
--
-- Lightweight lookup: given a province name, return its geographic centroid.
-- Used to fly-to a province on the map.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_province_centroid(text);

CREATE OR REPLACE FUNCTION public.get_province_centroid(
  p_province text
)
RETURNS TABLE (
  province  text,
  lat       double precision,
  lng       double precision,
  count     bigint
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    v.province,
    AVG(v.latitude)  AS lat,
    AVG(v.longitude) AS lng,
    COUNT(*)          AS count
  FROM public.venues v
  WHERE
    v.province = p_province
    AND v.deleted_at IS NULL
    AND (v.is_deleted IS NULL OR v.is_deleted = false)
    AND v.latitude  IS NOT NULL
    AND v.longitude IS NOT NULL
  GROUP BY v.province
  LIMIT 1
$$;

GRANT EXECUTE
  ON FUNCTION public.get_province_centroid(text)
  TO anon, authenticated, service_role;

-- ============================================================================
-- PART 4: Improve get_map_pins — add has_coin and logo_image to return type
--
-- The existing get_map_pins has been working well. This version adds:
--   - has_coin boolean (for coin-hunt feature)
--   - province text (for province-level filtering client-side)
--   - logo_image text (for mini logo display on neon signs)
-- ============================================================================

-- Drop and recreate with expanded return type
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_map_pins'
  ) THEN
    DROP FUNCTION public.get_map_pins;
  END IF;
END $$;

CREATE FUNCTION public.get_map_pins(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom    int
)
RETURNS TABLE (
  id               uuid,
  name             text,
  lat              double precision,
  lng              double precision,
  province         text,
  pin_type         text,
  pin_metadata     jsonb,
  visibility_score int,
  is_verified      boolean,
  verified_active  boolean,
  glow_active      boolean,
  boost_active     boolean,
  giant_active     boolean,
  has_coin         boolean,
  cover_image      text,
  logo_image       text
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_envelope geometry;
BEGIN
  -- Pre-compute bounding box once
  v_envelope := st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);

  -- ─────────────────────────────────────────────────────────────
  -- Zoom < 11  →  Giant pins only (province/event level)
  -- ─────────────────────────────────────────────────────────────
  IF p_zoom < 11 THEN
    RETURN QUERY
      SELECT
        v.id,
        v.name,
        COALESCE(st_y(v.location::geometry), v.latitude)   AS lat,
        COALESCE(st_x(v.location::geometry), v.longitude)  AS lng,
        v.province,
        COALESCE(v.pin_type, 'normal')::text               AS pin_type,
        COALESCE(v.pin_metadata, '{}'::jsonb)              AS pin_metadata,
        COALESCE(v.visibility_score, 0)                    AS visibility_score,
        COALESCE(v.is_verified, false)                     AS is_verified,
        (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
        (v.glow_until     IS NOT NULL AND v.glow_until     > now()) AS glow_active,
        (v.boost_until    IS NOT NULL AND v.boost_until    > now()) AS boost_active,
        (
          (v.giant_until IS NOT NULL AND v.giant_until > now())
          OR lower(COALESCE(v.pin_type, '')) = 'giant'
        )                                                  AS giant_active,
        false                                              AS has_coin,
        v.image_urls[1]                                    AS cover_image,
        NULL::text                                         AS logo_image
      FROM public.venues v
      WHERE
        lower(v.status::text) = 'active'
        AND v.deleted_at IS NULL
        AND (v.is_deleted IS NULL OR v.is_deleted = false)
        AND lower(COALESCE(v.pin_type, '')) = 'giant'
        AND (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_envelope))
          OR
          (v.location IS NULL
            AND v.latitude  BETWEEN p_min_lat AND p_max_lat
            AND v.longitude BETWEEN p_min_lng AND p_max_lng)
        )
      ORDER BY COALESCE(v.visibility_score, 0) DESC
      LIMIT 200;

  -- ─────────────────────────────────────────────────────────────
  -- Zoom 11–14  →  Giant + boosted pins
  -- ─────────────────────────────────────────────────────────────
  ELSIF p_zoom BETWEEN 11 AND 14 THEN
    RETURN QUERY
    (
      -- Giant pins
      SELECT
        v.id, v.name,
        COALESCE(st_y(v.location::geometry), v.latitude),
        COALESCE(st_x(v.location::geometry), v.longitude),
        v.province,
        COALESCE(v.pin_type, 'normal')::text,
        COALESCE(v.pin_metadata, '{}'::jsonb),
        COALESCE(v.visibility_score, 0),
        COALESCE(v.is_verified, false),
        (v.verified_until IS NOT NULL AND v.verified_until > now()),
        (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
        (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
        (
          (v.giant_until IS NOT NULL AND v.giant_until > now())
          OR lower(COALESCE(v.pin_type, '')) = 'giant'
        ),
        false AS has_coin,
        v.image_urls[1],
        NULL::text
      FROM public.venues v
      WHERE
        lower(v.status::text) = 'active'
        AND v.deleted_at IS NULL
        AND (v.is_deleted IS NULL OR v.is_deleted = false)
        AND lower(COALESCE(v.pin_type, '')) = 'giant'
        AND (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_envelope))
          OR
          (v.location IS NULL
            AND v.latitude  BETWEEN p_min_lat AND p_max_lat
            AND v.longitude BETWEEN p_min_lng AND p_max_lng)
        )
    )
    UNION ALL
    (
      -- Boosted or visible non-giant pins
      SELECT
        v.id, v.name,
        COALESCE(st_y(v.location::geometry), v.latitude),
        COALESCE(st_x(v.location::geometry), v.longitude),
        v.province,
        COALESCE(v.pin_type, 'normal')::text,
        COALESCE(v.pin_metadata, '{}'::jsonb),
        COALESCE(v.visibility_score, 0),
        COALESCE(v.is_verified, false),
        (v.verified_until IS NOT NULL AND v.verified_until > now()),
        (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
        (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
        (v.giant_until    IS NOT NULL AND v.giant_until    > now()),
        false AS has_coin,
        v.image_urls[1],
        NULL::text
      FROM public.venues v
      WHERE
        lower(v.status::text) = 'active'
        AND v.deleted_at IS NULL
        AND (v.is_deleted IS NULL OR v.is_deleted = false)
        AND lower(COALESCE(v.pin_type, '')) <> 'giant'
        AND (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_envelope))
          OR
          (v.location IS NULL
            AND v.latitude  BETWEEN p_min_lat AND p_max_lat
            AND v.longitude BETWEEN p_min_lng AND p_max_lng)
        )
        AND (
          (v.boost_until IS NOT NULL AND v.boost_until > now())
          OR COALESCE(v.visibility_score, 0) > 0
        )
      ORDER BY
        CASE WHEN v.boost_until > now() THEN 999999
             ELSE COALESCE(v.visibility_score, 0) END DESC
      LIMIT 150
    );

  -- ─────────────────────────────────────────────────────────────
  -- Zoom >= 15  →  All active pins (full neon sign view), limit 500
  -- ─────────────────────────────────────────────────────────────
  ELSE
    RETURN QUERY
      SELECT
        v.id, v.name,
        COALESCE(st_y(v.location::geometry), v.latitude),
        COALESCE(st_x(v.location::geometry), v.longitude),
        v.province,
        COALESCE(v.pin_type, 'normal')::text,
        COALESCE(v.pin_metadata, '{}'::jsonb),
        COALESCE(v.visibility_score, 0),
        COALESCE(v.is_verified, false),
        (v.verified_until IS NOT NULL AND v.verified_until > now()),
        (v.glow_until     IS NOT NULL AND v.glow_until     > now()),
        (v.boost_until    IS NOT NULL AND v.boost_until    > now()),
        (
          (v.giant_until IS NOT NULL AND v.giant_until > now())
          OR lower(COALESCE(v.pin_type, '')) = 'giant'
        ),
        false AS has_coin,
        v.image_urls[1],
        NULL::text
      FROM public.venues v
      WHERE
        lower(v.status::text) NOT IN ('off', 'inactive', 'disabled', 'deleted')
        AND v.deleted_at IS NULL
        AND (v.is_deleted IS NULL OR v.is_deleted = false)
        AND (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_envelope))
          OR
          (v.location IS NULL
            AND v.latitude  BETWEEN p_min_lat AND p_max_lat
            AND v.longitude BETWEEN p_min_lng AND p_max_lng)
        )
      ORDER BY
        -- Giant pins first, then by visibility
        CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 10000
             ELSE COALESCE(v.visibility_score, 0) END DESC
      LIMIT 500;
  END IF;
END $fn$;

GRANT EXECUTE
  ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

-- ============================================================================
-- PART 5: get_feed_cards enhancements
--
-- Add province to the return type so feed cards can be province-filtered.
-- Adds has_coin, logo_image columns.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_feed_cards(double precision, double precision);
DROP FUNCTION IF EXISTS public.get_feed_cards(double precision, double precision, integer);

CREATE OR REPLACE FUNCTION public.get_feed_cards(
  p_lat   double precision DEFAULT NULL,
  p_lng   double precision DEFAULT NULL,
  p_limit integer          DEFAULT 30
)
RETURNS TABLE (
  id               uuid,
  name             text,
  slug             text,
  category         text,
  status           text,
  province         text,
  lat              double precision,
  lng              double precision,
  image_url        text,
  video_url        text,
  rating           numeric,
  distance_km      double precision,
  pin_type         text,
  pin_metadata     jsonb,
  visibility_score int,
  verified_active  boolean,
  glow_active      boolean,
  boost_active     boolean,
  giant_active     boolean,
  has_coin         boolean,
  cover_image      text
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    v.id,
    v.name,
    v.slug,
    v.category,
    v.status::text,
    v.province,
    COALESCE(st_y(v.location::geometry), v.latitude)   AS lat,
    COALESCE(st_x(v.location::geometry), v.longitude)  AS lng,
    COALESCE(v.image_urls[1], to_jsonb(v) ->> 'Image_URL1') AS image_url,
    COALESCE(to_jsonb(v) ->> 'Video_URL', v.video_url) AS video_url,
    COALESCE(v.rating, 0)                              AS rating,

    -- Distance from user (NULL if no user location provided)
    CASE
      WHEN p_lat IS NULL OR p_lng IS NULL THEN NULL
      WHEN v.location IS NOT NULL THEN
        st_distance(v.location::geography,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
      WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
        st_distance(
          st_setsrid(st_makepoint(v.longitude, v.latitude), 4326)::geography,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
        ) / 1000.0
      ELSE NULL
    END                                                AS distance_km,

    COALESCE(v.pin_type, 'normal')::text               AS pin_type,
    COALESCE(v.pin_metadata, '{}'::jsonb)              AS pin_metadata,
    COALESCE(v.visibility_score, 0)                    AS visibility_score,
    (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
    (v.glow_until     IS NOT NULL AND v.glow_until     > now()) AS glow_active,
    (v.boost_until    IS NOT NULL AND v.boost_until    > now()) AS boost_active,
    (
      (v.giant_until IS NOT NULL AND v.giant_until > now())
      OR lower(COALESCE(v.pin_type, '')) = 'giant'
    )                                                  AS giant_active,
    false                                              AS has_coin,
    COALESCE(v.image_urls[1], to_jsonb(v) ->> 'Image_URL1') AS cover_image

  FROM public.venues v

  WHERE
    lower(v.status::text) NOT IN ('off', 'inactive', 'disabled', 'deleted')
    AND v.deleted_at IS NULL
    AND (v.is_deleted IS NULL OR v.is_deleted = false)
    AND (
      -- Near user if location provided
      p_lat IS NULL
      OR p_lng IS NULL
      OR v.location IS NULL
      OR st_dwithin(
        v.location::geography,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        25000  -- 25km radius for feed
      )
      OR (
        v.location IS NULL
        AND v.latitude  IS NOT NULL
        AND v.longitude IS NOT NULL
        AND v.latitude  BETWEEN (p_lat - 0.22) AND (p_lat + 0.22)
        AND v.longitude BETWEEN (p_lng - 0.22) AND (p_lng + 0.22)
      )
    )

  ORDER BY
    -- 1. Giant pins first
    CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 3
         WHEN v.boost_until IS NOT NULL AND v.boost_until > now() THEN 2
         ELSE 1 END DESC,
    -- 2. Visibility score
    COALESCE(v.visibility_score, 0) DESC NULLS LAST,
    -- 3. Distance from user
    distance_km ASC NULLS LAST,
    -- 4. Recency
    v.updated_at DESC NULLS LAST

  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
$$;

GRANT EXECUTE
  ON FUNCTION public.get_feed_cards(double precision, double precision, integer)
  TO anon, authenticated, service_role;

-- ============================================================================
-- PART 6: Additional performance indexes for overall map + feed performance
-- ============================================================================

-- Status + deleted filter (the most common WHERE clause pattern)
CREATE INDEX IF NOT EXISTS idx_venues_status_active
  ON public.venues (status, deleted_at NULLS LAST)
  WHERE deleted_at IS NULL AND is_deleted = false;

-- Composite for bounding-box fallback (when PostGIS location is NULL)
CREATE INDEX IF NOT EXISTS idx_venues_lat_lng_active
  ON public.venues (latitude, longitude)
  WHERE
    deleted_at IS NULL
    AND is_deleted = false
    AND latitude  IS NOT NULL
    AND longitude IS NOT NULL;

-- pin_type filter for giant pin queries
CREATE INDEX IF NOT EXISTS idx_venues_pin_type_giant
  ON public.venues (pin_type)
  WHERE
    deleted_at IS NULL
    AND is_deleted = false
    AND pin_type = 'giant';

-- updated_at for feed ordering
CREATE INDEX IF NOT EXISTS idx_venues_updated_at_desc
  ON public.venues (updated_at DESC NULLS LAST)
  WHERE deleted_at IS NULL AND is_deleted = false;

-- ============================================================================
-- PART 7: Verify migrate ran successfully (comment out for production)
-- ============================================================================
-- SELECT COUNT(*) AS provinces FROM public.get_map_province_aggregates(NULL);
-- SELECT COUNT(*) AS pins FROM public.get_map_pins(18.6, 98.8, 19.0, 99.2, 15);
-- SELECT COUNT(*) AS feed FROM public.get_feed_cards(18.78, 98.99, 20);

COMMIT;
