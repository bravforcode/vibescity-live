-- =============================================================================
-- PHASE 1: Column Standardization & Constraint Enforcement (Production-Hardened)
-- =============================================================================
-- Purpose:
--   - Fix manually-created timestamps (timestamp -> timestamptz, UTC)
--   - Enforce NOT NULL defaults where safe
--   - Add enum-like CHECK constraints using NOT VALID + VALIDATE (low-lock)
-- Safety:
--   - Fully idempotent
--   - Never references missing tables via ::regclass
--   - Uses to_regclass() + dynamic SQL where appropriate
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a) Fix timestamps on manually-created tables
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- user_home_locations.created_at -> timestamptz (UTC)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_home_locations'
      AND column_name  = 'created_at'
      AND data_type    = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.user_home_locations
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'UTC';
    RAISE NOTICE 'Fixed user_home_locations.created_at → timestamptz';
  END IF;

  -- emergency_locations.created_at -> timestamptz (UTC)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'emergency_locations'
      AND column_name  = 'created_at'
      AND data_type    = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.emergency_locations
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'UTC';
    RAISE NOTICE 'Fixed emergency_locations.created_at → timestamptz';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b) venues.status default + backfill (only if column exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  venues_tbl regclass := to_regclass('public.venues');
BEGIN
  IF venues_tbl IS NOT NULL AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='venues' AND column_name='status'
  ) THEN
    EXECUTE 'ALTER TABLE public.venues ALTER COLUMN status SET DEFAULT ''active''';
    EXECUTE 'UPDATE public.venues SET status = ''active'' WHERE status IS NULL';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1c) CHECK constraints (NOT VALID first, then VALIDATE)
--     Pattern: table_regclass := to_regclass('schema.table')
--              only operate when table exists; never use ''table''::regclass
-- ─────────────────────────────────────────────────────────────────────────────

-- venues.status
DO $$
DECLARE
  tbl regclass := to_regclass('public.venues');
BEGIN
  IF tbl IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='venues' AND column_name='status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='venues_status_check' AND conrelid=tbl
    ) THEN
      EXECUTE $SQL$
        ALTER TABLE public.venues
        ADD CONSTRAINT venues_status_check
        CHECK (status IN ('active','pending','archived','draft'))
        NOT VALID
      $SQL$;
    END IF;

    -- validate if present (safe to call repeatedly)
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='venues_status_check' AND conrelid=tbl
    ) THEN
      EXECUTE 'ALTER TABLE public.venues VALIDATE CONSTRAINT venues_status_check';
    END IF;
  END IF;
END $$;

-- orders.subscription_status
DO $$
DECLARE
  tbl regclass := to_regclass('public.orders');
BEGIN
  IF tbl IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='subscription_status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='orders_subscription_status_check' AND conrelid=tbl
    ) THEN
      EXECUTE $SQL$
        ALTER TABLE public.orders
        ADD CONSTRAINT orders_subscription_status_check
        CHECK (subscription_status IN ('none','active','past_due','canceled','trialing'))
        NOT VALID
      $SQL$;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='orders_subscription_status_check' AND conrelid=tbl
    ) THEN
      EXECUTE 'ALTER TABLE public.orders VALIDATE CONSTRAINT orders_subscription_status_check';
    END IF;
  END IF;
END $$;

-- partners.status (table might not exist in some envs)
DO $$
DECLARE
  tbl regclass := to_regclass('public.partners');
BEGIN
  IF tbl IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='partners' AND column_name='status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='partners_status_check' AND conrelid=tbl
    ) THEN
      EXECUTE $SQL$
        ALTER TABLE public.partners
        ADD CONSTRAINT partners_status_check
        CHECK (status IN ('active','inactive','suspended'))
        NOT VALID
      $SQL$;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='partners_status_check' AND conrelid=tbl
    ) THEN
      EXECUTE 'ALTER TABLE public.partners VALIDATE CONSTRAINT partners_status_check';
    END IF;
  END IF;
END $$;

-- coin_ledger.transaction_type
DO $$
DECLARE
  tbl regclass := to_regclass('public.coin_ledger');
BEGIN
  IF tbl IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='coin_ledger' AND column_name='transaction_type'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='coin_ledger_txn_type_check' AND conrelid=tbl
    ) THEN
      EXECUTE $SQL$
        ALTER TABLE public.coin_ledger
        ADD CONSTRAINT coin_ledger_txn_type_check
        CHECK (transaction_type IN (
          'daily_claim','add_venue','review','spend_boost',
          'referral','achievement','admin_grant','purchase',
          'checkin','correction'
        ))
        NOT VALID
      $SQL$;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='coin_ledger_txn_type_check' AND conrelid=tbl
    ) THEN
      EXECUTE 'ALTER TABLE public.coin_ledger VALIDATE CONSTRAINT coin_ledger_txn_type_check';
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1d) Documentation comments (only if columns/tables exist)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='venues' AND column_name='legacy_shop_id'
  ) THEN
    EXECUTE $SQL$
      COMMENT ON COLUMN public.venues.legacy_shop_id IS
      'Legacy bigint shop ID from shops_backup_legacy migration. Drop after zero-reference confirmation.'
    $SQL$;
  END IF;

  IF to_regclass('public.venues') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='venues' AND column_name='owner_visitor_id'
  ) THEN
    EXECUTE $SQL$
      COMMENT ON COLUMN public.venues.owner_visitor_id IS
      'Anonymous visitor fingerprint for unclaimed venue ownership. Used in MerchantRegister and OwnerDashboard.'
    $SQL$;
  END IF;

  IF to_regclass('public.venues') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='venues' AND column_name='image_urls'
  ) THEN
    EXECUTE $SQL$
      COMMENT ON COLUMN public.venues.image_urls IS
      'Canonical image array. Synced to images[] via trg_sync_venue_images trigger.'
    $SQL$;
  END IF;

  IF to_regclass('public.coin_ledger') IS NOT NULL THEN
    EXECUTE $SQL$
      COMMENT ON TABLE public.coin_ledger IS
      'Append-only financial ledger. Updates and deletes blocked by trg_coin_ledger_append_only trigger (Phase 4).'
    $SQL$;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK PLAN (run manually if needed):
-- =============================================================================
-- ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_status_check;
-- ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_subscription_status_check;
-- ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_status_check;
-- ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_txn_type_check;
-- Note: timestamp conversions are lossy to reverse; not recommended.
