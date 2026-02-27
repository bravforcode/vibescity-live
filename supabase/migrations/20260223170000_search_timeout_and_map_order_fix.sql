-- =============================================================================
-- Migration: Fix search_venues_v2 timeout + map pin ordering at high zoom
-- Date: 2026-02-23
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Fast search_venues_v2
--    - Applies geographic pre-filter first when user lat/lng is provided.
--    - Uses spatial intersection on location when available.
--    - Limits candidate set before final ordering.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_venues_v2(text, integer);
DROP FUNCTION IF EXISTS public.search_venues_v2(text, double precision, double precision, integer, integer);
DROP FUNCTION IF EXISTS public.search_venues_v2(text, double precision, double precision, double precision, integer, integer);

CREATE OR REPLACE FUNCTION public.search_venues_v2(
  p_query text,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  category text,
  status text,
  image_url text,
  floor text,
  zone text,
  rating numeric,
  view_count bigint,
  highlight_snippet text,
  distance_meters double precision,
  lat double precision,
  lng double precision,
  pin_type text,
  giant_active boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_query text := trim(COALESCE(p_query, ''));
  v_min_lat double precision;
  v_max_lat double precision;
  v_min_lng double precision;
  v_max_lng double precision;
BEGIN
  IF v_query = '' THEN
    RETURN;
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    -- ~130km search window (fast prefilter before text matching)
    v_min_lat := p_lat - 1.2;
    v_max_lat := p_lat + 1.2;
    v_min_lng := p_lng - 1.2;
    v_max_lng := p_lng + 1.2;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      v.id,
      v.name,
      NULLIF(v.slug, '') AS slug,
      v.category,
      v.status,
      COALESCE(v.image_urls[1], v."Image_URL1") AS image_url,
      COALESCE(NULLIF(to_jsonb(v) ->> 'floor', ''), NULLIF(to_jsonb(v) ->> 'Floor', '')) AS floor,
      COALESCE(NULLIF(to_jsonb(v) ->> 'zone', ''), NULLIF(to_jsonb(v) ->> 'Zone', ''), NULLIF(to_jsonb(v) ->> 'district', '')) AS zone,
      COALESCE(v.rating, 0)::numeric AS rating,
      COALESCE(v.total_views, v.view_count, 0)::bigint AS view_count,
      COALESCE(st_y(v.location::geometry), v.latitude) AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
      CASE
        WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant'
        ELSE 'normal'
      END AS pin_type,
      (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type, '')) = 'giant'
      ) AS giant_active
    FROM public.venues v
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
      AND (
        p_lat IS NULL OR p_lng IS NULL
        OR (
          (
            v.location IS NOT NULL
            AND st_intersects(
              v.location::geometry,
              st_makeenvelope(v_min_lng, v_min_lat, v_max_lng, v_max_lat, 4326)
            )
          )
          OR (
            v.location IS NULL
            AND v.latitude BETWEEN v_min_lat AND v_max_lat
            AND v.longitude BETWEEN v_min_lng AND v_max_lng
          )
        )
      )
      AND (
        v.name ILIKE '%' || v_query || '%'
        OR v.category ILIKE '%' || v_query || '%'
        OR COALESCE(NULLIF(to_jsonb(v) ->> 'district', ''), '') ILIKE '%' || v_query || '%'
        OR COALESCE(NULLIF(to_jsonb(v) ->> 'floor', ''), NULLIF(to_jsonb(v) ->> 'Floor', ''), '') ILIKE '%' || v_query || '%'
      )
    LIMIT 2000
  )
  SELECT
    c.id,
    c.name,
    c.slug,
    c.category,
    c.status,
    c.image_url,
    c.floor,
    c.zone,
    c.rating,
    c.view_count,
    c.name AS highlight_snippet,
    CASE
      WHEN c.lat IS NULL OR c.lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN NULL
      ELSE st_distance(
        st_setsrid(st_makepoint(c.lng, c.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      )
    END AS distance_meters,
    c.lat,
    c.lng,
    c.pin_type,
    c.giant_active
  FROM candidates c
  ORDER BY
    CASE WHEN c.name ILIKE v_query || '%' THEN 1 ELSE 0 END DESC,
    CASE WHEN c.giant_active THEN 1 ELSE 0 END DESC,
    distance_meters ASC NULLS LAST,
    c.view_count DESC,
    c.name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_venues_v2(text, double precision, double precision, integer, integer)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Tune get_map_pins ordering
--    - Keep giant priority for low/mid zoom.
--    - Do not force giant-first ordering on high zoom.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_map_pins(double precision, double precision, double precision, double precision, int);

CREATE OR REPLACE FUNCTION public.get_map_pins(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom int
)
RETURNS TABLE (
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  pin_type text,
  pin_metadata jsonb,
  visibility_score integer,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  cover_image text
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      v.id,
      v.name,
      COALESCE(st_y(v.location::geometry), v.latitude) AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      COALESCE(v.visibility_score, 0) AS visibility_score,
      COALESCE(v.is_verified, false) AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      (
        (v.giant_until IS NOT NULL AND v.giant_until > now())
        OR lower(COALESCE(v.pin_type, '')) = 'giant'
      ) AS giant_active,
      COALESCE(v.image_urls[1], v."Image_URL1") AS cover_image
    FROM public.venues v
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
  )
  SELECT
    b.id, b.name, b.lat, b.lng,
    CASE WHEN b.giant_active THEN 'giant' ELSE b.pin_type END AS pin_type,
    b.pin_metadata, b.visibility_score, b.is_verified,
    b.verified_active, b.glow_active, b.boost_active, b.giant_active, b.cover_image
  FROM base b
  WHERE b.lat IS NOT NULL
    AND b.lng IS NOT NULL
    AND b.lat BETWEEN p_min_lat AND p_max_lat
    AND b.lng BETWEEN p_min_lng AND p_max_lng
    AND (
      (COALESCE(p_zoom, 15) < 13 AND b.giant_active)
      OR (COALESCE(p_zoom, 15) BETWEEN 13 AND 15 AND (b.giant_active OR b.boost_active OR b.visibility_score > 0))
      OR (COALESCE(p_zoom, 15) > 15)
    )
  ORDER BY
    CASE WHEN COALESCE(p_zoom, 15) <= 15 AND b.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN b.boost_active THEN 1 ELSE 0 END DESC,
    b.visibility_score DESC,
    b.name ASC
  LIMIT CASE
    WHEN COALESCE(p_zoom, 15) < 13 THEN 300
    WHEN COALESCE(p_zoom, 15) BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

COMMIT;
