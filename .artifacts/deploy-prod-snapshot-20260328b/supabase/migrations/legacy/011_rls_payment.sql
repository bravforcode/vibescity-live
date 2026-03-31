-- 011_rls_payment.sql

-- A) stripe_webhook_events: Server-only
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies added means default deny for public/anon.
-- Service role always bypasses RLS.

-- B) orders: User can read own
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role manages orders" ON public.orders;
CREATE POLICY "Service role manages orders" ON public.orders
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- C) entitlements_ledger: Read linked via orders
ALTER TABLE public.entitlements_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own entitlements" ON public.entitlements_ledger;
CREATE POLICY "Users can view own entitlements" ON public.entitlements_ledger
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = entitlements_ledger.order_id
            AND o.user_id = auth.uid()
        )
    );

-- Service role full access
DROP POLICY IF EXISTS "Service role manages entitlements" ON public.entitlements_ledger;
CREATE POLICY "Service role manages entitlements" ON public.entitlements_ledger
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
