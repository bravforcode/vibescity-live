-- Hotfix search_venues/get_feed_cards timeout (compat)
BEGIN;

DROP FUNCTION IF EXISTS public.search_venues(text, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.search_venues(
  p_query text DEFAULT '',
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_km double precision DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  category text,
  status text,
  province text,
  latitude double precision,
  longitude double precision,
  image_urls text[],
  rating numeric,
  review_count integer,
  total_views bigint,
  pin_type text,
  distance_km double precision
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_query text := trim(COALESCE(p_query, ''));
  v_radius_km double precision := LEAST(GREATEST(COALESCE(p_radius_km, 50), 1), 150);
  v_lat_delta double precision;
  v_lng_delta double precision;
  v_min_lat double precision;
  v_max_lat double precision;
  v_min_lng double precision;
  v_max_lng double precision;
BEGIN
  IF v_query = '' THEN
    RETURN;
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_lat_delta := GREATEST(v_radius_km / 111.0, 0.08);
    v_lng_delta := GREATEST(v_radius_km / 111.0, 0.08);
    v_min_lat := p_lat - v_lat_delta;
    v_max_lat := p_lat + v_lat_delta;
    v_min_lng := p_lng - v_lng_delta;
    v_max_lng := p_lng + v_lng_delta;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      v.id,
      v.name,
      v.slug,
      v.category,
      v.status,
      v.province,
      COALESCE(st_y(v.location::geometry), v.latitude) AS latitude,
      COALESCE(st_x(v.location::geometry), v.longitude) AS longitude,
      COALESCE(v.image_urls, ARRAY[]::text[]) AS image_urls,
      COALESCE(v.rating, 0)::numeric AS rating,
      COALESCE(v.total_views, v.view_count, 0)::bigint AS total_views,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type
    FROM public.venues v
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
      AND (
        p_lat IS NULL OR p_lng IS NULL
        OR (
          (v.location IS NOT NULL AND st_intersects(v.location::geometry, st_makeenvelope(v_min_lng, v_min_lat, v_max_lng, v_max_lat, 4326)))
          OR (v.location IS NULL AND v.latitude BETWEEN v_min_lat AND v_max_lat AND v.longitude BETWEEN v_min_lng AND v_max_lng)
        )
      )
      AND (
        v.name ILIKE '%' || v_query || '%'
        OR COALESCE(v.category, '') ILIKE '%' || v_query || '%'
        OR COALESCE(v.province, '') ILIKE '%' || v_query || '%'
      )
    LIMIT 2500
  ),
  ranked AS (
    SELECT
      c.*,
      CASE
        WHEN p_lat IS NULL OR p_lng IS NULL OR c.latitude IS NULL OR c.longitude IS NULL THEN NULL
        ELSE st_distance(
          st_setsrid(st_makepoint(c.longitude, c.latitude), 4326)::geography,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
        ) / 1000.0
      END AS distance_km
    FROM candidates c
  )
  SELECT
    r.id,
    r.name,
    r.slug,
    r.category,
    r.status,
    r.province,
    r.latitude,
    r.longitude,
    r.image_urls,
    r.rating,
    0::integer AS review_count,
    r.total_views,
    r.pin_type,
    r.distance_km
  FROM ranked r
  WHERE p_lat IS NULL OR p_lng IS NULL OR r.distance_km IS NULL OR r.distance_km <= v_radius_km
  ORDER BY
    CASE WHEN r.name ILIKE v_query || '%' THEN 1 ELSE 0 END DESC,
    r.distance_km ASC NULLS LAST,
    r.total_views DESC,
    r.name ASC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_venues(text, double precision, double precision, double precision)
  TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_feed_cards(double precision, double precision);
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
LANGUAGE plpgsql STABLE
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
      v.status,
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
    WHERE lower(COALESCE(v.status, 'active')) NOT IN ('off', 'inactive', 'disabled', 'deleted')
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
      ELSE st_distance(
        st_setsrid(st_makepoint(c.longitude, c.latitude), 4326)::geography,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      ) / 1000.0
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
  WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
  ORDER BY
    CASE WHEN c.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN c.boost_active THEN 1 ELSE 0 END DESC,
    distance_km ASC NULLS LAST,
    c.total_views DESC,
    c.name ASC
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_cards(double precision, double precision)
  TO anon, authenticated, service_role;

COMMIT;
