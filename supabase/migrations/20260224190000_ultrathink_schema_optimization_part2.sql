-- =============================================================================
-- Ultrathink schema optimization part 2 (idempotent)
-- Phase A: extension + enum value definitions only
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

-- -----------------------------------------------------------------------------
-- 1.2: ENUM conversion for status columns
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'venue_status') THEN
    CREATE TYPE venue_status AS ENUM (
      'active', 'pending', 'archived', 'draft', 'off', 'inactive', 'disabled', 'deleted'
    );
  END IF;
  ALTER TYPE venue_status ADD VALUE IF NOT EXISTS 'active';
  ALTER TYPE venue_status ADD VALUE IF NOT EXISTS 'pending';
  ALTER TYPE venue_status ADD VALUE IF NOT EXISTS 'archived';
  ALTER TYPE venue_status ADD VALUE IF NOT EXISTS 'draft';
  ALTER TYPE venue_status ADD VALUE IF NOT EXISTS 'off';
  ALTER TYPE venue_status ADD VALUE IF NOT EXISTS 'inactive';
  ALTER TYPE venue_status ADD VALUE IF NOT EXISTS 'disabled';
  ALTER TYPE venue_status ADD VALUE IF NOT EXISTS 'deleted';

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM (
      'active', 'paused', 'cancelled', 'expired', 'trialing'
    );
  END IF;
  ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'active';
  ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'paused';
  ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'cancelled';
  ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'expired';
  ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'trialing';

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_status') THEN
    CREATE TYPE partner_status AS ENUM (
      'active', 'inactive', 'blocked'
    );
  END IF;
  ALTER TYPE partner_status ADD VALUE IF NOT EXISTS 'active';
  ALTER TYPE partner_status ADD VALUE IF NOT EXISTS 'inactive';
  ALTER TYPE partner_status ADD VALUE IF NOT EXISTS 'blocked';

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'pending', 'pending_review', 'verified', 'rejected', 'paid', 'failed', 'cancelled', 'refunded'
    );
  END IF;

  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_review';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'verified';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'rejected';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'paid';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'failed';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelled';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refunded';
END $$;