-- C1: Stripe event idempotency — prevents replayed webhooks from re-processing
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- C2: slip_hash on orders — enables deduplication of manual transfer submissions
ALTER TABLE orders ADD COLUMN IF NOT EXISTS slip_hash TEXT;

-- Index for fast duplicate lookups (visitor_id + slip_hash)
CREATE INDEX IF NOT EXISTS idx_orders_visitor_slip
  ON orders(visitor_id, slip_hash)
  WHERE slip_hash IS NOT NULL;

-- Unique constraint is the final race guard at DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_visitor_slip
  ON orders(visitor_id, slip_hash)
  WHERE slip_hash IS NOT NULL AND visitor_id IS NOT NULL;
