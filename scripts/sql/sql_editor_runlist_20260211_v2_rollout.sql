-- Purpose: SQL Editor runlist for feed/search v2 safe rollout (staging first, then production).
-- Safety: idempotent, SQL Editor safe, non-destructive by default.
-- Affected objects: public.venues, public.venue_slug_history, public.feature_flags, public.feature_flag_audit,
--                   public.venue_stats, public.get_feed_cards_v2, public.search_venues_v2.
-- Risks (tier): High
-- Rollback plan:
--   1) Keep use_v2_feed/use_v2_search disabled.
--   2) Restore prior function definitions from snapshot.
--   3) Unschedule refresh_venue_stats_15m_v2_safe if needed.

-- ============================================================================
-- 0) PRE-AUDIT (READ-ONLY) - RUN THIS FIRST ON STAGING, THEN PROD
-- ============================================================================
SELECT extname
FROM pg_extension
WHERE extname IN ('pgcrypto', 'postgis', 'pg_trgm', 'pg_cron', 'pg_net')
ORDER BY extname;

SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'feature_flags', 'feature_flag_audit', 'venue_slug_history', 'venue_stats'
  )
ORDER BY tablename, policyname;

-- ============================================================================
-- 1) APPLY MIGRATIONS (MANUAL ORDER)
--    Execute each file in SQL Editor in this exact sequence:
--    1) supabase/migrations/20260210121000_venues_slug.sql
--    2) supabase/migrations/20260210122000_venues_slug_history_and_update.sql
--    3) supabase/migrations/20260210124000_venues_short_code_and_backfill.sql
--    4) supabase/migrations/20260211193000_feed_search_v2_safe_finalize.sql
-- ============================================================================

-- ============================================================================
-- 2) POST-APPLY VALIDATION (READ-ONLY)
-- ============================================================================
WITH expected_columns AS (
  SELECT * FROM (VALUES
    ('venues', 'slug'),
    ('venues', 'short_code'),
    ('venues', 'name_en'),
    ('venues', 'name_th'),
    ('venues', 'search_vector'),
    ('venue_stats', 'total_views'),
    ('venue_stats', 'checkin_count_24h'),
    ('venue_stats', 'ranking_score')
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

SELECT
  to_regclass('public.venue_slug_history') AS venue_slug_history,
  to_regclass('public.feature_flags') AS feature_flags,
  to_regclass('public.feature_flag_audit') AS feature_flag_audit,
  to_regclass('public.feature_flags_public') AS feature_flags_public,
  to_regclass('public.venue_stats') AS venue_stats;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('refresh_venue_stats', 'get_feed_cards_v2', 'search_venues_v2')
ORDER BY p.proname, identity_args;

-- ============================================================================
-- 3) PRODUCTION SAFETY SWITCH (KEEP V2 FLAGS OFF UNTIL SMOKE TEST PASSES)
--    Run this block on production right after migration.
-- ============================================================================
INSERT INTO public.feature_flags (key, description, enabled, public)
VALUES
  ('use_v2_feed', 'Use feed/search RPC v2 for public feed', FALSE, TRUE),
  ('use_v2_search', 'Use search RPC v2 for global search', FALSE, TRUE)
ON CONFLICT (key) DO UPDATE
SET enabled = FALSE,
    public = TRUE;

SELECT key, enabled, public, updated_at
FROM public.feature_flags
WHERE key IN ('use_v2_feed', 'use_v2_search')
ORDER BY key;

-- ============================================================================
-- 4) SMOKE TESTS (SAFE)
-- ============================================================================
SELECT public.refresh_venue_stats() AS refreshed_rows;

SELECT *
FROM public.get_feed_cards_v2(
  p_lat := 13.7563,
  p_lng := 100.5018,
  p_limit := 5,
  p_offset := 0
);

SELECT *
FROM public.search_venues_v2(
  p_query := 'mall',
  p_lat := 13.7563,
  p_lng := 100.5018,
  p_limit := 10,
  p_offset := 0
);

-- ============================================================================
-- 5) FINAL VERIFICATION
--    Run:
--    - tests/rpc_v2_test.sql
--    - scripts/sql-editor-hardening/phase-d-verify.sql
-- ============================================================================
