-- =============================================================================
-- Ultrathink schema optimization part 3A.3 (idempotent)
-- Scope: subscriptions.status conversion
-- Prerequisite: 20260224190000_ultrathink_schema_optimization_part2.sql
-- =============================================================================

DO $$
DECLARE
  status_type text;
  constraint_rec record;
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RETURN;
  END IF;

  SELECT udt_name INTO status_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'status';

  IF status_type IS NULL THEN
    RETURN;
  END IF;

  IF status_type <> 'subscription_status' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
      RAISE EXCEPTION 'subscription_status enum is missing; run part2 first';
    END IF;

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
      WHERE c.contype = 'c'
        AND c.conrelid = 'public.subscriptions'::regclass
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
END $$;

