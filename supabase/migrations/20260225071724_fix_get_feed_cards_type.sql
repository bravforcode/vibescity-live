-- Fix return type for get_feed_cards RPC to match distance_km type
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
