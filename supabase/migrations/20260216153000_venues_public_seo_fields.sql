-- Purpose: Upgrade public.venues_public for SEO consumers (sitemap/prerender/i18n)
-- Safety: idempotent; handles schema drift across environments
-- Notes:
--   - Never edits prior migrations
--   - Preserves security_invoker + security_barrier
--   - Adds SEO-friendly fields when available:
--       slug, short_code, opening_hours, phone, updated_at, created_at, name_en

BEGIN;

DO $$
DECLARE
  has_venues BOOLEAN;
  has_status BOOLEAN;
  has_slug BOOLEAN;
  has_short_code BOOLEAN;
  has_name_en BOOLEAN;
  has_description BOOLEAN;
  has_category BOOLEAN;
  has_location BOOLEAN;
  has_address BOOLEAN;
  has_province BOOLEAN;
  has_district BOOLEAN;
  has_image_urls BOOLEAN;
  has_video_url BOOLEAN;
  has_rating BOOLEAN;
  has_review_count BOOLEAN;
  has_pin_type BOOLEAN;
  has_pin_metadata BOOLEAN;
  has_visibility_score BOOLEAN;
  has_opening_hours BOOLEAN;
  has_phone BOOLEAN;
  has_building_id BOOLEAN;
  has_floor BOOLEAN;
  has_is_verified BOOLEAN;
  has_verified_until BOOLEAN;
  has_glow_until BOOLEAN;
  has_boost_until BOOLEAN;
  has_giant_until BOOLEAN;
  has_updated_at BOOLEAN;
  has_created_at BOOLEAN;
  sql_view TEXT;
  where_clause TEXT := '';
BEGIN
  SELECT to_regclass('public.venues') IS NOT NULL INTO has_venues;
  IF NOT has_venues THEN
    RAISE NOTICE 'public.venues does not exist; skipping venues_public upgrade';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status'
  ) INTO has_status;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'slug'
  ) INTO has_slug;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'short_code'
  ) INTO has_short_code;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'name_en'
  ) INTO has_name_en;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'description'
  ) INTO has_description;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category'
  ) INTO has_category;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'location'
  ) INTO has_location;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'address'
  ) INTO has_address;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'province'
  ) INTO has_province;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'district'
  ) INTO has_district;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'image_urls'
  ) INTO has_image_urls;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'video_url'
  ) INTO has_video_url;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'rating'
  ) INTO has_rating;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'review_count'
  ) INTO has_review_count;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'pin_type'
  ) INTO has_pin_type;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'pin_metadata'
  ) INTO has_pin_metadata;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'visibility_score'
  ) INTO has_visibility_score;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'opening_hours'
  ) INTO has_opening_hours;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'phone'
  ) INTO has_phone;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'building_id'
  ) INTO has_building_id;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'floor'
  ) INTO has_floor;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'is_verified'
  ) INTO has_is_verified;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'verified_until'
  ) INTO has_verified_until;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'glow_until'
  ) INTO has_glow_until;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'boost_until'
  ) INTO has_boost_until;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'giant_until'
  ) INTO has_giant_until;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'updated_at'
  ) INTO has_updated_at;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'created_at'
  ) INTO has_created_at;

  IF has_status THEN
    where_clause := ' WHERE COALESCE(v.status, ''active'') <> ''OFF''';
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
    CASE
      WHEN has_glow_until THEN ', (v.glow_until IS NOT NULL AND v.glow_until > NOW()) AS glow_active'
      ELSE ', FALSE AS glow_active'
    END ||
    CASE
      WHEN has_boost_until THEN ', (v.boost_until IS NOT NULL AND v.boost_until > NOW()) AS boost_active'
      ELSE ', FALSE AS boost_active'
    END ||
    CASE
      WHEN has_giant_until THEN ', (v.giant_until IS NOT NULL AND v.giant_until > NOW()) AS giant_active'
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

  -- Drop existing view if it exists (to allow column reordering)
  DROP VIEW IF EXISTS public.venues_public CASCADE;

  EXECUTE sql_view;
  EXECUTE 'ALTER VIEW public.venues_public SET (security_invoker = true, security_barrier = true)';
END $$;

COMMIT;
