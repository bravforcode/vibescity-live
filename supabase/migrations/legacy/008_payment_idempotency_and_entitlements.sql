-- 008_payment_idempotency_and_entitlements.sql

-- A) Stripe Webhook Events for Idempotency
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::JSONB,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- B) Unique Constraint on Orders
-- Ensure provider + provider_order_id is unique to prevent duplicate orders from same stripe session
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_provider_id_unique') THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_provider_id_unique UNIQUE (provider, provider_order_id);
    END IF;
END $$;

-- C) Entitlements Ledger
CREATE TABLE IF NOT EXISTS public.entitlements_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id),
    venue_id UUID REFERENCES public.venues(id), -- Matches venues.id (UUID)
    feature TEXT NOT NULL CHECK (feature IN ('verified', 'glow', 'boost', 'giant')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entitlements_venue_feature ON public.entitlements_ledger(venue_id, feature);
CREATE INDEX IF NOT EXISTS idx_entitlements_order_id ON public.entitlements_ledger(order_id);
