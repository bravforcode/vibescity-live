-- Phase B: Safe Fixes (Idempotent)
-- Run in Supabase SQL Editor only. No destructive changes.

-- B1) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- If pg_cron/pg_net fails: enable in Dashboard > Database > Extensions.

-- B2) Indexes for scale
CREATE INDEX IF NOT EXISTS orders_status_created_idx
  ON public.orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS coin_ledger_user_created_idx
  ON public.coin_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx
  ON public.analytics_events(session_id);

-- B3) View security hardening
ALTER VIEW public.venues_public
  SET (security_invoker = true, security_barrier = true);
