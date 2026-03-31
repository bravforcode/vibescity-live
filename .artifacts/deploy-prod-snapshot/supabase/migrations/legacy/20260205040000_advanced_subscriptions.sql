-- Migration: advanced_subscriptions
-- Date: 2026-02-05
-- Description: Adds tables for subscriptions and notifications to support "Google Play" style management.

-- 1. Subscriptions Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE, -- CHANGED to UUID to match venues.id
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Nullable for anonymous
    visitor_id TEXT, -- For anonymous tracking
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT,
    status TEXT NOT NULL, -- active, past_due, canceled, trialing
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    plan_id TEXT, -- e.g. price_12345
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookup
CREATE INDEX idx_subscriptions_venue_id ON public.subscriptions(venue_id);
CREATE INDEX idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);

-- 2. Notifications Table (System Alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE, -- CHANGED to UUID to match venues.id
    visitor_id TEXT, -- Target user (device)
    type TEXT NOT NULL, -- 'renewal_warning', 'payment_success', 'payment_failed'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_visitor_id ON public.notifications(visitor_id);

-- 3. RLS Policies

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Subscriptions Policies
-- View: Own subscriptions (based on visitor_id or user_id)
CREATE POLICY "View own subscriptions via VisitorID"
ON public.subscriptions FOR SELECT
USING (
    visitor_id = current_setting('request.headers', true)::json->>'vibe_visitor_id'
);

-- Notifications Policies
CREATE POLICY "View own notifications via VisitorID"
ON public.notifications FOR SELECT
USING (
    visitor_id = current_setting('request.headers', true)::json->>'vibe_visitor_id'
);

CREATE POLICY "Update own notifications via VisitorID"
ON public.notifications FOR UPDATE
USING (
    visitor_id = current_setting('request.headers', true)::json->>'vibe_visitor_id'
);

-- Service Role Bypass (for Webhooks)
-- (Implicitly granted to service_role, but ensures no blockage)

-- 4. Orders Table (For Manual & History)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    visitor_id TEXT, -- For tracking standard pins without auth
    sku TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, rejected
    payment_method TEXT NOT NULL, -- stripe, manual_transfer
    slip_url TEXT, -- For manual transfers
    metadata JSONB DEFAULT '{}'::jsonb, -- Store extended props like 'duration: 7 days'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own orders via VisitorID"
ON public.orders FOR SELECT
USING (
    visitor_id = current_setting('request.headers', true)::json->>'vibe_visitor_id'
);

CREATE POLICY "Create orders (Public)"
ON public.orders FOR INSERT
WITH CHECK (true); -- Allow creation by anyone (visitor_id tracks ownership)

-- 5. Storage Setup (SQL-based creation is limited in standard migrations,
-- usually done via API or UI, but we define policies here if bucket exists)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('payment-slips', 'payment-slips', true) ON CONFLICT DO NOTHING;

-- Storage Policies (Assuming 'payment-slips' bucket exists)
-- CREATE POLICY "Public Upload Slips" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'payment-slips' );
-- CREATE POLICY "Public View Slips" ON storage.objects FOR SELECT USING ( bucket_id = 'payment-slips' );
