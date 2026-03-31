-- Migration: Map pins performance tuning (index + RPC plan shape)
-- Scope: keep existing RPC contract, improve planner selectivity and bounds scan
-- Safety: idempotent, forward-only

BEGIN;

-- 1) Targeted indexes for get_map_pins filters/order paths
CREATE INDEX IF NOT EXISTS idx_venues_active_pin_type_expr
  ON public.venues ((COALESCE(pin_type, 'normal')))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_venues_active_visibility_score
  ON public.venues (visibility_score DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_venues_active_boost_until
  ON public.venues (boost_until DESC)
  WHERE status = 'active' AND boost_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_active_lat_lng_fallback
  ON public.venues (latitude, longitude)
  WHERE status = 'active' AND location IS NULL;

-- 2) Rewrite get_map_pins to avoid OR-heavy bounds predicate in each branch.
--    We keep the same signature and output schema.
CREATE OR REPLACE FUNCTION public.get_map_pins(
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
  pin_type         text,
  pin_metadata     jsonb,
  visibility_score int,
  is_verified      boolean,
  verified_active  boolean,
  glow_active      boolean,
  boost_active     boolean,
  giant_active     boolean,
  cover_image      text
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_envelope geometry;
BEGIN
  v_envelope := st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);

  IF p_zoom < 13 THEN
    RETURN QUERY
    WITH in_bounds AS (
      SELECT v.*
      FROM public.venues v
      WHERE v.status = 'active'
        AND v.location IS NOT NULL
        AND st_intersects(v.location::geometry, v_envelope)
      UNION ALL
      SELECT v.*
      FROM public.venues v
      WHERE v.status = 'active'
        AND v.location IS NULL
        AND v.latitude BETWEEN p_min_lat AND p_max_lat
        AND v.longitude BETWEEN p_min_lng AND p_max_lng
    )
    SELECT
      v.id,
      v.name,
      COALESCE(st_y(v.location::geometry), v.latitude)  AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
      COALESCE(v.pin_type, 'normal')::text              AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb)             AS pin_metadata,
      COALESCE(v.visibility_score, 0)                   AS visibility_score,
      COALESCE(v.is_verified, false)                    AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now())         AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now())       AS boost_active,
      (v.giant_until IS NOT NULL AND v.giant_until > now())       AS giant_active,
      v.image_urls[1]                                   AS cover_image
    FROM in_bounds v
    WHERE COALESCE(v.pin_type, 'normal') = 'giant';

  ELSIF p_zoom BETWEEN 13 AND 15 THEN
    RETURN QUERY
    WITH in_bounds AS (
      SELECT v.*
      FROM public.venues v
      WHERE v.status = 'active'
        AND v.location IS NOT NULL
        AND st_intersects(v.location::geometry, v_envelope)
      UNION ALL
      SELECT v.*
      FROM public.venues v
      WHERE v.status = 'active'
        AND v.location IS NULL
        AND v.latitude BETWEEN p_min_lat AND p_max_lat
        AND v.longitude BETWEEN p_min_lng AND p_max_lng
    ),
    giant_in_bounds AS (
      SELECT
        v.id,
        v.name,
        COALESCE(st_y(v.location::geometry), v.latitude)  AS lat,
        COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
        COALESCE(v.pin_type, 'normal')::text              AS pin_type,
        COALESCE(v.pin_metadata, '{}'::jsonb)             AS pin_metadata,
        COALESCE(v.visibility_score, 0)                   AS visibility_score,
        COALESCE(v.is_verified, false)                    AS is_verified,
        (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
        (v.glow_until IS NOT NULL AND v.glow_until > now())         AS glow_active,
        (v.boost_until IS NOT NULL AND v.boost_until > now())       AS boost_active,
        (v.giant_until IS NOT NULL AND v.giant_until > now())       AS giant_active,
        v.image_urls[1]                                   AS cover_image
      FROM in_bounds v
      WHERE COALESCE(v.pin_type, 'normal') = 'giant'
    ),
    boosted_or_visible AS (
      SELECT
        v.id,
        v.name,
        COALESCE(st_y(v.location::geometry), v.latitude)  AS lat,
        COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
        COALESCE(v.pin_type, 'normal')::text              AS pin_type,
        COALESCE(v.pin_metadata, '{}'::jsonb)             AS pin_metadata,
        COALESCE(v.visibility_score, 0)                   AS visibility_score,
        COALESCE(v.is_verified, false)                    AS is_verified,
        (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
        (v.glow_until IS NOT NULL AND v.glow_until > now())         AS glow_active,
        (v.boost_until IS NOT NULL AND v.boost_until > now())       AS boost_active,
        (v.giant_until IS NOT NULL AND v.giant_until > now())       AS giant_active,
        v.image_urls[1]                                   AS cover_image,
        CASE
          WHEN v.boost_until > now() THEN 999999
          ELSE COALESCE(v.visibility_score, 0)
        END AS rank_score
      FROM in_bounds v
      WHERE COALESCE(v.pin_type, 'normal') <> 'giant'
        AND (
          (v.boost_until IS NOT NULL AND v.boost_until > now())
          OR COALESCE(v.visibility_score, 0) > 0
        )
      ORDER BY rank_score DESC
      LIMIT 120
    )
    SELECT
      g.id, g.name, g.lat, g.lng, g.pin_type, g.pin_metadata, g.visibility_score,
      g.is_verified, g.verified_active, g.glow_active, g.boost_active, g.giant_active,
      g.cover_image
    FROM giant_in_bounds g
    UNION ALL
    SELECT
      b.id, b.name, b.lat, b.lng, b.pin_type, b.pin_metadata, b.visibility_score,
      b.is_verified, b.verified_active, b.glow_active, b.boost_active, b.giant_active,
      b.cover_image
    FROM boosted_or_visible b;

  ELSE
    RETURN QUERY
    WITH in_bounds AS (
      SELECT v.*
      FROM public.venues v
      WHERE v.status = 'active'
        AND v.location IS NOT NULL
        AND st_intersects(v.location::geometry, v_envelope)
      UNION ALL
      SELECT v.*
      FROM public.venues v
      WHERE v.status = 'active'
        AND v.location IS NULL
        AND v.latitude BETWEEN p_min_lat AND p_max_lat
        AND v.longitude BETWEEN p_min_lng AND p_max_lng
    )
    SELECT
      v.id,
      v.name,
      COALESCE(st_y(v.location::geometry), v.latitude)  AS lat,
      COALESCE(st_x(v.location::geometry), v.longitude) AS lng,
      COALESCE(v.pin_type, 'normal')::text              AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb)             AS pin_metadata,
      COALESCE(v.visibility_score, 0)                   AS visibility_score,
      COALESCE(v.is_verified, false)                    AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now())         AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now())       AS boost_active,
      (v.giant_until IS NOT NULL AND v.giant_until > now())       AS giant_active,
      v.image_urls[1]                                   AS cover_image
    FROM in_bounds v
    ORDER BY COALESCE(v.visibility_score, 0) DESC
    LIMIT LEAST(500, 1000);
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

COMMIT;
