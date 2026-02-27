-- =============================================================================
-- Ultrathink schema optimization part 3A.1 (idempotent)
-- Scope: venues.status conversion + dependent view/policy/grant restore
-- Prerequisite: 20260224190000_ultrathink_schema_optimization_part2.sql
-- =============================================================================

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

  IF to_regclass('public.venues') IS NULL THEN
    RETURN;
  END IF;

  SELECT udt_name INTO status_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status';

  IF status_type IS NULL THEN
    RETURN;
  END IF;

  IF status_type <> 'venue_status' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'venue_status') THEN
      RAISE EXCEPTION 'venue_status enum is missing; run part2 first';
    END IF;

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
    with_check_expr := regexp_replace(with_check_expr, '''live''', '''active''', 'gi');

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
      -- Some views (e.g. venues_public) are recreated in later migration steps.
      -- Skip grants for relations that are not currently present.
      IF to_regclass(format('%I.%I', grant_rec.view_schema, grant_rec.view_name)) IS NULL THEN
        CONTINUE;
      END IF;

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

COMMIT;
