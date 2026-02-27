-- =============================================================================
-- Migration: RPC compatibility + fast map pin bounds filtering
-- Date: 2026-02-23
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Restore increment_venue_views UUID RPC for frontend analytics calls
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.increment_venue_views(bigint);
DROP FUNCTION IF EXISTS public.increment_venue_views(uuid);

CREATE OR REPLACE FUNCTION public.increment_venue_views(venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF venue_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.venues
  SET
    total_views = COALESCE(total_views, 0) + 1,
    view_count = COALESCE(view_count, 0) + 1
  WHERE id = venue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_venue_views(uuid)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Rebuild get_map_pins with bbox prefilter before computed columns
--    - Avoids full-table scan work that can hit statement timeout.
--    - Keeps giant-first ordering only for low/mid zoom.
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
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_zoom int := COALESCE(p_zoom, 15);
  v_bbox geometry;
BEGIN
  v_bbox := st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326);

  RETURN QUERY
  WITH candidates AS (
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
      AND (
        (v.location IS NOT NULL AND st_intersects(v.location::geometry, v_bbox))
        OR (
          v.location IS NULL
          AND v.latitude BETWEEN p_min_lat AND p_max_lat
          AND v.longitude BETWEEN p_min_lng AND p_max_lng
        )
      )
  )
  SELECT
    c.id,
    c.name,
    c.lat,
    c.lng,
    CASE WHEN c.giant_active THEN 'giant' ELSE c.pin_type END AS pin_type,
    c.pin_metadata,
    c.visibility_score,
    c.is_verified,
    c.verified_active,
    c.glow_active,
    c.boost_active,
    c.giant_active,
    c.cover_image
  FROM candidates c
  WHERE c.lat IS NOT NULL
    AND c.lng IS NOT NULL
    AND (
      (v_zoom < 13 AND c.giant_active)
      OR (v_zoom BETWEEN 13 AND 15 AND (c.giant_active OR c.boost_active OR c.visibility_score > 0))
      OR (v_zoom > 15)
    )
  ORDER BY
    CASE WHEN v_zoom <= 15 AND c.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN c.boost_active THEN 1 ELSE 0 END DESC,
    c.visibility_score DESC,
    c.name ASC
  LIMIT CASE
    WHEN v_zoom < 13 THEN 300
    WHEN v_zoom BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;

COMMIT;
