-- =============================================================================
-- Ultrathink schema optimization part 3A.4 (idempotent)
-- Scope: partners.status conversion
-- Prerequisite: 20260224190000_ultrathink_schema_optimization_part2.sql
-- =============================================================================

DO $$
DECLARE
  status_type text;
  constraint_rec record;
BEGIN
  IF to_regclass('public.partners') IS NULL THEN
    RETURN;
  END IF;

  SELECT udt_name INTO status_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'status';

  IF status_type IS NULL THEN
    RETURN;
  END IF;

  IF status_type <> 'partner_status' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_status') THEN
      RAISE EXCEPTION 'partner_status enum is missing; run part2 first';
    END IF;

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
      WHERE c.contype = 'c'
        AND c.conrelid = 'public.partners'::regclass
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
END $$;

