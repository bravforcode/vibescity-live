-- Purpose: Canonical hardened SQL Editor runlist for Supabase production schema normalization and security hardening.
-- Safety: idempotent, SQL Editor safe, forward-fix only, deterministic ordering.
-- Affected objects: public.venues, public.orders, public.order_items, public.enrichment_queue,
--                   public.entitlements_ledger, public.shops (view), core RPCs, RLS policies,
--                   optional cron jobs.
-- Risks (tier): High (RLS/function behavior), Medium (type normalization/index build), Low (optional cron notices).
-- Rollback plan:
--   1) Restore schema/policy/function snapshot from Supabase backup/export.
--   2) Forward-fix object-level regressions (functions/policies/indexes) without destructive drops.
--   3) Unschedule cron jobs by jobname if needed.

-- =============================================================================
-- 0) PRE-FLIGHT (Current Production Baseline Guard)
-- =============================================================================
DO $$
DECLARE
  v_required_tables text[] := ARRAY[
    'venues',
    'buildings',
    'orders',
    'order_items',
    'enrichment_queue',
    'entitlements_ledger',
    'subscriptions',
    'notifications',
    'slip_audit',
    'slip_health_checks',
    'audit_log'
  ];
  v_table text;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_table IN ARRAY v_required_tables LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      v_missing := array_append(v_missing, v_table);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight failed: missing required tables in public schema: %',
      array_to_string(v_missing, ', ');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'shops'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: public.shops is a TABLE/PARTITIONED TABLE. Migrate/rename it before this runlist because shops must be a compatibility VIEW over venues.';
  END IF;
END
$$;

-- =============================================================================
-- 1) EXTENSIONS (postgis required, pg_cron/pg_net optional)
-- =============================================================================
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS postgis;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'postgis extension is required, but this role cannot create it. Enable postgis in Supabase Dashboard > Database > Extensions.';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'postgis extension setup failed: %', SQLERRM;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'postgis'
  ) THEN
    RAISE EXCEPTION 'postgis extension is required for geography/ST_* operations but is not installed.';
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    CREATE SCHEMA IF NOT EXISTS extensions;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'extensions schema creation skipped: %', SQLERRM;
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron not available in this project (optional): %', SQLERRM;
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_net not available in this project (optional): %', SQLERRM;
  END;
END
$$;

-- =============================================================================
-- 2) TYPE NORMALIZATION
-- =============================================================================
DO $$
BEGIN
  CREATE TYPE pin_type_enum AS ENUM ('normal', 'giant');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
DECLARE
  v_pin_udt_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'pin_type'
  ) THEN
    ALTER TABLE public.venues
      ADD COLUMN pin_type pin_type_enum NOT NULL DEFAULT 'normal';
  ELSE
    SELECT c.udt_name
    INTO v_pin_udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'venues'
      AND c.column_name = 'pin_type';

    IF v_pin_udt_name <> 'pin_type_enum' THEN
      UPDATE public.venues
      SET pin_type = CASE
        WHEN lower(pin_type::text) = 'standard' THEN 'normal'
        WHEN lower(pin_type::text) IN ('normal', 'giant') THEN lower(pin_type::text)
        ELSE 'normal'
      END
      WHERE pin_type IS NOT NULL;

      ALTER TABLE public.venues
        ALTER COLUMN pin_type DROP DEFAULT;

      ALTER TABLE public.venues
        ALTER COLUMN pin_type TYPE pin_type_enum
        USING CASE
          WHEN pin_type IS NULL THEN 'normal'::pin_type_enum
          WHEN lower(pin_type::text) = 'standard' THEN 'normal'::pin_type_enum
          WHEN lower(pin_type::text) IN ('normal', 'giant') THEN lower(pin_type::text)::pin_type_enum
          ELSE 'normal'::pin_type_enum
        END;
    END IF;

    ALTER TABLE public.venues
      ALTER COLUMN pin_type SET DEFAULT 'normal'::pin_type_enum;

    UPDATE public.venues
    SET pin_type = 'normal'::pin_type_enum
    WHERE pin_type IS NULL;

    ALTER TABLE public.venues
      ALTER COLUMN pin_type SET NOT NULL;
  END IF;
END
$$;

-- =============================================================================
-- 3) SCHEMA NORMALIZATION
-- =============================================================================
-- 3.1 venues core columns
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS pin_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_until timestamptz,
  ADD COLUMN IF NOT EXISTS glow_until timestamptz,
  ADD COLUMN IF NOT EXISTS boost_until timestamptz,
  ADD COLUMN IF NOT EXISTS giant_until timestamptz,
  ADD COLUMN IF NOT EXISTS visibility_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'OFF',
  ADD COLUMN IF NOT EXISTS total_views integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_visitor_id text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS opening_hours text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS building_id text,
  ADD COLUMN IF NOT EXISTS floor text,
  ADD COLUMN IF NOT EXISTS "Image_URL1" text,
  ADD COLUMN IF NOT EXISTS "Image_URL2" text,
  ADD COLUMN IF NOT EXISTS "Image_URL3" text,
  ADD COLUMN IF NOT EXISTS "Video_URL" text;

-- 3.2 venues.location geography normalization
DO $$
DECLARE
  v_loc_udt_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venues'
      AND column_name = 'location'
  ) THEN
    ALTER TABLE public.venues
      ADD COLUMN location geography(Point, 4326);
  ELSE
    SELECT c.udt_name
    INTO v_loc_udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'venues'
      AND c.column_name = 'location';

    IF v_loc_udt_name <> 'geography' THEN
      ALTER TABLE public.venues
        ALTER COLUMN location TYPE geography(Point, 4326)
        USING CASE
          WHEN latitude IS NOT NULL
           AND longitude IS NOT NULL
           AND latitude BETWEEN -90 AND 90
           AND longitude BETWEEN -180 AND 180
            THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
          ELSE NULL
        END;
    END IF;
  END IF;

  UPDATE public.venues
  SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  WHERE location IS NULL
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND latitude BETWEEN -90 AND 90
    AND longitude BETWEEN -180 AND 180;
END
$$;

-- 3.3 media canonicalization (image_urls is canonical)
UPDATE public.venues
SET image_urls = images
WHERE (image_urls IS NULL OR array_length(image_urls, 1) IS NULL)
  AND images IS NOT NULL
  AND array_length(images, 1) IS NOT NULL;

UPDATE public.venues
SET images = image_urls
WHERE (images IS NULL OR array_length(images, 1) IS NULL)
  AND image_urls IS NOT NULL
  AND array_length(image_urls, 1) IS NOT NULL;

-- 3.4 building_id normalization to text + FK to buildings(id)
DO $$
DECLARE
  v_venues_building_type text;
  v_buildings_id_type text;
  v_constraint record;
BEGIN
  SELECT c.data_type
  INTO v_buildings_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'buildings'
    AND c.column_name = 'id';

  IF v_buildings_id_type IN ('text', 'character varying') THEN
    SELECT c.data_type
    INTO v_venues_building_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'venues'
      AND c.column_name = 'building_id';

    IF v_venues_building_type IS NULL THEN
      ALTER TABLE public.venues ADD COLUMN building_id text;
    ELSIF v_venues_building_type NOT IN ('text', 'character varying') THEN
      ALTER TABLE public.venues
        ALTER COLUMN building_id TYPE text
        USING CASE
          WHEN building_id IS NULL THEN NULL
          ELSE building_id::text
        END;
    END IF;

    FOR v_constraint IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) AS ck(attnum) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ck.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'venues'
        AND con.contype = 'f'
        AND att.attname = 'building_id'
    LOOP
      EXECUTE format('ALTER TABLE public.venues DROP CONSTRAINT %I', v_constraint.conname);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'venues_building_id_fkey'
        AND conrelid = 'public.venues'::regclass
    ) THEN
      ALTER TABLE public.venues
        ADD CONSTRAINT venues_building_id_fkey
        FOREIGN KEY (building_id) REFERENCES public.buildings(id) ON DELETE SET NULL;
    END IF;
  ELSE
    RAISE NOTICE 'Skipping venues.building_id text normalization because public.buildings.id is type %', COALESCE(v_buildings_id_type, 'NULL');
  END IF;
END
$$;

-- 3.5 orders normalization (venue_id/shop_id UUID, visitor_id TEXT)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS venue_id uuid,
  ADD COLUMN IF NOT EXISTS shop_id uuid,
  ADD COLUMN IF NOT EXISTS visitor_id text;

DO $$
DECLARE
  v_data_type text;
  v_constraint record;
BEGIN
  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'venue_id';

  IF v_data_type IS NOT NULL AND v_data_type <> 'uuid' THEN
    FOR v_constraint IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) AS ck(attnum) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ck.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'orders'
        AND con.contype = 'f'
        AND att.attname = 'venue_id'
    LOOP
      EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', v_constraint.conname);
    END LOOP;

    ALTER TABLE public.orders
      ALTER COLUMN venue_id TYPE uuid
      USING CASE
        WHEN venue_id IS NULL THEN NULL
        WHEN venue_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN venue_id::text::uuid
        ELSE NULL
      END;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_venue_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
DECLARE
  v_data_type text;
  v_constraint record;
BEGIN
  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'shop_id';

  IF v_data_type IS NOT NULL AND v_data_type <> 'uuid' THEN
    FOR v_constraint IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) AS ck(attnum) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ck.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'orders'
        AND con.contype = 'f'
        AND att.attname = 'shop_id'
    LOOP
      EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', v_constraint.conname);
    END LOOP;

    ALTER TABLE public.orders
      ALTER COLUMN shop_id TYPE uuid
      USING CASE
        WHEN shop_id IS NULL THEN NULL
        WHEN shop_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN shop_id::text::uuid
        ELSE NULL
      END;
  END IF;
END
$$;

-- 3.6 enrichment_queue normalization (venue_id UUID)
ALTER TABLE public.enrichment_queue
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
DECLARE
  v_data_type text;
  v_constraint record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'enrichment_queue'
      AND column_name = 'venue_id'
  ) THEN
    ALTER TABLE public.enrichment_queue
      ADD COLUMN venue_id uuid;
  END IF;

  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'enrichment_queue'
    AND c.column_name = 'venue_id';

  IF v_data_type IS NOT NULL AND v_data_type <> 'uuid' THEN
    FOR v_constraint IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) AS ck(attnum) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ck.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'enrichment_queue'
        AND con.contype = 'f'
        AND att.attname = 'venue_id'
    LOOP
      EXECUTE format('ALTER TABLE public.enrichment_queue DROP CONSTRAINT %I', v_constraint.conname);
    END LOOP;

    ALTER TABLE public.enrichment_queue
      ALTER COLUMN venue_id TYPE uuid
      USING CASE
        WHEN venue_id IS NULL THEN NULL
        WHEN venue_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN venue_id::text::uuid
        ELSE NULL
      END;
  END IF;

  DELETE FROM public.enrichment_queue eq
  USING public.enrichment_queue newer
  WHERE eq.venue_id IS NOT NULL
    AND eq.venue_id = newer.venue_id
    AND eq.id < newer.id;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'enrichment_queue_venue_id_fkey'
      AND conrelid = 'public.enrichment_queue'::regclass
  ) THEN
    ALTER TABLE public.enrichment_queue
      ADD CONSTRAINT enrichment_queue_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS enrichment_queue_venue_id_uq
  ON public.enrichment_queue(venue_id);

-- 3.7 entitlements_ledger quantity normalization
ALTER TABLE public.entitlements_ledger
  ADD COLUMN IF NOT EXISTS quantity integer;

UPDATE public.entitlements_ledger
SET quantity = 1
WHERE quantity IS NULL OR quantity < 1;

ALTER TABLE public.entitlements_ledger
  ALTER COLUMN quantity SET DEFAULT 1;

-- =============================================================================
-- 4) SHOPS COMPATIBILITY VIEW (venues is source of truth)
-- =============================================================================
DROP VIEW IF EXISTS public.shops;

CREATE VIEW public.shops AS
SELECT
  v.id,
  v.name,
  v.category,
  v.description,
  v.latitude,
  v.longitude,
  v.location,
  v.province,
  v.region,
  v.status,
  v.owner_id,
  v.owner_visitor_id,
  v.building_id,
  v.floor,
  v."Image_URL1",
  v."Image_URL2",
  v."Image_URL3",
  v."Video_URL",
  v.image_urls,
  v.images,
  v.phone,
  v.website,
  v.opening_hours,
  v.pin_type,
  v.pin_metadata,
  v.is_verified,
  v.verified_until,
  v.glow_until,
  v.boost_until,
  v.giant_until,
  v.visibility_score,
  v.total_views,
  v.total_clicks,
  v.created_at,
  v.updated_at,
  v.osm_id,
  v.osm_type,
  v.source
FROM public.venues v;

ALTER VIEW public.shops SET (security_invoker = true, security_barrier = true);
COMMENT ON VIEW public.shops IS 'Legacy compatibility view over public.venues. public.venues is canonical source of truth.';

GRANT SELECT ON public.shops TO anon, authenticated;
GRANT ALL ON public.shops TO service_role;

-- =============================================================================
-- 5) INDEX STRATEGY (geography-consistent)
-- =============================================================================
CREATE INDEX IF NOT EXISTS venues_location_gix
  ON public.venues
  USING gist (location);

CREATE INDEX IF NOT EXISTS venues_latlng_geog_gix
  ON public.venues
  USING gist ((ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS venues_owner_id_idx
  ON public.venues(owner_id);

CREATE INDEX IF NOT EXISTS venues_status_idx
  ON public.venues(status);

CREATE INDEX IF NOT EXISTS venues_visibility_rank_idx
  ON public.venues(visibility_score DESC, boost_until DESC NULLS LAST, giant_until DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS orders_user_id_idx
  ON public.orders(user_id);

CREATE INDEX IF NOT EXISTS orders_visitor_id_idx
  ON public.orders(visitor_id);

CREATE INDEX IF NOT EXISTS orders_venue_id_idx
  ON public.orders(venue_id);

CREATE INDEX IF NOT EXISTS orders_shop_id_idx
  ON public.orders(shop_id);

CREATE INDEX IF NOT EXISTS enrichment_queue_status_idx
  ON public.enrichment_queue(status, priority_score DESC);

-- =============================================================================
-- 6) FUNCTION CANONICALIZATION
-- =============================================================================
-- 6.0 helper for visitor header parsing and validation
CREATE OR REPLACE FUNCTION public.current_visitor_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_headers_raw text;
  v_headers jsonb;
  v_value text;
BEGIN
  v_headers_raw := current_setting('request.headers', true);

  IF v_headers_raw IS NULL OR btrim(v_headers_raw) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_headers := v_headers_raw::jsonb;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;

  v_value := NULLIF(btrim(v_headers ->> 'vibe_visitor_id'), '');

  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  IF length(v_value) > 128 THEN
    RETURN NULL;
  END IF;

  IF v_value !~ '^[A-Za-z0-9._:-]+$' THEN
    RETURN NULL;
  END IF;

  RETURN v_value;
END;
$$;

-- 6.1 keep media aliases in sync
CREATE OR REPLACE FUNCTION public.sync_venue_images()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.image_urls IS NOT NULL THEN
    IF NEW.images IS DISTINCT FROM NEW.image_urls THEN
      NEW.images := NEW.image_urls;
    END IF;
  ELSIF NEW.images IS NOT NULL THEN
    NEW.image_urls := NEW.images;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_venue_images ON public.venues;
CREATE TRIGGER trg_sync_venue_images
BEFORE INSERT OR UPDATE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.sync_venue_images();

-- 6.2 remove legacy/overloaded function signatures
DROP FUNCTION IF EXISTS public.get_feed_cards_shops(double precision, double precision);
DROP FUNCTION IF EXISTS public.get_map_pins_shops(double precision, double precision, double precision, double precision, int);
DROP FUNCTION IF EXISTS public.get_feed_cards_venues(double precision, double precision);
DROP FUNCTION IF EXISTS public.get_map_pins_venues(double precision, double precision, double precision, double precision, int);
DROP FUNCTION IF EXISTS public.increment_venue_views(bigint);
DROP FUNCTION IF EXISTS public.request_enrichment_priority(bigint);
DROP FUNCTION IF EXISTS public.promote_to_giant(bigint, text, jsonb);
DROP FUNCTION IF EXISTS public.get_venue_stats(bigint);
DROP FUNCTION IF EXISTS public.update_venue_anonymous(bigint, text, jsonb);
DROP FUNCTION IF EXISTS public.claim_venue_anonymous(bigint, text);

-- 6.3 canonical RPCs
DROP FUNCTION IF EXISTS public.get_feed_cards(double precision, double precision);
CREATE FUNCTION public.get_feed_cards(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE (
  id text,
  name text,
  category text,
  distance_km double precision,
  pin_type pin_type_enum,
  pin_metadata jsonb,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  images text[],
  status text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH origin AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS geog
  )
  SELECT
    v.id::text AS id,
    v.name,
    v.category,
    ROUND(
      (
        ST_Distance(
          ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
          o.geog
        ) / 1000.0
      )::numeric,
      2
    )::double precision AS distance_km,
    CASE
      WHEN v.pin_type::text IN ('normal', 'giant') THEN v.pin_type::text::pin_type_enum
      ELSE 'normal'::pin_type_enum
    END AS pin_type,
    COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
    COALESCE(v.is_verified, false) AS is_verified,
    (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
    (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
    (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
    (v.giant_until IS NOT NULL AND v.giant_until > now()) AS giant_active,
    COALESCE(v.image_urls, v.images, '{}'::text[]) AS images,
    COALESCE(v.status, 'OFF') AS status
  FROM public.venues v
  CROSS JOIN origin o
  WHERE v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      o.geog,
      20000
    )
  ORDER BY
    ST_Distance(
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      o.geog
    ) ASC
  LIMIT 30;
$$;

DROP FUNCTION IF EXISTS public.get_map_pins(double precision, double precision, double precision, double precision, integer);
CREATE FUNCTION public.get_map_pins(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom integer
)
RETURNS TABLE (
  id text,
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
  giant_active boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH limits AS (
    SELECT CASE
      WHEN p_zoom < 13 THEN 120
      WHEN p_zoom < 15 THEN 320
      ELSE 1200
    END AS row_limit
  )
  SELECT
    v.id::text AS id,
    v.name,
    v.latitude::double precision AS lat,
    v.longitude::double precision AS lng,
    COALESCE(v.pin_type::text, 'normal') AS pin_type,
    COALESCE(v.pin_metadata, '{}'::jsonb) AS pin_metadata,
    COALESCE(v.visibility_score, 0) AS visibility_score,
    COALESCE(v.is_verified, false) AS is_verified,
    (v.verified_until IS NOT NULL AND v.verified_until > now()) AS verified_active,
    (v.glow_until IS NOT NULL AND v.glow_until > now()) AS glow_active,
    (v.boost_until IS NOT NULL AND v.boost_until > now()) AS boost_active,
    (v.giant_until IS NOT NULL AND v.giant_until > now()) AS giant_active
  FROM public.venues v
  WHERE v.latitude BETWEEN p_min_lat AND p_max_lat
    AND v.longitude BETWEEN p_min_lng AND p_max_lng
    AND (
      p_zoom >= 16
      OR v.pin_type = 'giant'
      OR (v.boost_until IS NOT NULL AND v.boost_until > now())
      OR (v.giant_until IS NOT NULL AND v.giant_until > now())
      OR (v.verified_until IS NOT NULL AND v.verified_until > now())
      OR COALESCE(v.visibility_score, 0) > 20
    )
  ORDER BY
    (
      COALESCE(v.visibility_score, 0)
      + CASE WHEN v.boost_until > now() THEN 100 ELSE 0 END
      + CASE WHEN v.giant_until > now() THEN 160 ELSE 0 END
      + CASE WHEN v.verified_until > now() THEN 20 ELSE 0 END
    ) DESC,
    v.updated_at DESC NULLS LAST
  LIMIT (SELECT row_limit FROM limits);
$$;

CREATE OR REPLACE FUNCTION public.promote_to_giant(
  p_shop_id uuid,
  p_giant_category text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.venues
  SET
    pin_type = 'giant'::pin_type_enum,
    pin_metadata = COALESCE(pin_metadata, '{}'::jsonb)
      || COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('giant_category', p_giant_category),
    giant_until = GREATEST(COALESCE(giant_until, now()), now()) + interval '30 days',
    updated_at = now()
  WHERE id = p_shop_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_venue_views(venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.venues
  SET
    total_views = COALESCE(total_views, 0) + 1,
    updated_at = now()
  WHERE id = venue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_enrichment_priority(p_venue_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.enrichment_queue (venue_id, priority_score, status, missing_fields, updated_at)
  VALUES (p_venue_id, 50, 'pending', ARRAY['images', 'video'], now())
  ON CONFLICT (venue_id) DO UPDATE
  SET priority_score = public.enrichment_queue.priority_score + 10,
      status = 'pending',
      updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.apply_entitlements(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item record;
  v_venue_id uuid;
  v_now timestamptz := now();
  v_qty integer;
  v_feature text;
  v_ends_at timestamptz;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_venue_id := v_order.venue_id;

  IF v_venue_id IS NULL
     AND v_order.shop_id IS NOT NULL
     AND v_order.shop_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    v_venue_id := v_order.shop_id::text::uuid;
  END IF;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'No venue resolved for order: %', p_order_id;
  END IF;

  FOR v_item IN
    SELECT sku, COALESCE(quantity, 1) AS quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    v_qty := GREATEST(COALESCE(v_item.quantity, 1), 1);
    v_feature := NULL;
    v_ends_at := NULL;

    IF v_item.sku IN ('verified_badge', 'verified_1y') THEN
      UPDATE public.venues
      SET
        is_verified = true,
        verified_until = GREATEST(COALESCE(verified_until, v_now), v_now) + (interval '1 year' * v_qty),
        updated_at = now()
      WHERE id = v_venue_id
      RETURNING verified_until INTO v_ends_at;

      v_feature := 'verified';

    ELSIF v_item.sku IN ('pin_glow_24h', 'glow_24h') THEN
      UPDATE public.venues
      SET
        pin_metadata = jsonb_set(COALESCE(pin_metadata, '{}'::jsonb), '{glow_color}', to_jsonb('#FFD700'::text), true),
        glow_until = GREATEST(COALESCE(glow_until, v_now), v_now) + (interval '24 hours' * v_qty),
        updated_at = now()
      WHERE id = v_venue_id
      RETURNING glow_until INTO v_ends_at;

      v_feature := 'glow';

    ELSIF v_item.sku IN ('boost_1w', 'scroll_boost_7d') THEN
      UPDATE public.venues
      SET
        visibility_score = COALESCE(visibility_score, 0) + (100 * v_qty),
        boost_until = GREATEST(COALESCE(boost_until, v_now), v_now) + (interval '7 days' * v_qty),
        updated_at = now()
      WHERE id = v_venue_id
      RETURNING boost_until INTO v_ends_at;

      v_feature := 'boost';

    ELSIF v_item.sku IN ('giant_monthly', 'giant_30d') THEN
      UPDATE public.venues
      SET
        pin_type = 'giant'::pin_type_enum,
        giant_until = GREATEST(COALESCE(giant_until, v_now), v_now) + (interval '30 days' * v_qty),
        updated_at = now()
      WHERE id = v_venue_id
      RETURNING giant_until INTO v_ends_at;

      v_feature := 'giant';
    END IF;

    IF v_feature IS NOT NULL THEN
      INSERT INTO public.entitlements_ledger (
        user_id,
        venue_id,
        order_id,
        feature,
        starts_at,
        ends_at,
        quantity
      )
      VALUES (
        v_order.user_id,
        v_venue_id,
        p_order_id,
        v_feature,
        v_now,
        v_ends_at,
        v_qty
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_entitlements()
RETURNS TABLE(updated_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified int := 0;
  v_glow int := 0;
  v_boost int := 0;
  v_giant int := 0;
BEGIN
  UPDATE public.venues
  SET
    is_verified = false,
    verified_until = NULL,
    updated_at = now()
  WHERE is_verified = true
    AND verified_until IS NOT NULL
    AND verified_until < now();
  GET DIAGNOSTICS v_verified = ROW_COUNT;

  UPDATE public.venues
  SET
    pin_metadata = COALESCE(pin_metadata, '{}'::jsonb) - 'glow_color',
    glow_until = NULL,
    updated_at = now()
  WHERE glow_until IS NOT NULL
    AND glow_until < now();
  GET DIAGNOSTICS v_glow = ROW_COUNT;

  UPDATE public.venues
  SET
    visibility_score = 0,
    boost_until = NULL,
    updated_at = now()
  WHERE boost_until IS NOT NULL
    AND boost_until < now();
  GET DIAGNOSTICS v_boost = ROW_COUNT;

  UPDATE public.venues
  SET
    pin_type = 'normal'::pin_type_enum,
    giant_until = NULL,
    updated_at = now()
  WHERE giant_until IS NOT NULL
    AND giant_until < now();
  GET DIAGNOSTICS v_giant = ROW_COUNT;

  RETURN QUERY
  SELECT COALESCE(v_verified, 0) + COALESCE(v_glow, 0) + COALESCE(v_boost, 0) + COALESCE(v_giant, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.run_easyslip_healthcheck()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_headers jsonb := '{}'::jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net extension not installed; skipping EasySlip healthcheck call.';
    RETURN;
  END IF;

  v_url := current_setting('app.ehc_url', true);
  v_secret := current_setting('app.ehc_secret', true);

  IF v_url IS NULL OR v_url = '' THEN
    RAISE NOTICE 'Healthcheck URL not configured (app.ehc_url); skipping.';
    RETURN;
  END IF;

  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    v_headers := jsonb_build_object('x-healthcheck-secret', v_secret);
  END IF;

  BEGIN
    EXECUTE format(
      'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
      v_url,
      v_headers::text,
      '{}'::text
    );
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      RAISE NOTICE 'net.http_post not available; skipping EasySlip healthcheck call.';
    WHEN OTHERS THEN
      RAISE NOTICE 'EasySlip healthcheck call failed: %', SQLERRM;
  END;
END;
$$;

-- =============================================================================
-- 7) SECURITY DEFINER HARDENING (REVOKE/GRANT)
-- =============================================================================
REVOKE ALL ON FUNCTION public.current_visitor_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_feed_cards(double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_venue_views(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_enrichment_priority(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_to_giant(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_entitlements(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_entitlements() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_easyslip_healthcheck() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_visitor_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_feed_cards(double precision, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_map_pins(double precision, double precision, double precision, double precision, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_venue_views(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_enrichment_priority(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_to_giant(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_entitlements(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_entitlements() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_easyslip_healthcheck() TO service_role;

-- =============================================================================
-- 8) RLS CONSOLIDATION (canonical policy set)
-- =============================================================================
DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT p.schemaname, p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = ANY (ARRAY[
        'venues',
        'orders',
        'order_items',
        'subscriptions',
        'notifications',
        'entitlements_ledger',
        'slip_audit',
        'slip_health_checks',
        'audit_log'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  END LOOP;
END
$$;

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slip_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slip_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- venues
DROP POLICY IF EXISTS venues_select_public ON public.venues;
CREATE POLICY venues_select_public
ON public.venues
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS venues_insert_authenticated ON public.venues;
CREATE POLICY venues_insert_authenticated
ON public.venues
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND (owner_id IS NULL OR owner_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS venues_update_owner ON public.venues;
CREATE POLICY venues_update_owner
ON public.venues
FOR UPDATE
TO authenticated
USING (owner_id = (SELECT auth.uid()))
WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS venues_service_all ON public.venues;
CREATE POLICY venues_service_all
ON public.venues
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- orders
DROP POLICY IF EXISTS orders_select_own ON public.orders;
CREATE POLICY orders_select_own
ON public.orders
FOR SELECT
TO anon, authenticated
USING (
  (user_id IS NOT NULL AND user_id = (SELECT auth.uid()))
  OR (visitor_id IS NOT NULL AND visitor_id = public.current_visitor_id())
);

DROP POLICY IF EXISTS orders_insert_own ON public.orders;
CREATE POLICY orders_insert_own
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = (SELECT auth.uid()))
  AND (
    visitor_id IS NULL
    OR visitor_id = public.current_visitor_id()
    OR (SELECT auth.uid()) IS NOT NULL
  )
);

DROP POLICY IF EXISTS orders_service_all ON public.orders;
CREATE POLICY orders_service_all
ON public.orders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- order_items
DROP POLICY IF EXISTS order_items_select_own ON public.order_items;
CREATE POLICY order_items_select_own
ON public.order_items
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        (o.user_id IS NOT NULL AND o.user_id = (SELECT auth.uid()))
        OR (o.visitor_id IS NOT NULL AND o.visitor_id = public.current_visitor_id())
      )
  )
);

DROP POLICY IF EXISTS order_items_service_all ON public.order_items;
CREATE POLICY order_items_service_all
ON public.order_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- subscriptions
DROP POLICY IF EXISTS subscriptions_select_owner ON public.subscriptions;
CREATE POLICY subscriptions_select_owner
ON public.subscriptions
FOR SELECT
TO anon, authenticated
USING (
  (user_id IS NOT NULL AND user_id = (SELECT auth.uid()))
  OR (visitor_id IS NOT NULL AND visitor_id = public.current_visitor_id())
);

DROP POLICY IF EXISTS subscriptions_service_all ON public.subscriptions;
CREATE POLICY subscriptions_service_all
ON public.subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- notifications
DROP POLICY IF EXISTS notifications_select_owner ON public.notifications;
CREATE POLICY notifications_select_owner
ON public.notifications
FOR SELECT
TO anon, authenticated
USING (
  (visitor_id IS NOT NULL AND visitor_id = public.current_visitor_id())
  OR EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.id = notifications.venue_id
      AND v.owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS notifications_update_owner ON public.notifications;
CREATE POLICY notifications_update_owner
ON public.notifications
FOR UPDATE
TO anon, authenticated
USING (
  (visitor_id IS NOT NULL AND visitor_id = public.current_visitor_id())
  OR EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.id = notifications.venue_id
      AND v.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  (visitor_id IS NOT NULL AND visitor_id = public.current_visitor_id())
  OR EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.id = notifications.venue_id
      AND v.owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS notifications_service_all ON public.notifications;
CREATE POLICY notifications_service_all
ON public.notifications
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- entitlements_ledger
DROP POLICY IF EXISTS entitlements_select_owner ON public.entitlements_ledger;
CREATE POLICY entitlements_select_owner
ON public.entitlements_ledger
FOR SELECT
TO authenticated
USING (
  (user_id IS NOT NULL AND user_id = (SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.id = entitlements_ledger.venue_id
      AND v.owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS entitlements_service_all ON public.entitlements_ledger;
CREATE POLICY entitlements_service_all
ON public.entitlements_ledger
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- slip_audit
DROP POLICY IF EXISTS slip_audit_service_only ON public.slip_audit;
CREATE POLICY slip_audit_service_only
ON public.slip_audit
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- slip_health_checks
DROP POLICY IF EXISTS slip_health_checks_service_only ON public.slip_health_checks;
CREATE POLICY slip_health_checks_service_only
ON public.slip_health_checks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- audit_log
DROP POLICY IF EXISTS audit_log_service_only ON public.audit_log;
CREATE POLICY audit_log_service_only
ON public.audit_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================================================
-- 9) OPTIONAL CRON SCHEDULING (guarded, no duplicate jobs)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN

    IF NOT EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'vibecity-expire-entitlements-hourly'
    ) THEN
      PERFORM cron.schedule(
        'vibecity-expire-entitlements-hourly',
        '0 * * * *',
        'SELECT public.expire_entitlements();'
      );
    END IF;

    IF to_regprocedure('public.refresh_map_pins_zoom_cache()') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM cron.job
         WHERE jobname = 'vibecity-map-pins-refresh-5m'
       ) THEN
      PERFORM cron.schedule(
        'vibecity-map-pins-refresh-5m',
        '*/5 * * * *',
        'SELECT public.refresh_map_pins_zoom_cache();'
      );
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
       AND NOT EXISTS (
         SELECT 1
         FROM cron.job
         WHERE jobname = 'vibecity-easyslip-healthcheck-15m'
       ) THEN
      PERFORM cron.schedule(
        'vibecity-easyslip-healthcheck-15m',
        '*/15 * * * *',
        'SELECT public.run_easyslip_healthcheck();'
      );
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron unavailable or cron schema missing; job scheduling skipped (functions remain available).';
  END IF;
END
$$;

-- =============================================================================
-- 10) VERIFICATION QUERIES (manual run after script; pass/fail checks)
-- =============================================================================
-- 10.1 pin_type must be enum
-- SELECT data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'pin_type';

-- 10.2 location must be geography
-- SELECT data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'location';

-- 10.3 building_id must be text-like and FK present
-- SELECT c.data_type, c.udt_name
-- FROM information_schema.columns c
-- WHERE c.table_schema='public' AND c.table_name='venues' AND c.column_name='building_id';
-- SELECT conname
-- FROM pg_constraint
-- WHERE conrelid='public.venues'::regclass
--   AND conname='venues_building_id_fkey';

-- 10.4 shops must be view
-- SELECT c.relkind
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname='public' AND c.relname='shops';

-- 10.5 SECURITY DEFINER search_path checks
-- SELECT n.nspname, p.proname, pg_get_functiondef(p.oid)
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public'
--   AND p.prosecdef = true
--   AND p.proname IN (
--     'increment_venue_views',
--     'request_enrichment_priority',
--     'promote_to_giant',
--     'apply_entitlements',
--     'expire_entitlements',
--     'run_easyslip_healthcheck'
--   );

-- 10.6 RLS policies are canonical (no duplicates)
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname='public'
--   AND tablename IN (
--     'venues','orders','order_items','subscriptions','notifications',
--     'entitlements_ledger','slip_audit','slip_health_checks','audit_log'
--   )
-- ORDER BY tablename, policyname;

-- 10.7 cron job uniqueness check
-- SELECT jobname, schedule, command
-- FROM cron.job
-- WHERE jobname IN (
--   'vibecity-expire-entitlements-hourly',
--   'vibecity-map-pins-refresh-5m',
--   'vibecity-easyslip-healthcheck-15m'
-- )
-- ORDER BY jobname;

-- 10.8 Idempotency rerun guidance
-- Re-run this entire file in SQL Editor; expected result: no errors.
