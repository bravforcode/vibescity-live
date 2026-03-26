-- -----------------------------------------------------------------------------
-- Partner/Owner performance follow-up indexes (idempotent)
-- -----------------------------------------------------------------------------

BEGIN;

CREATE INDEX IF NOT EXISTS idx_subscriptions_visitor_updated
  ON public.subscriptions (visitor_id, updated_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'visitor_id_uuid'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_subscriptions_visitor_uuid_updated
      ON public.subscriptions (visitor_id_uuid, updated_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'visitor_id_uuid'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_orders_visitor_uuid_sku_created
      ON public.orders (visitor_id_uuid, sku, created_at DESC);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_partners_visitor_id
  ON public.partners (visitor_id)
  WHERE visitor_id IS NOT NULL;

COMMIT;
