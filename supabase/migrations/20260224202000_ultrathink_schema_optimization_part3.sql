-- =============================================================================
-- Ultrathink schema optimization part 3 (idempotent)
-- Phase B: enum usage + schema/view/policy/index changes
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ensure PostGIS is available before PostGIS-dependent SQL
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS postgis;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'postgis extension is required for this migration';
    END;
  END IF;
END $$;

BEGIN;

DO $$
DECLARE
  status_type text;
  policy_rec record;
  view_rec record;
  constraint_rec record;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._saved_dependent_views (
    view_schema text NOT NULL,
    view_name text NOT NULL,
    view_sql text NOT NULL,
    depth integer NOT NULL DEFAULT 0,
    PRIMARY KEY (view_schema, view_name)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._saved_dependent_view_grants (
    view_schema text NOT NULL,
    view_name text NOT NULL,
    grantee text NOT NULL,
    privilege_type text NOT NULL,
    is_grantable text NOT NULL,
    PRIMARY KEY (view_schema, view_name, grantee, privilege_type)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._saved_venues_policies (
    policy_name text PRIMARY KEY,
    permissive text NOT NULL,
    cmd text NOT NULL,
    roles text[] NOT NULL,
    qual text,
    with_check text
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._saved_orders_policies (
    policy_name text PRIMARY KEY,
    permissive text NOT NULL,
    cmd text NOT NULL,
    roles text[] NOT NULL,
    qual text,
    with_check text
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._saved_orders_status_indexes (
    index_schema text NOT NULL,
    index_name text NOT NULL,
    index_sql text NOT NULL,
    PRIMARY KEY (index_schema, index_name)
  ) ON COMMIT DROP;

  IF to_regclass('public.venues') IS NOT NULL THEN
    SELECT udt_name INTO status_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status';

    IF status_type IS NOT NULL THEN
      IF status_type <> 'venue_status' THEN
        IF status_type IN ('text', 'varchar', 'bpchar') THEN
          UPDATE public.venues
          SET status = CASE
            WHEN status IS NULL THEN 'active'
            WHEN btrim(status::text) = '' THEN 'active'
            WHEN lower(btrim(status::text)) = 'live' THEN 'active'
            WHEN lower(btrim(status::text)) IN ('active','pending','archived','draft','off','inactive','disabled','deleted') THEN lower(btrim(status::text))
            ELSE 'active'
          END
          WHERE status IS NULL
            OR btrim(status::text) = ''
            OR lower(btrim(status::text)) = 'live'
            OR lower(btrim(status::text)) NOT IN ('active','pending','archived','draft','off','inactive','disabled','deleted');
        END IF;

        INSERT INTO pg_temp._saved_venues_policies AS saved_policies (
          policy_name,
          permissive,
          cmd,
          roles,
          qual,
          with_check
        )
        SELECT
          p.policyname,
          p.permissive,
          p.cmd,
          COALESCE(p.roles::text[], ARRAY['public']),
          p.qual,
          p.with_check
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = 'venues'
        ON CONFLICT (policy_name) DO UPDATE
        SET
          permissive = EXCLUDED.permissive,
          cmd = EXCLUDED.cmd,
          roles = EXCLUDED.roles,
          qual = EXCLUDED.qual,
          with_check = EXCLUDED.with_check;

        FOR policy_rec IN
          SELECT policy_name
          FROM pg_temp._saved_venues_policies
          ORDER BY policy_name
        LOOP
          EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.venues',
            policy_rec.policy_name
          );
        END LOOP;

        INSERT INTO pg_temp._saved_dependent_views AS saved_views (
          view_schema,
          view_name,
          view_sql,
          depth
        )
        WITH RECURSIVE dep AS (
          SELECT
            c.oid AS view_oid,
            n.nspname AS view_schema,
            c.relname AS view_name,
            1 AS depth,
            ARRAY[c.oid] AS path
          FROM pg_depend d
          JOIN pg_rewrite r ON r.oid = d.objid
          JOIN pg_class c ON c.oid = r.ev_class
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE d.refobjid = 'public.venues'::regclass
            AND (
              d.refobjsubid = 0
              OR d.refobjsubid = (
                SELECT a.attnum
                FROM pg_attribute a
                WHERE a.attrelid = 'public.venues'::regclass
                  AND a.attname = 'status'
                  AND NOT a.attisdropped
              )
            )
            AND c.relkind = 'v'
            AND n.nspname = 'public'

          UNION ALL

          SELECT
            c2.oid AS view_oid,
            n2.nspname AS view_schema,
            c2.relname AS view_name,
            dep.depth + 1 AS depth,
            dep.path || c2.oid AS path
          FROM dep
          JOIN pg_depend d2 ON d2.refobjid = dep.view_oid
          JOIN pg_rewrite r2 ON r2.oid = d2.objid
          JOIN pg_class c2 ON c2.oid = r2.ev_class
          JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
          WHERE c2.relkind = 'v'
            AND n2.nspname = 'public'
            AND NOT c2.oid = ANY(dep.path)
        )
        SELECT
          dep.view_schema,
          dep.view_name,
          pg_get_viewdef(dep.view_oid, true) AS view_sql,
          max(dep.depth) AS depth
        FROM dep
        GROUP BY dep.view_schema, dep.view_name, dep.view_oid
        ON CONFLICT (view_schema, view_name) DO UPDATE
        SET
          view_sql = EXCLUDED.view_sql,
          depth = GREATEST(saved_views.depth, EXCLUDED.depth);

        INSERT INTO pg_temp._saved_dependent_view_grants (
          view_schema,
          view_name,
          grantee,
          privilege_type,
          is_grantable
        )
        SELECT
          g.table_schema,
          g.table_name,
          g.grantee,
          g.privilege_type,
          g.is_grantable
        FROM information_schema.role_table_grants g
        JOIN pg_temp._saved_dependent_views v
          ON v.view_schema = g.table_schema
         AND v.view_name = g.table_name
        ON CONFLICT (view_schema, view_name, grantee, privilege_type) DO UPDATE
        SET is_grantable = EXCLUDED.is_grantable;

        FOR view_rec IN
          SELECT view_schema, view_name
          FROM pg_temp._saved_dependent_views
          ORDER BY depth DESC, view_schema, view_name
        LOOP
          EXECUTE format('DROP VIEW IF EXISTS %I.%I', view_rec.view_schema, view_rec.view_name);
        END LOOP;

        FOR constraint_rec IN (
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          WHERE c.contype = 'c'
            AND c.conrelid = 'public.venues'::regclass
            AND a.attname = 'status'
        ) LOOP
          EXECUTE 'ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_rec.conname);
        END LOOP;

        ALTER TABLE public.venues
          DROP CONSTRAINT IF EXISTS venues_status_check;

        DROP INDEX IF EXISTS public.idx_venues_status_lower_map;
        DROP INDEX IF EXISTS public.idx_venues_owner_visitor_status;
        DROP INDEX IF EXISTS public.idx_venues_status_h3_cell;
        DROP INDEX IF EXISTS public.idx_venues_status_category_id;
        DROP INDEX IF EXISTS public.idx_venues_status_category;
        DROP INDEX IF EXISTS public.idx_venues_lat_lng_active;

        ALTER TABLE public.venues
          ALTER COLUMN status DROP DEFAULT;

        ALTER TABLE public.venues
          ALTER COLUMN status TYPE venue_status
          USING (
            CASE
              WHEN status IS NULL THEN 'active'::venue_status
              WHEN lower(btrim(status::text)) = 'live' THEN 'active'::venue_status
              WHEN lower(btrim(status::text)) IN ('active','pending','archived','draft','off','inactive','disabled','deleted')
                THEN lower(btrim(status::text))::venue_status
              ELSE 'active'::venue_status
            END
          );
      END IF;

      ALTER TABLE public.venues
        ALTER COLUMN status SET DEFAULT 'active'::venue_status;

      ALTER TABLE public.venues
        DROP CONSTRAINT IF EXISTS venues_status_check;
    END IF;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    SELECT udt_name INTO status_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status';

    IF status_type IS NOT NULL THEN
      IF status_type <> 'order_status' THEN
        INSERT INTO pg_temp._saved_orders_policies AS saved_policies (
          policy_name,
          permissive,
          cmd,
          roles,
          qual,
          with_check
        )
        SELECT
          p.policyname,
          p.permissive,
          p.cmd,
          COALESCE(p.roles::text[], ARRAY['public']),
          p.qual,
          p.with_check
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = 'orders'
        ON CONFLICT (policy_name) DO UPDATE
        SET
          permissive = EXCLUDED.permissive,
          cmd = EXCLUDED.cmd,
          roles = EXCLUDED.roles,
          qual = EXCLUDED.qual,
          with_check = EXCLUDED.with_check;

        FOR policy_rec IN
          SELECT policy_name
          FROM pg_temp._saved_orders_policies
          ORDER BY policy_name
        LOOP
          EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.orders',
            policy_rec.policy_name
          );
        END LOOP;

        INSERT INTO pg_temp._saved_orders_status_indexes AS saved_indexes (
          index_schema,
          index_name,
          index_sql
        )
        SELECT
          ns.nspname AS index_schema,
          idx.relname AS index_name,
          pg_get_indexdef(idx.oid) AS index_sql
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_namespace ns ON ns.oid = idx.relnamespace
        WHERE i.indrelid = 'public.orders'::regclass
          AND idx.relkind = 'i'
          AND ns.nspname = 'public'
          AND (
            EXISTS (
              SELECT 1
              FROM unnest(i.indkey::smallint[]) AS k(attnum)
              WHERE k.attnum = (
                SELECT a.attnum
                FROM pg_attribute a
                WHERE a.attrelid = 'public.orders'::regclass
                  AND a.attname = 'status'
                  AND NOT a.attisdropped
                LIMIT 1
              )
            )
            OR COALESCE(pg_get_expr(i.indpred, i.indrelid), '') ILIKE '%status%'
            OR COALESCE(pg_get_expr(i.indexprs, i.indrelid), '') ILIKE '%status%'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            WHERE c.conindid = idx.oid
          )
        ON CONFLICT (index_schema, index_name) DO UPDATE
        SET index_sql = EXCLUDED.index_sql;

        FOR view_rec IN
          SELECT index_schema, index_name
          FROM pg_temp._saved_orders_status_indexes
          ORDER BY index_schema, index_name
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I.%I', view_rec.index_schema, view_rec.index_name);
        END LOOP;

        -- Drop potentially blocking functions before changing order status
        DROP FUNCTION IF EXISTS public.get_partner_dashboard_metrics();
        DROP FUNCTION IF EXISTS public.get_feed_cards(double precision, double precision);
        DROP FUNCTION IF EXISTS public.get_feed_cards_v2(double precision, double precision, integer, integer);
        DROP FUNCTION IF EXISTS public.search_venues_v2(text, double precision, double precision, integer, integer);
        IF status_type IN ('text', 'varchar', 'bpchar') THEN
          UPDATE public.orders
          SET status = CASE
            WHEN status IS NULL THEN 'pending'
            WHEN btrim(status::text) = '' THEN 'pending'
            WHEN lower(btrim(status::text)) = 'canceled' THEN 'cancelled'
            WHEN lower(btrim(status::text)) IN ('pending','pending_review','verified','rejected','paid','failed','cancelled','refunded') THEN lower(btrim(status::text))
            ELSE 'pending'
          END
          WHERE status IS NULL
            OR btrim(status::text) = ''
            OR lower(btrim(status::text)) = 'canceled'
            OR lower(btrim(status::text)) NOT IN ('pending','pending_review','verified','rejected','paid','failed','cancelled','refunded');
        END IF;

        FOR constraint_rec IN (
          SELECT c.conname
          FROM pg_constraint c
          WHERE c.contype = 'c'
            AND c.conrelid = 'public.orders'::regclass
            AND (
              COALESCE(pg_get_constraintdef(c.oid), '') ILIKE '%status%'
              OR EXISTS (
                SELECT 1
                FROM unnest(COALESCE(c.conkey, ARRAY[]::smallint[])) AS ck(attnum)
                JOIN pg_attribute a
                  ON a.attrelid = c.conrelid
                 AND a.attnum = ck.attnum
                WHERE a.attname = 'status'
              )
            )
        ) LOOP
          EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_rec.conname);
        END LOOP;

        ALTER TABLE public.orders
          DROP CONSTRAINT IF EXISTS orders_status_check;

        ALTER TABLE public.orders
          ALTER COLUMN status DROP DEFAULT;

        ALTER TABLE public.orders
          ALTER COLUMN status TYPE order_status
          USING (
            CASE
              WHEN status IS NULL THEN 'pending'::order_status
              WHEN lower(btrim(status::text)) = 'canceled' THEN 'cancelled'::order_status
              WHEN lower(btrim(status::text)) IN ('pending','pending_review','verified','rejected','paid','failed','cancelled','refunded')
                THEN lower(btrim(status::text))::order_status
              ELSE 'pending'::order_status
            END
          );
      END IF;

      ALTER TABLE public.orders
        ALTER COLUMN status SET DEFAULT 'pending'::order_status;

      ALTER TABLE public.orders
        DROP CONSTRAINT IF EXISTS orders_status_check;
    END IF;
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    SELECT udt_name INTO status_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'status';

    IF status_type IS NOT NULL THEN
      IF status_type <> 'subscription_status' THEN
        IF status_type IN ('text', 'varchar', 'bpchar') THEN
          UPDATE public.subscriptions
          SET status = CASE
            WHEN status IS NULL THEN 'active'
            WHEN btrim(status::text) = '' THEN 'active'
            WHEN lower(btrim(status::text)) = 'canceled' THEN 'cancelled'
            WHEN lower(btrim(status::text)) IN ('active','paused','cancelled','expired','trialing') THEN lower(btrim(status::text))
            ELSE 'active'
          END
          WHERE status IS NULL
            OR btrim(status::text) = ''
            OR lower(btrim(status::text)) = 'canceled'
            OR lower(btrim(status::text)) NOT IN ('active','paused','cancelled','expired','trialing');
        END IF;

        FOR constraint_rec IN (
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          WHERE c.contype = 'c'
            AND c.conrelid = 'public.subscriptions'::regclass
            AND a.attname = 'status'
        ) LOOP
          EXECUTE 'ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_rec.conname);
        END LOOP;

        ALTER TABLE public.subscriptions
          DROP CONSTRAINT IF EXISTS subscriptions_status_check;

        ALTER TABLE public.subscriptions
          ALTER COLUMN status DROP DEFAULT;

        ALTER TABLE public.subscriptions
          ALTER COLUMN status TYPE subscription_status
          USING (
            CASE
              WHEN status IS NULL THEN 'active'::subscription_status
              WHEN lower(btrim(status::text)) = 'canceled' THEN 'cancelled'::subscription_status
              WHEN lower(btrim(status::text)) IN ('active','paused','cancelled','expired','trialing')
                THEN lower(btrim(status::text))::subscription_status
              ELSE 'active'::subscription_status
            END
          );
      END IF;

      ALTER TABLE public.subscriptions
        ALTER COLUMN status SET DEFAULT 'active'::subscription_status;

      ALTER TABLE public.subscriptions
        DROP CONSTRAINT IF EXISTS subscriptions_status_check;
    END IF;
  END IF;

  IF to_regclass('public.partners') IS NOT NULL THEN
    SELECT udt_name INTO status_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'status';

    IF status_type IS NOT NULL THEN
      IF status_type <> 'partner_status' THEN
        IF status_type IN ('text', 'varchar', 'bpchar') THEN
          UPDATE public.partners
          SET status = CASE
            WHEN status IS NULL THEN 'active'
            WHEN btrim(status::text) = '' THEN 'active'
            WHEN lower(btrim(status::text)) IN ('active','inactive','blocked') THEN lower(btrim(status::text))
            ELSE 'active'
          END
          WHERE status IS NULL
            OR btrim(status::text) = ''
            OR lower(btrim(status::text)) NOT IN ('active','inactive','blocked');
        END IF;

        FOR constraint_rec IN (
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          WHERE c.contype = 'c'
            AND c.conrelid = 'public.partners'::regclass
            AND a.attname = 'status'
        ) LOOP
          EXECUTE 'ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_rec.conname);
        END LOOP;

        ALTER TABLE public.partners
          DROP CONSTRAINT IF EXISTS partners_status_check;

        ALTER TABLE public.partners
          ALTER COLUMN status DROP DEFAULT;

        ALTER TABLE public.partners
          ALTER COLUMN status TYPE partner_status
          USING (
            CASE
              WHEN status IS NULL THEN 'active'::partner_status
              WHEN lower(btrim(status::text)) IN ('active','inactive','blocked') THEN lower(btrim(status::text))::partner_status
              ELSE 'active'::partner_status
            END
          );
      END IF;

      ALTER TABLE public.partners
        ALTER COLUMN status SET DEFAULT 'active'::partner_status;

      ALTER TABLE public.partners
        DROP CONSTRAINT IF EXISTS partners_status_check;
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.3: visitor_id UUID sync trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_visitor_id_uuid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  uuid_regex constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF NEW.visitor_id_uuid IS NULL
     AND NEW.visitor_id IS NOT NULL
     AND NEW.visitor_id::text ~* uuid_regex THEN
    NEW.visitor_id_uuid := NEW.visitor_id::uuid;
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS visitor_id_uuid uuid;
  END IF;
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions
      ADD COLUMN IF NOT EXISTS visitor_id_uuid uuid;
  END IF;
  IF to_regclass('public.orders') IS NOT NULL
     AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'visitor_id'
    ) THEN
    UPDATE public.orders
    SET visitor_id_uuid = visitor_id::uuid
    WHERE visitor_id_uuid IS NULL
      AND visitor_id IS NOT NULL
      AND visitor_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  END IF;
  IF to_regclass('public.subscriptions') IS NOT NULL
     AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'visitor_id'
    ) THEN
    UPDATE public.subscriptions
    SET visitor_id_uuid = visitor_id::uuid
    WHERE visitor_id_uuid IS NULL
      AND visitor_id IS NOT NULL
      AND visitor_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  END IF;

  IF to_regclass('public.orders') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_orders_sync_visitor_id_uuid'
        AND tgrelid = 'public.orders'::regclass
    ) THEN
    CREATE TRIGGER trg_orders_sync_visitor_id_uuid
      BEFORE INSERT OR UPDATE OF visitor_id, visitor_id_uuid ON public.orders
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_visitor_id_uuid();
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_subscriptions_sync_visitor_id_uuid'
        AND tgrelid = 'public.subscriptions'::regclass
    ) THEN
    CREATE TRIGGER trg_subscriptions_sync_visitor_id_uuid
      BEFORE INSERT OR UPDATE OF visitor_id, visitor_id_uuid ON public.subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_visitor_id_uuid();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.partners') IS NOT NULL
     AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'visitor_id'
    ) THEN
    CREATE INDEX IF NOT EXISTS idx_partners_visitor_id
      ON public.partners (visitor_id);
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_orders_visitor_id_uuid
      ON public.orders (visitor_id_uuid);
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_subscriptions_visitor_id_uuid
      ON public.subscriptions (visitor_id_uuid);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.4: venues location/lat/lng sync
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_venue_location_latlng()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.location IS NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
      NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    ELSIF NEW.location IS NOT NULL THEN
      NEW.latitude := COALESCE(NEW.latitude, ST_Y(NEW.location::geometry));
      NEW.longitude := COALESCE(NEW.longitude, ST_X(NEW.location::geometry));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.location IS DISTINCT FROM OLD.location AND NEW.location IS NOT NULL THEN
    NEW.latitude := ST_Y(NEW.location::geometry);
    NEW.longitude := ST_X(NEW.location::geometry);
  ELSIF (NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude)
        AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_sync_venue_location_latlng'
        AND tgrelid = 'public.venues'::regclass
    ) THEN
    CREATE TRIGGER trg_sync_venue_location_latlng
      BEFORE INSERT OR UPDATE ON public.venues
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_venue_location_latlng();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.4: venues image_urls <-> Image_URL1 sync
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_venue_images_primary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.image_urls IS NOT NULL AND array_length(NEW.image_urls, 1) > 0 THEN
    NEW."Image_URL1" := NEW.image_urls[1];
  ELSIF NEW."Image_URL1" IS NOT NULL THEN
    NEW.image_urls := ARRAY[NEW."Image_URL1"];
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_sync_venue_images_primary'
        AND tgrelid = 'public.venues'::regclass
    ) THEN
    CREATE TRIGGER trg_sync_venue_images_primary
      BEFORE INSERT OR UPDATE OF image_urls, "Image_URL1" ON public.venues
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_venue_images_primary();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.4: partner_payouts net_amount_thb backfill
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.partner_payouts') IS NOT NULL
     AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'partner_payouts' AND column_name = 'net_amount_thb'
    )
     AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'partner_payouts' AND column_name = 'amount'
    ) THEN
    UPDATE public.partner_payouts
    SET net_amount_thb = amount
    WHERE net_amount_thb IS NULL;
  END IF;
END $$;

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

DO $$
DECLARE
  rec record;
  role_list text;
  qual_expr text;
  with_check_expr text;
  qual_sql text;
  with_check_sql text;
BEGIN
  IF to_regclass('pg_temp._saved_venues_policies') IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT *
    FROM pg_temp._saved_venues_policies
    ORDER BY policy_name
  LOOP
    SELECT string_agg(
      CASE
        WHEN r = 'public' THEN 'PUBLIC'
        ELSE format('%I', r)
      END,
      ', '
    )
    INTO role_list
    FROM unnest(COALESCE(rec.roles, ARRAY['public'])) AS r;

    qual_expr := COALESCE(rec.qual, '');
    with_check_expr := COALESCE(rec.with_check, '');

    qual_expr := regexp_replace(qual_expr, '''live''', '''active''', 'gi');
    qual_expr := regexp_replace(qual_expr, '''off''', '''off''', 'gi');
    qual_expr := regexp_replace(qual_expr, '''inactive''', '''inactive''', 'gi');
    qual_expr := regexp_replace(qual_expr, '''disabled''', '''disabled''', 'gi');
    qual_expr := regexp_replace(qual_expr, '''deleted''', '''deleted''', 'gi');

    with_check_expr := regexp_replace(with_check_expr, '''live''', '''active''', 'gi');
    with_check_expr := regexp_replace(with_check_expr, '''off''', '''off''', 'gi');
    with_check_expr := regexp_replace(with_check_expr, '''inactive''', '''inactive''', 'gi');
    with_check_expr := regexp_replace(with_check_expr, '''disabled''', '''disabled''', 'gi');
    with_check_expr := regexp_replace(with_check_expr, '''deleted''', '''deleted''', 'gi');

    -- Cast venue_status enum column to text so saved text-comparison policies can be recreated
    qual_expr      := regexp_replace(qual_expr,      '\ystatus\y([^:])', 'status::text\1', 'g');
    with_check_expr := regexp_replace(with_check_expr, '\ystatus\y([^:])', 'status::text\1', 'g');

    qual_sql := CASE
      WHEN btrim(qual_expr) <> '' THEN format(' USING (%s)', qual_expr)
      ELSE ''
    END;

    with_check_sql := CASE
      WHEN btrim(with_check_expr) <> '' THEN format(' WITH CHECK (%s)', with_check_expr)
      ELSE ''
    END;

    EXECUTE format(
      'CREATE POLICY %I ON public.venues AS %s FOR %s TO %s%s%s',
      rec.policy_name,
      rec.permissive,
      rec.cmd,
      COALESCE(role_list, 'PUBLIC'),
      qual_sql,
      with_check_sql
    );
  END LOOP;
END $$;

DO $$
DECLARE
  rec record;
  role_list text;
  qual_expr text;
  with_check_expr text;
  qual_sql text;
  with_check_sql text;
BEGIN
  IF to_regclass('pg_temp._saved_orders_policies') IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT *
    FROM pg_temp._saved_orders_policies
    ORDER BY policy_name
  LOOP
    SELECT string_agg(
      CASE
        WHEN r = 'public' THEN 'PUBLIC'
        ELSE format('%I', r)
      END,
      ', '
    )
    INTO role_list
    FROM unnest(COALESCE(rec.roles, ARRAY['public'])) AS r;

    qual_expr := COALESCE(rec.qual, '');
    with_check_expr := COALESCE(rec.with_check, '');

    qual_expr := regexp_replace(qual_expr, '''canceled''', '''cancelled''', 'gi');
    with_check_expr := regexp_replace(with_check_expr, '''canceled''', '''cancelled''', 'gi');

    qual_expr := regexp_replace(
      qual_expr,
      '''(pending|pending_review|verified|rejected|paid|failed|cancelled|refunded)''::(text|character varying|varchar)',
      '''\1''::order_status',
      'gi'
    );
    with_check_expr := regexp_replace(
      with_check_expr,
      '''(pending|pending_review|verified|rejected|paid|failed|cancelled|refunded)''::(text|character varying|varchar)',
      '''\1''::order_status',
      'gi'
    );

    -- Cast order_status enum column to text so saved text-comparison policies can be recreated
    qual_expr      := regexp_replace(qual_expr,      '\ystatus\y([^:])', 'status::text\1', 'g');
    with_check_expr := regexp_replace(with_check_expr, '\ystatus\y([^:])', 'status::text\1', 'g');

    qual_sql := CASE
      WHEN btrim(qual_expr) <> '' THEN format(' USING (%s)', qual_expr)
      ELSE ''
    END;

    with_check_sql := CASE
      WHEN btrim(with_check_expr) <> '' THEN format(' WITH CHECK (%s)', with_check_expr)
      ELSE ''
    END;

    EXECUTE format(
      'CREATE POLICY %I ON public.orders AS %s FOR %s TO %s%s%s',
      rec.policy_name,
      rec.permissive,
      rec.cmd,
      COALESCE(role_list, 'PUBLIC'),
      qual_sql,
      with_check_sql
    );
  END LOOP;
END $$;

DO $$
DECLARE
  rec record;
  index_sql text;
BEGIN
  IF to_regclass('pg_temp._saved_orders_status_indexes') IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT t.index_sql
    FROM pg_temp._saved_orders_status_indexes t
    ORDER BY index_schema, index_name
  LOOP
    index_sql := rec.index_sql;
    index_sql := regexp_replace(index_sql, '''canceled''', '''cancelled''', 'gi');
    index_sql := regexp_replace(
      index_sql,
      '''(pending|pending_review|verified|rejected|paid|failed|cancelled|refunded)''::(text|character varying|varchar)',
      '''\1''::order_status',
      'gi'
    );
    EXECUTE index_sql;
  END LOOP;
END $$;

DO $$
DECLARE
  rec record;
  grant_rec record;
BEGIN
  IF to_regclass('pg_temp._saved_dependent_views') IS NOT NULL THEN
    FOR rec IN
      SELECT view_schema, view_name, view_sql
      FROM pg_temp._saved_dependent_views
      WHERE NOT (view_schema = 'public' AND view_name = 'venues_public')
      ORDER BY depth ASC, view_schema, view_name
    LOOP
      EXECUTE format(
        'CREATE OR REPLACE VIEW %I.%I AS %s',
        rec.view_schema,
        rec.view_name,
        rec.view_sql
      );
    END LOOP;
  END IF;

  IF to_regclass('pg_temp._saved_dependent_view_grants') IS NOT NULL THEN
    FOR grant_rec IN
      SELECT view_schema, view_name, grantee, privilege_type, is_grantable
      FROM pg_temp._saved_dependent_view_grants
      ORDER BY view_schema, view_name, grantee, privilege_type
    LOOP
      BEGIN
        EXECUTE format(
          'GRANT %s ON TABLE %I.%I TO %s%s',
          grant_rec.privilege_type,
          grant_rec.view_schema,
          grant_rec.view_name,
          CASE WHEN lower(grant_rec.grantee) = 'public' THEN 'PUBLIC' ELSE format('%I', grant_rec.grantee) END,
          CASE WHEN grant_rec.is_grantable = 'YES' THEN ' WITH GRANT OPTION' ELSE '' END
        );
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END LOOP;
  END IF;

  IF to_regclass('public.shops') IS NULL
     AND to_regclass('public.venues') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.shops AS SELECT * FROM public.venues';
  END IF;

  BEGIN
    EXECUTE 'GRANT SELECT ON public.venues_public TO anon, authenticated, service_role';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  BEGIN
    EXECUTE 'GRANT SELECT ON public.shops TO anon, authenticated, service_role';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
END $$;

DO $$
DECLARE
  has_postgis boolean := false;
  venue_status_udt text := NULL;
  subscription_status_udt text := NULL;
  has_location boolean := false;
  has_latitude boolean := false;
  has_longitude boolean := false;
  has_status boolean := false;
  has_deleted_at boolean := false;
  has_owner_id boolean := false;
  has_visitor_id boolean := false;
  has_h3_cell boolean := false;
  has_category_id boolean := false;
  has_category boolean := false;
  has_visibility_score boolean := false;
  has_name boolean := false;
  has_sub_user_id boolean := false;
  has_sub_status boolean := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') INTO has_postgis;

  IF to_regclass('public.venues') IS NOT NULL THEN
    SELECT udt_name INTO venue_status_udt
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status';

    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'location') INTO has_location;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'latitude') INTO has_latitude;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'longitude') INTO has_longitude;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status') INTO has_status;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'deleted_at') INTO has_deleted_at;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'owner_id') INTO has_owner_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'visitor_id') INTO has_visitor_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'h3_cell') INTO has_h3_cell;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category_id') INTO has_category_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category') INTO has_category;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'visibility_score') INTO has_visibility_score;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'name') INTO has_name;

    IF has_postgis AND has_location THEN
      CREATE INDEX IF NOT EXISTS idx_venues_location_gist
        ON public.venues USING gist (location);
    END IF;

    IF has_latitude THEN
      CREATE INDEX IF NOT EXISTS idx_venues_lat
        ON public.venues (latitude);
    END IF;
    IF has_longitude THEN
      CREATE INDEX IF NOT EXISTS idx_venues_lng
        ON public.venues (longitude);
    END IF;

    IF has_deleted_at THEN
      CREATE INDEX IF NOT EXISTS idx_venues_deleted_at
        ON public.venues (deleted_at);
    END IF;

    IF has_visibility_score AND has_name THEN
      IF has_deleted_at THEN
        CREATE INDEX IF NOT EXISTS idx_venues_visibility_name_live
          ON public.venues (visibility_score DESC, name)
          WHERE deleted_at IS NULL;
      ELSE
        CREATE INDEX IF NOT EXISTS idx_venues_visibility_name
          ON public.venues (visibility_score DESC, name);
      END IF;
    END IF;

    IF venue_status_udt = 'venue_status' AND has_status THEN
      CREATE INDEX IF NOT EXISTS idx_venues_status_lower_map
        ON public.venues ((COALESCE(status, 'active'::venue_status)));

      IF has_owner_id AND has_visitor_id THEN
        CREATE INDEX IF NOT EXISTS idx_venues_owner_visitor_status
          ON public.venues (owner_id, visitor_id, COALESCE(status, 'active'::venue_status));
      END IF;

      IF has_h3_cell THEN
        CREATE INDEX IF NOT EXISTS idx_venues_status_h3_cell
          ON public.venues (COALESCE(status, 'active'::venue_status), h3_cell);
      END IF;

      IF has_category_id THEN
        CREATE INDEX IF NOT EXISTS idx_venues_status_category_id
          ON public.venues (COALESCE(status, 'active'::venue_status), category_id);
      END IF;

      IF has_category THEN
        CREATE INDEX IF NOT EXISTS idx_venues_status_category
          ON public.venues (COALESCE(status, 'active'::venue_status), category);
      END IF;

      IF has_deleted_at THEN
        CREATE INDEX IF NOT EXISTS idx_venues_status_live
          ON public.venues (status)
          WHERE deleted_at IS NULL;
      END IF;

      IF has_latitude AND has_longitude THEN
        IF has_deleted_at THEN
          CREATE INDEX IF NOT EXISTS idx_venues_lat_lng_active
            ON public.venues (latitude, longitude)
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND deleted_at IS NULL
              AND COALESCE(status, 'active'::venue_status) NOT IN ('off'::venue_status, 'inactive'::venue_status, 'disabled'::venue_status, 'deleted'::venue_status);
        ELSE
          CREATE INDEX IF NOT EXISTS idx_venues_lat_lng_active
            ON public.venues (latitude, longitude)
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND COALESCE(status, 'active'::venue_status) NOT IN ('off'::venue_status, 'inactive'::venue_status, 'disabled'::venue_status, 'deleted'::venue_status);
        END IF;
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    SELECT udt_name INTO subscription_status_udt
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'status';

    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'user_id') INTO has_sub_user_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'status') INTO has_sub_status;

    IF subscription_status_udt = 'subscription_status' AND has_sub_user_id AND has_sub_status THEN
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status
        ON public.subscriptions (user_id, COALESCE(status, 'active'::subscription_status));
    END IF;
  END IF;
END $$;

COMMIT;
