-- =============================================================================
-- Migration: Restore search_venues_v2 + fix ILIKE indexes
-- Date: 2026-03-01
-- Reason: Later schema optimization migrations DROP search_venues_v2 without
--         recreating it, causing search to fall back to slow select("*") paths.
-- =============================================================================

BEGIN;

-- Enable trigram extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1) Restore search_venues_v2 (dropped in ultrathink_schema_optimization_part3)
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
  v_lat_window double precision := 0.70; -- ~78km
  v_lng_window double precision := 0.70;
BEGIN
  IF v_query = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH region AS (
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
      AND v.deleted_at IS NULL
      AND (
        p_lat IS NULL OR p_lng IS NULL
        OR (
          (
            v.location IS NOT NULL
            AND st_dwithin(
              v.location::geography,
              st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
              70000
            )
          )
          OR (
            v.location IS NULL
            AND v.latitude BETWEEN (p_lat - v_lat_window) AND (p_lat + v_lat_window)
            AND v.longitude BETWEEN (p_lng - v_lng_window) AND (p_lng + v_lng_window)
          )
        )
      )
  ),
  matched AS (
    SELECT r.*
    FROM region r
    WHERE
      r.name ILIKE '%' || v_query || '%'
      OR r.category ILIKE '%' || v_query || '%'
      OR COALESCE(r.zone, '') ILIKE '%' || v_query || '%'
      OR COALESCE(r.floor, '') ILIKE '%' || v_query || '%'
    ORDER BY
      CASE WHEN r.name ILIKE v_query || '%' THEN 1 ELSE 0 END DESC,
      r.view_count DESC,
      r.name ASC
    LIMIT 800
  )
  SELECT
    m.id,
    m.name,
    m.slug,
    m.category,
    m.status,
    m.image_url,
    m.floor,
    m.zone,
    m.rating,
    m.view_count,
    m.name AS highlight_snippet,
    CASE
      WHEN m.lat IS NULL OR m.lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN NULL
      ELSE st_distance(
        st_setsrid(st_makepoint(m.lng, m.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      )
    END AS distance_meters,
    m.lat,
    m.lng,
    m.pin_type,
    m.giant_active
  FROM matched m
  ORDER BY
    CASE WHEN m.name ILIKE v_query || '%' THEN 1 ELSE 0 END DESC,
    CASE WHEN m.giant_active THEN 1 ELSE 0 END DESC,
    distance_meters ASC NULLS LAST,
    m.view_count DESC,
    m.name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_venues_v2(text, double precision, double precision, integer, integer)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Trigram indexes for ILIKE search performance
--    Without these, ILIKE '%query%' does full seq scan on large tables
-- ---------------------------------------------------------------------------

-- venues.name — used in search_venues_v2 matched CTE
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm
  ON public.venues USING GIN (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- venues.category — also searched in matched CTE
CREATE INDEX IF NOT EXISTS idx_venues_category_trgm
  ON public.venues USING GIN (category gin_trgm_ops)
  WHERE deleted_at IS NULL AND category IS NOT NULL;

-- authority_places.name — used in places.py ILIKE search
CREATE INDEX IF NOT EXISTS idx_authority_places_name_trgm
  ON public.authority_places USING GIN (name gin_trgm_ops);

-- authority_places.province — exact match, btree is fine
CREATE INDEX IF NOT EXISTS idx_authority_places_province
  ON public.authority_places (province)
  WHERE province IS NOT NULL;

-- authority_places.updated_at — ORDER BY updated_at DESC
CREATE INDEX IF NOT EXISTS idx_authority_places_updated_at
  ON public.authority_places (updated_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 3) Verify search_venues_v2 is callable
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) FROM public.search_venues_v2('test', NULL, NULL, 5, 0);

COMMIT;
