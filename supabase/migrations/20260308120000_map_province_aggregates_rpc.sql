-- Dedicated province aggregate RPC for low-zoom map rendering
-- Returns one row per province so the client does not need to aggregate venue pins.

BEGIN;

DROP FUNCTION IF EXISTS public.get_map_province_aggregates();
DROP FUNCTION IF EXISTS public.get_map_province_aggregates(text[]);

CREATE OR REPLACE FUNCTION public.get_map_province_aggregates(
  p_venue_ids text[] DEFAULT NULL
)
RETURNS TABLE (
  id text,
  name text,
  province text,
  lat double precision,
  lng double precision,
  pin_type text,
  pin_state text,
  pin_metadata jsonb,
  aggregate_level text,
  aggregate_shop_count integer,
  aggregate_dominant_count integer,
  promotion_score double precision,
  visibility_score integer,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  sign_scale double precision,
  cover_image text
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
SET statement_timeout = '8s'
AS $$
  WITH base AS (
    SELECT
      v.id::text AS venue_id,
      NULLIF(BTRIM(v.province), '') AS province,
      COALESCE(ST_Y(v.location::geometry), v.latitude)::double precision AS lat,
      COALESCE(ST_X(v.location::geometry), v.longitude)::double precision AS lng,
      COALESCE(v.visibility_score, 0)::integer AS visibility_score,
      (COALESCE(v.is_verified, false) OR (v.verified_until IS NOT NULL AND v.verified_until > now())) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type::text, '')) = 'giant') AS giant_active,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      COALESCE(v.image_urls[1], to_jsonb(v) ->> 'Image_URL1') AS cover_image
    FROM public.venues v
    WHERE (v.status IS NULL OR lower(COALESCE(v.status::text, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted'))
      AND v.deleted_at IS NULL
      AND NULLIF(BTRIM(v.province), '') IS NOT NULL
      AND (p_venue_ids IS NULL OR v.id::text = ANY(p_venue_ids))
      AND (
        (v.location IS NOT NULL AND ST_X(v.location::geometry) IS NOT NULL AND ST_Y(v.location::geometry) IS NOT NULL)
        OR (v.location IS NULL AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL)
      )
  ),
  scored AS (
    SELECT
      b.*,
      (
        CASE WHEN b.boost_active THEN 16 ELSE 0 END +
        CASE WHEN b.giant_active THEN 14 ELSE 0 END +
        LEAST(GREATEST(b.visibility_score, 0), 100) * 0.18
      )::double precision AS promotion_score
    FROM base b
  ),
  ranked_cover AS (
    SELECT DISTINCT ON (s.province)
      s.province,
      s.cover_image
    FROM scored s
    WHERE NULLIF(BTRIM(s.cover_image), '') IS NOT NULL
    ORDER BY
      s.province,
      s.boost_active DESC,
      s.giant_active DESC,
      s.visibility_score DESC,
      s.venue_id ASC
  ),
  aggregated AS (
    SELECT
      s.province,
      COUNT(*)::integer AS aggregate_shop_count,
      SUM(CASE WHEN s.giant_active OR s.promotion_score >= 55 THEN 1 ELSE 0 END)::integer AS aggregate_dominant_count,
      MAX(s.promotion_score)::double precision AS promotion_score,
      ROUND(SUM(s.visibility_score) + MAX(s.promotion_score) * 4)::integer AS visibility_score,
      BOOL_OR(s.verified_active) AS verified_active,
      BOOL_OR(s.glow_active) AS glow_active,
      BOOL_OR(s.boost_active) AS boost_active,
      BOOL_OR(s.giant_active) AS giant_active,
      (
        SUM(s.lat * (1 + s.promotion_score * 0.015))
        / NULLIF(SUM(1 + s.promotion_score * 0.015), 0)
      )::double precision AS lat,
      (
        SUM(s.lng * (1 + s.promotion_score * 0.015))
        / NULLIF(SUM(1 + s.promotion_score * 0.015), 0)
      )::double precision AS lng
    FROM scored s
    GROUP BY s.province
  )
  SELECT
    'province:' || regexp_replace(lower(a.province), '[^a-z0-9]+', '-', 'g') AS id,
    a.province AS name,
    a.province,
    a.lat,
    a.lng,
    'giant'::text AS pin_type,
    'event'::text AS pin_state,
    jsonb_build_object(
      'aggregate', true,
      'aggregate_level', 'province',
      'province', a.province,
      'aggregate_shop_count', a.aggregate_shop_count
    ) AS pin_metadata,
    'province'::text AS aggregate_level,
    a.aggregate_shop_count,
    a.aggregate_dominant_count,
    ROUND(a.promotion_score::numeric, 2)::double precision AS promotion_score,
    a.visibility_score,
    a.verified_active,
    a.glow_active,
    a.boost_active,
    a.giant_active,
    GREATEST(
      1.05,
      LEAST(
        2.2,
        1 + a.promotion_score * 0.005 + CASE WHEN a.aggregate_dominant_count > 0 THEN 0.2 ELSE 0 END
      )
    )::double precision AS sign_scale,
    rc.cover_image
  FROM aggregated a
  LEFT JOIN ranked_cover rc
    ON rc.province = a.province
  ORDER BY
    a.promotion_score DESC,
    a.aggregate_shop_count DESC,
    a.province ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_province_aggregates(text[])
  TO anon, authenticated, service_role;

RESET statement_timeout;

COMMIT;
