-- =============================================================================
-- Migration: Dynamic Province Aggregate RPC v2 Query Planning
-- Date: 2026-03-09
-- Purpose:
--   1. Build a query plan that only includes active province filters
--   2. Let PostgreSQL use category/status indexes without generic-plan OR branches
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_map_province_aggregates_v2(text[], text[], text);

CREATE FUNCTION public.get_map_province_aggregates_v2(
  p_categories   text[] DEFAULT NULL,
  p_statuses     text[] DEFAULT NULL,
  p_search_query text   DEFAULT NULL
)
RETURNS TABLE (
  id                        text,
  name                      text,
  province                  text,
  lat                       double precision,
  lng                       double precision,
  pin_type                  text,
  pin_state                 text,
  aggregate_level           text,
  aggregate_shop_count      bigint,
  aggregate_dominant_count  bigint,
  promotion_score           numeric,
  visibility_score          numeric,
  verified_active           boolean,
  glow_active               boolean,
  boost_active              boolean,
  giant_active              boolean,
  sign_scale                numeric,
  cover_image               text,
  pin_metadata              jsonb
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET statement_timeout = '15000ms'
AS $$
DECLARE
  normalized_categories text[] := ARRAY(
    SELECT DISTINCT trim(category_value)
    FROM unnest(COALESCE(p_categories, ARRAY[]::text[])) AS category_value
    WHERE trim(category_value) <> ''
  );
  normalized_statuses text[] := ARRAY(
    SELECT DISTINCT lower(trim(status_value))
    FROM unnest(COALESCE(p_statuses, ARRAY[]::text[])) AS status_value
    WHERE trim(status_value) <> ''
  );
  normalized_search text := NULLIF(lower(trim(COALESCE(p_search_query, ''))), '');
  search_pattern text := NULL;
  sql text := $sql$
    WITH province_lookup AS (
      SELECT lower(tp.name_en) AS lookup_key, tp.name_en
      FROM public.th_provinces tp
      UNION
      SELECT lower(tp.name_th) AS lookup_key, tp.name_en
      FROM public.th_provinces tp
      UNION
      SELECT lower(ta.alias) AS lookup_key, ta.name_en
      FROM public.th_province_aliases ta
    ),
    resolved AS (
      SELECT
        v.latitude,
        v.longitude,
        v.visibility_score,
        v.status,
        v.verified_until,
        v.glow_until,
        v.boost_until,
        v.giant_until,
        v.pin_type,
        pl.name_en AS canonical_province
      FROM public.venues v
      LEFT JOIN province_lookup pl
        ON pl.lookup_key = lower(trim(v.province))
      WHERE v.deleted_at IS NULL
        AND (v.is_deleted IS NULL OR v.is_deleted = false)
        AND v.latitude IS NOT NULL
        AND v.longitude IS NOT NULL
        AND v.province IS NOT NULL
        AND trim(v.province) <> ''
  $sql$;
BEGIN
  IF COALESCE(array_length(normalized_categories, 1), 0) > 0 THEN
    sql := sql || format(
      ' AND v.category = ANY(%L::text[])',
      normalized_categories
    );
  END IF;

  IF COALESCE(array_length(normalized_statuses, 1), 0) > 0 THEN
    sql := sql || format(
      ' AND lower(v.status::text) = ANY(%L::text[])',
      normalized_statuses
    );
  END IF;

  IF normalized_search IS NOT NULL THEN
    search_pattern := '%' || normalized_search || '%';
    sql := sql || format(
      ' AND (lower(COALESCE(v.name, '''')) LIKE %L
          OR lower(COALESCE(v.description, '''')) LIKE %L
          OR lower(COALESCE(v.category, '''')) LIKE %L)',
      search_pattern,
      search_pattern,
      search_pattern
    );
  END IF;

  sql := sql || $sql$
    )
    SELECT
      lower(tp.name_en) AS id,
      tp.name_en AS name,
      tp.name_en AS province,
      COALESCE(AVG(r.latitude), tp.lat_hint) AS lat,
      COALESCE(AVG(r.longitude), tp.lng_hint) AS lng,
      'giant'::text AS pin_type,
      'province'::text AS pin_state,
      'province'::text AS aggregate_level,
      COUNT(*) AS aggregate_shop_count,
      COUNT(*) FILTER (
        WHERE lower(r.status::text) IN ('active', 'live', 'tonight', 'open')
      ) AS aggregate_dominant_count,
      COALESCE(MAX(r.visibility_score), 0)::numeric AS promotion_score,
      COALESCE(AVG(r.visibility_score), 0)::numeric AS visibility_score,
      COALESCE(
        BOOL_OR(r.verified_until IS NOT NULL AND r.verified_until > now()),
        false
      ) AS verified_active,
      COALESCE(
        BOOL_OR(r.glow_until IS NOT NULL AND r.glow_until > now()),
        false
      ) AS glow_active,
      COALESCE(
        BOOL_OR(r.boost_until IS NOT NULL AND r.boost_until > now()),
        false
      ) AS boost_active,
      COALESCE(
        BOOL_OR(
          (r.giant_until IS NOT NULL AND r.giant_until > now())
          OR lower(COALESCE(r.pin_type, '')) = 'giant'
        ),
        false
      ) AS giant_active,
      GREATEST(
        1.0,
        LEAST(2.0, LOG(GREATEST(COUNT(*), 1) + 1) * 0.4 + 0.8)
      )::numeric AS sign_scale,
      NULL::text AS cover_image,
      jsonb_build_object(
        'aggregate', true,
        'aggregate_level', 'province'
      ) AS pin_metadata
    FROM resolved r
    JOIN public.th_provinces tp
      ON tp.name_en = r.canonical_province
    WHERE r.canonical_province IS NOT NULL
    GROUP BY tp.id, tp.name_en, tp.lat_hint, tp.lng_hint
    HAVING COUNT(*) > 0
    ORDER BY COUNT(*) DESC, tp.name_en ASC
  $sql$;

  RETURN QUERY EXECUTE sql;
END;
$$;

GRANT EXECUTE
  ON FUNCTION public.get_map_province_aggregates_v2(text[], text[], text)
  TO anon, authenticated, service_role;

COMMIT;
