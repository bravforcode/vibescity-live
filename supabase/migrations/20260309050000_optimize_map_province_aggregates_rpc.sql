-- =============================================================================
-- Migration: Optimize Province Aggregate RPC for Nationwide + Filtered Map Flow
-- Date: 2026-03-09
-- Purpose:
--   1. Remove expensive aggregate work from get_map_province_aggregates(uuid[])
--   2. Speed up large scoped requests by joining against unnested venue ids
--   3. Add supporting indexes for province/category/status map aggregation
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_venues_map_province_scope
  ON public.venues (province)
  WHERE deleted_at IS NULL
    AND (is_deleted IS NULL OR is_deleted = false)
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND province IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_map_category_status_scope
  ON public.venues (category, status)
  WHERE deleted_at IS NULL
    AND (is_deleted IS NULL OR is_deleted = false)
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_map_province_aggregates(uuid[]);

CREATE FUNCTION public.get_map_province_aggregates(
  p_venue_ids uuid[] DEFAULT NULL
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
SET statement_timeout = '15000ms'
AS $$
  WITH scoped_ids AS (
    SELECT unnest(p_venue_ids) AS venue_id
  ),
  source_venues AS (
    SELECT
      v.id,
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
    WHERE p_venue_ids IS NULL
      AND v.deleted_at IS NULL
      AND (v.is_deleted IS NULL OR v.is_deleted = false)
      AND v.latitude IS NOT NULL
      AND v.longitude IS NOT NULL
      AND v.province IS NOT NULL
      AND trim(v.province) <> ''

    UNION ALL

    SELECT
      v.id,
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
    FROM scoped_ids s
    JOIN public.venues v
      ON v.id = s.venue_id
    WHERE p_venue_ids IS NOT NULL
      AND v.deleted_at IS NULL
      AND (v.is_deleted IS NULL OR v.is_deleted = false)
      AND v.latitude IS NOT NULL
      AND v.longitude IS NOT NULL
      AND v.province IS NOT NULL
      AND trim(v.province) <> ''
  ),
  resolved AS (
    SELECT
      sv.id,
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
  ON FUNCTION public.get_map_province_aggregates(uuid[])
  TO anon, authenticated, service_role;

COMMIT;
