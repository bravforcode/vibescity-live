-- =============================================================================
-- Ultrathink schema optimization part 3C (idempotent)
-- Phase B split: venues_public + feed/map RPCs
-- Source: 20260224202000_ultrathink_schema_optimization_part3.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- E3: Update venues_public view to exclude deleted venues
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  has_status boolean := false;
  has_slug boolean := false;
  has_short_code boolean := false;
  has_name_en boolean := false;
  has_description boolean := false;
  has_category boolean := false;
  has_location boolean := false;
  has_address boolean := false;
  has_province boolean := false;
  has_district boolean := false;
  has_image_urls boolean := false;
  has_video_url boolean := false;
  has_rating boolean := false;
  has_review_count boolean := false;
  has_pin_type boolean := false;
  has_pin_metadata boolean := false;
  has_visibility_score boolean := false;
  has_opening_hours boolean := false;
  has_phone boolean := false;
  has_building_id boolean := false;
  has_floor boolean := false;
  has_is_verified boolean := false;
  has_verified_until boolean := false;
  has_glow_until boolean := false;
  has_boost_until boolean := false;
  has_giant_until boolean := false;
  has_updated_at boolean := false;
  has_created_at boolean := false;
  has_deleted_at boolean := false;
  status_udt text := NULL;
  where_clause text := '';
  sql_view text;
BEGIN
  IF to_regclass('public.venues') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status') INTO has_status;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'slug') INTO has_slug;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'short_code') INTO has_short_code;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'name_en') INTO has_name_en;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'description') INTO has_description;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category') INTO has_category;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'location') INTO has_location;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'address') INTO has_address;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'province') INTO has_province;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'district') INTO has_district;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'image_urls') INTO has_image_urls;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'video_url') INTO has_video_url;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'rating') INTO has_rating;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'review_count') INTO has_review_count;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'pin_type') INTO has_pin_type;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'pin_metadata') INTO has_pin_metadata;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'visibility_score') INTO has_visibility_score;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'opening_hours') INTO has_opening_hours;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'phone') INTO has_phone;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'building_id') INTO has_building_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'floor') INTO has_floor;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'is_verified') INTO has_is_verified;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'verified_until') INTO has_verified_until;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'glow_until') INTO has_glow_until;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'boost_until') INTO has_boost_until;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'giant_until') INTO has_giant_until;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'updated_at') INTO has_updated_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'created_at') INTO has_created_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'deleted_at') INTO has_deleted_at;

  IF has_status THEN
    SELECT c.udt_name INTO status_udt
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'venues'
      AND c.column_name = 'status';

    IF status_udt = 'venue_status' THEN
      where_clause := ' WHERE COALESCE(v.status, ''active''::venue_status) NOT IN (''off''::venue_status, ''inactive''::venue_status, ''disabled''::venue_status, ''deleted''::venue_status)';
    ELSE
      where_clause := ' WHERE lower(COALESCE(v.status::text, ''active'')) NOT IN (''off'', ''inactive'', ''disabled'', ''deleted'')';
    END IF;
  END IF;

  IF has_deleted_at THEN
    IF where_clause = '' THEN
      where_clause := ' WHERE v.deleted_at IS NULL';
    ELSE
      where_clause := where_clause || ' AND v.deleted_at IS NULL';
    END IF;
  END IF;

  sql_view := 'CREATE OR REPLACE VIEW public.venues_public AS
SELECT
  v.id' ||
    CASE WHEN has_slug THEN ', v.slug' ELSE ', NULL::text AS slug' END ||
    CASE WHEN has_short_code THEN ', v.short_code' ELSE ', NULL::text AS short_code' END ||
    ', v.name' ||
    CASE WHEN has_name_en THEN ', v.name_en' ELSE ', NULL::text AS name_en' END ||
    CASE WHEN has_description THEN ', v.description' ELSE ', NULL::text AS description' END ||
    CASE WHEN has_category THEN ', v.category' ELSE ', NULL::text AS category' END ||
    CASE WHEN has_location THEN ', v.location' ELSE ', NULL::text AS location' END ||
    CASE WHEN has_address THEN ', v.address' ELSE ', NULL::text AS address' END ||
    CASE WHEN has_province THEN ', v.province' ELSE ', NULL::text AS province' END ||
    CASE WHEN has_district THEN ', v.district' ELSE ', NULL::text AS district' END ||
    CASE WHEN has_image_urls THEN ', v.image_urls' ELSE ', NULL::text[] AS image_urls' END ||
    CASE WHEN has_video_url THEN ', v.video_url' ELSE ', NULL::text AS video_url' END ||
    CASE WHEN has_rating THEN ', v.rating' ELSE ', NULL::numeric AS rating' END ||
    CASE WHEN has_review_count THEN ', v.review_count' ELSE ', NULL::bigint AS review_count' END ||
    CASE WHEN has_pin_type THEN ', v.pin_type' ELSE ', NULL::text AS pin_type' END ||
    CASE WHEN has_pin_metadata THEN ', v.pin_metadata' ELSE ', NULL::jsonb AS pin_metadata' END ||
    CASE WHEN has_visibility_score THEN ', v.visibility_score' ELSE ', NULL::integer AS visibility_score' END ||
    CASE WHEN has_opening_hours THEN ', v.opening_hours' ELSE ', NULL::text AS opening_hours' END ||
    CASE WHEN has_phone THEN ', v.phone' ELSE ', NULL::text AS phone' END ||
    CASE WHEN has_building_id THEN ', v.building_id' ELSE ', NULL::text AS building_id' END ||
    CASE WHEN has_floor THEN ', v.floor' ELSE ', NULL::text AS floor' END ||
    CASE
      WHEN has_is_verified AND has_verified_until THEN ', (COALESCE(v.is_verified, FALSE) OR (v.verified_until IS NOT NULL AND v.verified_until > NOW())) AS verified_active'
      WHEN has_verified_until THEN ', (v.verified_until IS NOT NULL AND v.verified_until > NOW()) AS verified_active'
      WHEN has_is_verified THEN ', COALESCE(v.is_verified, FALSE) AS verified_active'
      ELSE ', FALSE AS verified_active'
    END ||
    CASE WHEN has_glow_until THEN ', (v.glow_until IS NOT NULL AND v.glow_until > NOW()) AS glow_active' ELSE ', FALSE AS glow_active' END ||
    CASE WHEN has_boost_until THEN ', (v.boost_until IS NOT NULL AND v.boost_until > NOW()) AS boost_active' ELSE ', FALSE AS boost_active' END ||
    CASE
      WHEN has_giant_until AND has_pin_type THEN ', ((v.giant_until IS NOT NULL AND v.giant_until > NOW()) OR lower(COALESCE(v.pin_type, '''')) = ''giant'') AS giant_active'
      WHEN has_giant_until THEN ', (v.giant_until IS NOT NULL AND v.giant_until > NOW()) AS giant_active'
      WHEN has_pin_type THEN ', (lower(COALESCE(v.pin_type, '''')) = ''giant'') AS giant_active'
      ELSE ', FALSE AS giant_active'
    END ||
    CASE WHEN has_verified_until THEN ', v.verified_until' ELSE ', NULL::timestamptz AS verified_until' END ||
    CASE WHEN has_glow_until THEN ', v.glow_until' ELSE ', NULL::timestamptz AS glow_until' END ||
    CASE WHEN has_boost_until THEN ', v.boost_until' ELSE ', NULL::timestamptz AS boost_until' END ||
    CASE WHEN has_giant_until THEN ', v.giant_until' ELSE ', NULL::timestamptz AS giant_until' END ||
    CASE WHEN has_updated_at THEN ', v.updated_at' ELSE ', NULL::timestamptz AS updated_at' END ||
    CASE WHEN has_created_at THEN ', v.created_at' ELSE ', NULL::timestamptz AS created_at' END ||
  '
FROM public.venues v' || where_clause;

  EXECUTE sql_view;
  BEGIN
    EXECUTE 'ALTER VIEW public.venues_public SET (security_invoker = true)';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
  BEGIN
    EXECUTE 'ALTER VIEW public.venues_public SET (security_barrier = true)';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
END $$;

-- -----------------------------------------------------------------------------
-- E3: get_feed_cards excludes deleted venues
-- -----------------------------------------------------------------------------
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
      ELSE round((ST_DistanceSphere(ST_MakePoint(p_lng, p_lat), ST_MakePoint(c.longitude, c.latitude)) / 1000)::numeric, 3)
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

GRANT EXECUTE ON FUNCTION public.get_feed_cards(double precision, double precision)
  TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- E3: get_map_pins excludes deleted venues
-- -----------------------------------------------------------------------------
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
SET statement_timeout = '4s'
AS $$
  WITH params AS (
    SELECT
      COALESCE(p_zoom, 15) AS zoom_level,
      ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326) AS bbox
  ),
  candidates AS (
    SELECT
      v.id,
      v.name,
      ST_Y(v.location::geometry) AS lat,
      ST_X(v.location::geometry) AS lng,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      COALESCE(v.visibility_score, 0) AS visibility_score,
      COALESCE(v.is_verified, false) AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type, '')) = 'giant') AS giant_active,
      COALESCE(v.image_urls[1], v."Image_URL1") AS cover_image
    FROM public.venues v
    CROSS JOIN params p
    WHERE v.location IS NOT NULL
      AND ST_Intersects(v.location::geometry, p.bbox)
      AND COALESCE(v.status, 'active'::venue_status) = 'active'::venue_status
      AND v.deleted_at IS NULL

    UNION ALL

    SELECT
      v.id,
      v.name,
      v.latitude AS lat,
      v.longitude AS lng,
      CASE WHEN lower(COALESCE(v.pin_type, '')) = 'giant' THEN 'giant' ELSE 'normal' END AS pin_type,
      COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
      COALESCE(v.visibility_score, 0) AS visibility_score,
      COALESCE(v.is_verified, false) AS is_verified,
      (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
      (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
      (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
      ((v.giant_until IS NOT NULL AND v.giant_until > now()) OR lower(COALESCE(v.pin_type, '')) = 'giant') AS giant_active,
      COALESCE(v.image_urls[1], v."Image_URL1") AS cover_image
    FROM public.venues v
    CROSS JOIN params p
    WHERE v.location IS NULL
      AND v.latitude IS NOT NULL
      AND v.longitude IS NOT NULL
      AND v.latitude BETWEEN p_min_lat AND p_max_lat
      AND v.longitude BETWEEN p_min_lng AND p_max_lng
      AND COALESCE(v.status, 'active'::venue_status) = 'active'::venue_status
      AND v.deleted_at IS NULL
  ),
  filtered AS (
    SELECT c.*, p.zoom_level
    FROM candidates c
    CROSS JOIN params p
    WHERE c.lat IS NOT NULL
      AND c.lng IS NOT NULL
      AND (
        (p.zoom_level < 13 AND c.giant_active)
        OR (p.zoom_level BETWEEN 13 AND 15 AND (c.giant_active OR c.boost_active OR c.visibility_score > 0))
        OR (p.zoom_level > 15)
      )
  )
  SELECT
    f.id,
    f.name,
    f.lat,
    f.lng,
    CASE WHEN f.giant_active THEN 'giant' ELSE f.pin_type END AS pin_type,
    f.pin_metadata,
    f.visibility_score,
    f.is_verified,
    f.verified_active,
    f.glow_active,
    f.boost_active,
    f.giant_active,
    f.cover_image
  FROM filtered f
  ORDER BY
    CASE WHEN f.zoom_level <= 15 AND f.giant_active THEN 1 ELSE 0 END DESC,
    CASE WHEN f.boost_active THEN 1 ELSE 0 END DESC,
    f.visibility_score DESC,
    f.name ASC
  LIMIT CASE
    WHEN (SELECT zoom_level FROM params) < 13 THEN 300
    WHEN (SELECT zoom_level FROM params) BETWEEN 13 AND 15 THEN 500
    ELSE 1000
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, int)
  TO anon, authenticated, service_role;
