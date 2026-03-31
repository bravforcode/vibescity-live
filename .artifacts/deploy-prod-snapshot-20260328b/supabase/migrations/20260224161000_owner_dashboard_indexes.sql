-- -----------------------------------------------------------------------------
-- Owner dashboard analytics indexes (idempotent)
-- -----------------------------------------------------------------------------

BEGIN;

CREATE INDEX IF NOT EXISTS idx_venues_owner_visitor_updated
  ON public.venues (owner_visitor_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_venues_owner_visitor_status
  ON public.venues (owner_visitor_id, status);

CREATE INDEX IF NOT EXISTS idx_venues_owner_visitor_pin
  ON public.venues (owner_visitor_id, pin_type);

CREATE INDEX IF NOT EXISTS idx_analytics_events_venue_created
  ON public.analytics_events (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_visitor_sku_created
  ON public.orders (visitor_id, sku, created_at DESC);

COMMIT;
