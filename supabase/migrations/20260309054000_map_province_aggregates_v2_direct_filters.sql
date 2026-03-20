-- =============================================================================
-- Migration: Province Aggregate RPC v2 with Direct Filter Params
-- Date: 2026-03-09
-- Purpose:
--   1. Eliminate client-side venue-id hydration for province filter changes
--   2. Accept category/status/search filters directly in the RPC
--   3. Preserve the same province aggregate payload shape used by the map
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
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH normalized_categories AS (
    SELECT ARRAY(
      SELECT DISTINCT trim(category_value)
      FROM unnest(COALESCE(p_categories, ARRAY[]::text[])) AS category_value
      WHERE trim(category_value) <> ''
    ) AS values
  ),
  normalized_statuses AS (
    SELECT ARRAY(
      SELECT DISTINCT lower(trim(status_value))
      FROM unnest(COALESCE(p_statuses, ARRAY[]::text[])) AS status_value
      WHERE trim(status_value) <> ''
    ) AS values
  ),
  search_term AS (
    SELECT NULLIF(lower(trim(COALESCE(p_search_query, ''))), '') AS value
  ),
  source_venues AS (
    SELECT
      trim(v.province) AS province_input,
      v.latitude,
      v.longitude,
      v.visibility_score,
      v.status,
      v.verified_until,
      v.glow_until,
      v.boost_until,
      v.giant_until,
      v.pin_type
    FROM public.venues v
    CROSS JOIN normalized_categories nc
    CROSS JOIN normalized_statuses ns
    CROSS JOIN search_term st
    WHERE v.deleted_at IS NULL
      AND (v.is_deleted IS NULL OR v.is_deleted = false)
      AND v.latitude IS NOT NULL
      AND v.longitude IS NOT NULL
      AND v.province IS NOT NULL
      AND trim(v.province) <> ''
      AND (COALESCE(array_length(nc.values, 1), 0) = 0 OR v.category = ANY(nc.values))
      AND (
        COALESCE(array_length(ns.values, 1), 0) = 0
        OR lower(v.status::text) = ANY(ns.values)
      )
      AND (
        st.value IS NULL
        OR lower(COALESCE(v.name, '')) LIKE '%' || st.value || '%'
        OR lower(COALESCE(v.description, '')) LIKE '%' || st.value || '%'
        OR lower(COALESCE(v.category, '')) LIKE '%' || st.value || '%'
      )
  ),
  resolved AS (
    SELECT
      sv.latitude,
      sv.longitude,
      sv.visibility_score,
      sv.status,
      sv.verified_until,
      sv.glow_until,
      sv.boost_until,
      sv.giant_until,
      sv.pin_type,
      COALESCE(
        tp_en.name_en,
        tp_th.name_en,
        ta.name_en
      ) AS canonical_province
    FROM source_venues sv
    LEFT JOIN public.th_provinces tp_en
      ON lower(tp_en.name_en) = lower(sv.province_input)
    LEFT JOIN public.th_provinces tp_th
      ON tp_th.name_th = sv.province_input
    LEFT JOIN public.th_province_aliases ta
      ON lower(ta.alias) = lower(sv.province_input)
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
$$;

GRANT EXECUTE
  ON FUNCTION public.get_map_province_aggregates_v2(text[], text[], text)
  TO anon, authenticated, service_role;

COMMIT;
