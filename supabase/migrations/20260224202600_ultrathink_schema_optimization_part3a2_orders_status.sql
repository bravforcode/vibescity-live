-- =============================================================================
-- Ultrathink schema optimization part 3A.2 (idempotent)
-- Scope: orders.status conversion + policy/index restore
-- Prerequisite: 20260224190000_ultrathink_schema_optimization_part2.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  status_type text;
  policy_rec record;
  idx_rec record;
  constraint_rec record;
BEGIN
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

  IF to_regclass('public.orders') IS NULL THEN
    RETURN;
  END IF;

  SELECT udt_name INTO status_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status';

  IF status_type IS NULL THEN
    RETURN;
  END IF;

  IF status_type <> 'order_status' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
      RAISE EXCEPTION 'order_status enum is missing; run part2 first';
    END IF;

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

    FOR idx_rec IN
      SELECT index_schema, index_name
      FROM pg_temp._saved_orders_status_indexes
      ORDER BY index_schema, index_name
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS %I.%I', idx_rec.index_schema, idx_rec.index_name);
    END LOOP;

    -- Drop potentially blocking functions before changing orders.status
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

    -- Ensure compatibility across text/enum status
    qual_expr := regexp_replace(qual_expr, '\ystatus\y([^:])', 'status::text\1', 'g');
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
  v_index_sql text;
BEGIN
  IF to_regclass('pg_temp._saved_orders_status_indexes') IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT s.index_sql
    FROM pg_temp._saved_orders_status_indexes s
    ORDER BY s.index_schema, s.index_name
  LOOP
    v_index_sql := rec.index_sql;
    v_index_sql := regexp_replace(v_index_sql, '''canceled''', '''cancelled''', 'gi');
    v_index_sql := regexp_replace(
      v_index_sql,
      '''(pending|pending_review|verified|rejected|paid|failed|cancelled|refunded)''::(text|character varying|varchar)',
      '''\1''::order_status',
      'gi'
    );
    EXECUTE v_index_sql;
  END LOOP;
END $$;

COMMIT;
