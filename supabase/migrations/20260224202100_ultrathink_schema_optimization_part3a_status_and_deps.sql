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
        WHEN undefined_object OR insufficient_privilege THEN
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
    WHEN undefined_object OR insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    EXECUTE 'GRANT SELECT ON public.shops TO anon, authenticated, service_role';
  EXCEPTION
    WHEN undefined_object OR insufficient_privilege THEN
      NULL;
  END;
END $$;

COMMIT;
