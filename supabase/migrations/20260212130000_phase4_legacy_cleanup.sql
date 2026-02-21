-- =============================================================================
-- PHASE 4: Legacy Cleanup & Financial Ledger Hardening
-- =============================================================================
-- Purpose: Drop confirmed-unused legacy tables, add append-only protection
--          to coin_ledger, and add updated_at auto-triggers.
-- Safety:  Legacy drops confirmed: zero frontend refs. Ledger trigger is
--          service_role-exempt to allow admin corrections.
-- Rollback: See bottom of file.
-- =============================================================================

BEGIN;

-- ─── 4a) Drop legacy tables (confirmed zero frontend references) ────────────

DROP TABLE IF EXISTS public.shops_backup_legacy CASCADE;
DROP TABLE IF EXISTS public.favorites_backup_legacy CASCADE;

RAISE NOTICE 'Dropped shops_backup_legacy and favorites_backup_legacy';

-- ─── 4b) Append-only trigger for coin_ledger ────────────────────────────────
-- Blocks UPDATE and DELETE for all roles except service_role (admin corrections)

CREATE OR REPLACE FUNCTION public.prevent_coin_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow service_role to make corrections (e.g., reversals)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'coin_ledger is append-only. Updates are not permitted. Use a correction entry instead.'
      USING HINT = 'Insert a new row with negative amount and transaction_type = ''correction''';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'coin_ledger is append-only. Deletes are not permitted.'
      USING HINT = 'Contact admin for ledger corrections via service_role';
  END IF;

  RETURN NULL; -- never reached for non-service roles
END;
$$;

DROP TRIGGER IF EXISTS trg_coin_ledger_append_only ON public.coin_ledger;
CREATE TRIGGER trg_coin_ledger_append_only
BEFORE UPDATE OR DELETE ON public.coin_ledger
FOR EACH ROW
EXECUTE FUNCTION public.prevent_coin_ledger_mutation();

-- ─── 4c) Generic updated_at trigger function ────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Apply to venues
DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_venues_updated_at' AND tgrelid = to_regclass('public.venues')
  ) THEN
    CREATE TRIGGER trg_venues_updated_at
    BEFORE UPDATE ON public.venues
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
    RAISE NOTICE 'Created trg_venues_updated_at';
  END IF;
END $$;

-- Apply to orders
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'updated_at'
  ) THEN
    IF to_regclass('public.orders') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_orders_updated_at' AND tgrelid = to_regclass('public.orders')
    ) THEN
      CREATE TRIGGER trg_orders_updated_at
      BEFORE UPDATE ON public.orders
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
      RAISE NOTICE 'Created trg_orders_updated_at';
    END IF;
  ELSE
    -- Add updaated_at column if it doesn't exist
    ALTER TABLE public.orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
    RAISE NOTICE 'Added orders.updated_at + trigger';
  END IF;
END $$;

-- Apply to partners
DO $$
BEGIN
  IF to_regclass('public.partners') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_partners_updated_at' AND tgrelid = to_regclass('public.partners')
  ) THEN
    CREATE TRIGGER trg_partners_updated_at
    BEFORE UPDATE ON public.partners
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
    RAISE NOTICE 'Created trg_partners_updated_at';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK PLAN:
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_coin_ledger_append_only ON public.coin_ledger;
-- DROP FUNCTION IF EXISTS public.prevent_coin_ledger_mutation();
-- DROP TRIGGER IF EXISTS trg_venues_updated_at ON public.venues;
-- DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
-- DROP TRIGGER IF EXISTS trg_partners_updated_at ON public.partners;
-- Note: Dropped legacy tables CANNOT be restored without a backup.
