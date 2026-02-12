-- Phase A: Audit (Read-Only)
-- Run in Supabase SQL Editor only. No data changes.

-- A1) Required extensions
SELECT extname
FROM pg_extension
WHERE extname IN ('pgcrypto','postgis','pg_trgm','pg_cron','pg_net');

-- A2) Public tables without RLS
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false;

-- A3) Policies on critical tables
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'venues','orders','order_items','entitlements_ledger',
    'coin_ledger','analytics_sessions','analytics_events',
    'daily_checkins','lucky_wheel_spins'
  )
ORDER BY tablename, policyname;

-- A4) Duplicates (should be zero)
SELECT user_id, checkin_date, COUNT(*)
FROM public.daily_checkins
GROUP BY 1,2 HAVING COUNT(*) > 1;

SELECT user_id, spin_date, COUNT(*)
FROM public.lucky_wheel_spins
GROUP BY 1,2 HAVING COUNT(*) > 1;

SELECT idempotency_key, COUNT(*)
FROM public.coin_ledger
WHERE idempotency_key IS NOT NULL
GROUP BY 1 HAVING COUNT(*) > 1;

-- A5) Foreign key orphans (data drift)
SELECT o.id
FROM public.orders o
LEFT JOIN public.venues v ON v.id = o.venue_id
WHERE o.venue_id IS NOT NULL AND v.id IS NULL
LIMIT 50;

SELECT e.id
FROM public.analytics_events e
LEFT JOIN public.analytics_sessions s ON s.id = e.session_id
WHERE e.session_id IS NOT NULL AND s.id IS NULL
LIMIT 50;
