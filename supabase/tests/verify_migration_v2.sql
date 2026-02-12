-- =============================================================================
-- VERIFICATION QUERIES: Run after each migration phase
-- =============================================================================
-- Copy-paste these into Supabase SQL Editor to validate each phase.
-- Each section is labeled with the phase it validates.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- PRE-MIGRATION: Snapshot (run BEFORE any phase)
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT 'PRE-MIGRATION ROW COUNTS' AS section;
SELECT 'venues' AS tbl, COUNT(*) AS cnt FROM public.venues
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'coin_ledger', COUNT(*) FROM public.coin_ledger
UNION ALL SELECT 'analytics_events_p', COUNT(*) FROM public.analytics_events_p
UNION ALL SELECT 'venue_stats', COUNT(*) FROM public.venue_stats
UNION ALL SELECT 'partners', COUNT(*) FROM public.partners
ORDER BY tbl;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 1 VERIFICATION: Constraints & Timestamp Types
-- ═══════════════════════════════════════════════════════════════════════════════

-- V1.1: CHECK constraints exist
SELECT 'PHASE 1: CHECK CONSTRAINTS' AS section;
SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
  'venues_status_check',
  'orders_subscription_status_check',
  'partners_status_check',
  'coin_ledger_txn_type_check'
)
ORDER BY conrelid, conname;

-- V1.2: No NULL statuses remain
SELECT 'PHASE 1: NULL STATUS CHECK' AS section;
SELECT COUNT(*) AS null_status_venues FROM public.venues WHERE status IS NULL;

-- V1.3: Timestamp types corrected
SELECT 'PHASE 1: TIMESTAMP TYPES' AS section;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'created_at'
  AND table_name IN ('user_home_locations', 'emergency_locations')
ORDER BY table_name;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 2 VERIFICATION: PostGIS Geography
-- ═══════════════════════════════════════════════════════════════════════════════

-- V2.1: Geography backfill completeness
SELECT 'PHASE 2: GEOGRAPHY BACKFILL' AS section;
SELECT
  COUNT(*) AS total_venues,
  COUNT(location) AS has_geography,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND location IS NULL) AS missing_geography,
  COUNT(*) FILTER (WHERE location IS NOT NULL AND latitude IS NULL) AS missing_latlng
FROM public.venues;

-- V2.2: Trigger exists
SELECT 'PHASE 2: SYNC TRIGGER' AS section;
SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_sync_venue_location';

-- V2.3: GIST index exists
SELECT 'PHASE 2: SPATIAL INDEX' AS section;
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'venues'
  AND indexname IN ('idx_venues_location_gist', 'idx_venues_h3_cell', 'idx_venues_category_location');


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3 VERIFICATION: ID Types & FKs
-- ═══════════════════════════════════════════════════════════════════════════════

-- V3.1: user_id column types
SELECT 'PHASE 3: USER_ID TYPES' AS section;
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'user_id'
  AND table_name IN ('user_home_locations', 'emergency_locations')
ORDER BY table_name;

-- V3.2: FK constraints
SELECT 'PHASE 3: FOREIGN KEYS' AS section;
SELECT conname, conrelid::regclass AS from_table, confrelid::regclass AS to_table
FROM pg_constraint
WHERE conname LIKE '%user_id_fkey%'
  AND conrelid::regclass::text IN ('public.user_home_locations')
ORDER BY conrelid;

-- V3.3: Indexes on venue_ref
SELECT 'PHASE 3: VENUE_REF INDEXES' AS section;
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname IN ('idx_analytics_events_p_venue_ref', 'idx_map_pins_zoom_cache_venue_ref');


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 4 VERIFICATION: Legacy Cleanup & Ledger Protection
-- ═══════════════════════════════════════════════════════════════════════════════

-- V4.1: Legacy tables dropped
SELECT 'PHASE 4: LEGACY TABLES DROPPED' AS section;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('shops_backup_legacy', 'favorites_backup_legacy');
-- Expected: 0 rows

-- V4.2: Append-only trigger exists
SELECT 'PHASE 4: APPEND-ONLY TRIGGER' AS section;
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_coin_ledger_append_only';

-- V4.3: updated_at triggers
SELECT 'PHASE 4: UPDATED_AT TRIGGERS' AS section;
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN ('trg_venues_updated_at', 'trg_orders_updated_at', 'trg_partners_updated_at')
ORDER BY tgrelid;

-- V4.4: Test append-only (should FAIL — uncomment to test manually)
-- UPDATE public.coin_ledger SET amount = 0 WHERE idempotency_key = 'test_fixture_daily_001';
-- Expected error: "coin_ledger is append-only. Updates are not permitted."


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 5 VERIFICATION: RLS Status
-- ═══════════════════════════════════════════════════════════════════════════════

-- V5.1: RLS enabled on target tables
SELECT 'PHASE 5: RLS STATUS' AS section;
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'user_home_locations', 'emergency_locations',
    'analytics_events_p', 'map_pins_zoom_cache', 'venue_stats',
    'venues', 'orders', 'coin_ledger', 'partners'
  )
ORDER BY tablename;

-- V5.2: Policies per table
SELECT 'PHASE 5: POLICY INVENTORY' AS section;
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'user_home_locations', 'emergency_locations',
    'analytics_events_p', 'map_pins_zoom_cache', 'venue_stats'
  )
ORDER BY tablename, policyname;


-- ═══════════════════════════════════════════════════════════════════════════════
-- POST-MIGRATION: Final snapshot (compare with pre-migration)
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT 'POST-MIGRATION ROW COUNTS' AS section;
SELECT 'venues' AS tbl, COUNT(*) AS cnt FROM public.venues
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'coin_ledger', COUNT(*) FROM public.coin_ledger
UNION ALL SELECT 'analytics_events_p', COUNT(*) FROM public.analytics_events_p
UNION ALL SELECT 'venue_stats', COUNT(*) FROM public.venue_stats
UNION ALL SELECT 'partners', COUNT(*) FROM public.partners
ORDER BY tbl;
