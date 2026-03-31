-- =============================================================================
-- Ultrathink schema optimization part 3B (idempotent)
-- Phase B split: sync triggers and backfills
-- Source: 20260224202000_ultrathink_schema_optimization_part3.sql
-- =============================================================================

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
