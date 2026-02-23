-- Test Script: Feed/Search RPC v2 Safe Finalization
-- Run this in Supabase SQL Editor on both staging and production.

-- 0) Required objects
SELECT
  to_regclass('public.venues') AS venues,
  to_regclass('public.venue_stats') AS venue_stats,
  to_regclass('public.feature_flags') AS feature_flags,
  to_regclass('public.feature_flag_audit') AS feature_flag_audit,
  to_regclass('public.feature_flags_public') AS feature_flags_public,
  to_regclass('public.venue_slug_history') AS venue_slug_history;

-- 1) Required columns
WITH expected_columns AS (
  SELECT * FROM (VALUES
    ('venues', 'slug'),
    ('venues', 'short_code'),
    ('venues', 'name_en'),
    ('venues', 'name_th'),
    ('venues', 'search_vector'),
    ('venue_stats', 'total_views'),
    ('venue_stats', 'checkin_count_24h'),
    ('venue_stats', 'view_count'),
    ('venue_stats', 'ranking_score'),
    ('venue_stats', 'refreshed_at')
  ) AS t(table_name, column_name)
)
SELECT
  e.table_name,
  e.column_name,
  (c.column_name IS NOT NULL) AS column_exists
FROM expected_columns e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = e.table_name
 AND c.column_name = e.column_name
ORDER BY e.table_name, e.column_name;

-- 2) Function signatures and return types
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('refresh_venue_stats', 'get_feed_cards_v2', 'search_venues_v2')
ORDER BY p.proname, identity_args;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_feed_cards_v2'
    AND pg_get_function_identity_arguments(p.oid) = 'p_lat double precision, p_lng double precision, p_limit integer, p_offset integer'
) AS has_get_feed_cards_v2_signature;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_venues_v2'
    AND pg_get_function_identity_arguments(p.oid) = 'p_query text, p_lat double precision, p_lng double precision, p_radius_meters double precision, p_limit integer, p_offset integer'
) AS has_search_venues_v2_signature;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_feed_cards_v2'
    AND pg_get_function_identity_arguments(p.oid) = 'page integer, page_size integer, user_lat double precision, user_long double precision, filter_category text[], promoted_only boolean'
) AS has_legacy_get_feed_cards_v2_signature;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_venues_v2'
    AND pg_get_function_identity_arguments(p.oid) = 'search_query text, limit_count integer'
) AS has_legacy_search_venues_v2_signature;

-- 3) RLS and policies
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('feature_flags', 'feature_flag_audit', 'venue_slug_history', 'venue_stats')
ORDER BY c.relname;

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('feature_flags', 'feature_flag_audit', 'venue_slug_history', 'venue_stats')
ORDER BY tablename, policyname;

SELECT tablename, policyname, COUNT(*) AS duplicate_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('feature_flags', 'feature_flag_audit', 'venue_slug_history', 'venue_stats')
GROUP BY tablename, policyname
HAVING COUNT(*) > 1;

-- 4) Feature flags (production should remain false until rollout)
SELECT key, enabled, public, rollout_percent, updated_at
FROM public.feature_flags
WHERE key IN (
  'use_v2_feed',
  'use_v2_search',
  'enable_web_vitals',
  'enable_partner_program',
  'enable_cinema_mall_explorer'
)
ORDER BY key;

SELECT key, enabled, rollout_percent, updated_at
FROM public.feature_flags_public
WHERE key IN (
  'use_v2_feed',
  'use_v2_search',
  'enable_web_vitals',
  'enable_partner_program',
  'enable_cinema_mall_explorer'
)
ORDER BY key;

-- 5) Trigger stats refresh
SELECT public.refresh_venue_stats() AS refreshed_rows;

SELECT
  venue_id,
  total_views,
  checkin_count_24h,
  view_count,
  ranking_score,
  refreshed_at
FROM public.venue_stats
ORDER BY refreshed_at DESC
LIMIT 10;

-- 6) Feed RPC smoke test
SELECT *
FROM public.get_feed_cards_v2(
  p_lat := 13.7563, -- Bangkok
  p_lng := 100.5018,
  p_limit := 5,
  p_offset := 0
);

-- 7) Search RPC smoke test
SELECT *
FROM public.search_venues_v2(
  p_query := 'mall',
  p_lat := 13.7563,
  p_lng := 100.5018,
  p_limit := 10,
  p_offset := 0
);
