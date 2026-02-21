-- Phase D: Verify (Read-Only)
-- Run in Supabase SQL Editor only.

-- D1) Extensions
SELECT extname FROM pg_extension
WHERE extname IN ('pgcrypto','postgis','pg_trgm','pg_cron','pg_net');

-- D2) RLS flags
SELECT c.relname AS table_name, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- D3) View check
SELECT COUNT(*) AS venues_public_count
FROM public.venues_public;
