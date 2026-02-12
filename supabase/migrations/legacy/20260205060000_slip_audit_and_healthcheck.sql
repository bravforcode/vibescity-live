-- Migration: slip_audit + slip_health_checks
-- Date: 2026-02-05
-- Description: Store PII audit data and EasySlip healthcheck logs

CREATE TABLE IF NOT EXISTS public.slip_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    visitor_id TEXT,
    consent_personal_data BOOLEAN NOT NULL DEFAULT FALSE,
    buyer_full_name TEXT,
    buyer_phone TEXT,
    buyer_email TEXT,
    buyer_address_line1 TEXT,
    buyer_address_line2 TEXT,
    buyer_country TEXT,
    buyer_province TEXT,
    buyer_district TEXT,
    buyer_postal TEXT,
    ip_address TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    geo_country TEXT,
    geo_region TEXT,
    geo_city TEXT,
    geo_postal TEXT,
    geo_timezone TEXT,
    geo_loc TEXT,
    geo_org TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS slip_audit_order_id_idx ON public.slip_audit(order_id);
CREATE INDEX IF NOT EXISTS slip_audit_created_at_idx ON public.slip_audit(created_at);

ALTER TABLE public.slip_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS slip_audit_service_only ON public.slip_audit;
CREATE POLICY slip_audit_service_only ON public.slip_audit
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.slip_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL,
    latency_ms INTEGER,
    http_status INTEGER,
    provider_status INTEGER,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS slip_health_checks_checked_at_idx ON public.slip_health_checks(checked_at);

ALTER TABLE public.slip_health_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS slip_health_checks_service_only ON public.slip_health_checks;
CREATE POLICY slip_health_checks_service_only ON public.slip_health_checks
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
