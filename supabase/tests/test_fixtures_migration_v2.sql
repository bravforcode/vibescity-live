-- =============================================================================
-- TEST FIXTURES: Seed data for migration verification
-- =============================================================================
-- Run BEFORE migration phases on a staging/branch database to validate
-- that all 5 phases complete without errors and data integrity is preserved.
-- =============================================================================

BEGIN;

-- ─── 1) Seed venues with various data states ────────────────────────────────

INSERT INTO public.venues (id, name, category, latitude, longitude, status, image_urls, images)
VALUES
  -- Normal venue with full data
  ('a0000000-0000-0000-0000-000000000001', 'Test Bar Alpha', 'bar', 18.7883, 98.9853, 'active',
   ARRAY['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
   ARRAY['https://example.com/img1.jpg', 'https://example.com/img2.jpg']),

  -- Venue with NULL status (Phase 1 will backfill to 'active')
  ('a0000000-0000-0000-0000-000000000002', 'Test Cafe Beta', 'restaurant', 18.7900, 98.9870, NULL,
   ARRAY['https://example.com/cafe.jpg'], ARRAY['https://example.com/cafe.jpg']),

  -- Venue with lat/lng but no location geography (Phase 2 will backfill)
  ('a0000000-0000-0000-0000-000000000003', 'Test Mall Gamma', 'mall', 18.7950, 98.9900, 'active',
   '{}', '{}'),

  -- Venue with 'draft' status (should pass Phase 1 constraint)
  ('a0000000-0000-0000-0000-000000000004', 'Test Club Delta', 'shop', 18.8000, 98.9950, 'draft',
   '{}', '{}')
ON CONFLICT (id) DO NOTHING;

-- ─── 2) Seed orders with various subscription states ─────────────────────────

INSERT INTO public.orders (id, venue_id, status, subscription_status, total_amount)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'completed', 'none', 299.00),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   'completed', 'active', 899.00)
ON CONFLICT (id) DO NOTHING;

-- ─── 3) Seed coin_ledger entries ─────────────────────────────────────────────
-- Note: After Phase 4, UPDATE/DELETE on these rows should fail.

-- We need a user ID. In test, we use a fixed UUID.
-- In real staging, these would reference actual auth.users.
DO $$
BEGIN
  -- Only seed if the test user doesn't have entries already
  IF NOT EXISTS (SELECT 1 FROM public.coin_ledger WHERE idempotency_key = 'test_fixture_daily_001') THEN
    INSERT INTO public.coin_ledger (user_id, amount, transaction_type, description, idempotency_key)
    SELECT
      u.id,
      10,
      'daily_claim',
      'Test fixture: daily claim',
      'test_fixture_daily_001'
    FROM auth.users u
    LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.coin_ledger WHERE idempotency_key = 'test_fixture_venue_002') THEN
    INSERT INTO public.coin_ledger (user_id, amount, transaction_type, description, idempotency_key)
    SELECT
      u.id,
      50,
      'add_venue',
      'Test fixture: venue submission reward',
      'test_fixture_venue_002'
    FROM auth.users u
    LIMIT 1;
  END IF;
END $$;

-- ─── 4) Seed analytics for venue_ref index test ─────────────────────────────

INSERT INTO public.analytics_events_p (event_type, venue_ref, metadata, visitor_id, created_at)
VALUES
  ('view', 'a0000000-0000-0000-0000-000000000001', '{"source": "test_fixture"}'::jsonb,
   'visitor_test_001', NOW()),
  ('click', 'a0000000-0000-0000-0000-000000000001', '{"source": "test_fixture"}'::jsonb,
   'visitor_test_001', NOW()),
  ('view', 'a0000000-0000-0000-0000-000000000003', '{"source": "test_fixture"}'::jsonb,
   'visitor_test_002', NOW());

-- ─── 5) Seed venue_stats for RLS test ────────────────────────────────────────

INSERT INTO public.venue_stats (venue_id, total_views, vibe_score)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 150, 4.50),
  ('a0000000-0000-0000-0000-000000000003', 30, 3.20)
ON CONFLICT (venue_id) DO NOTHING;

COMMIT;

-- =============================================================================
-- CLEANUP (run after testing, or use a Supabase branch that auto-resets):
-- =============================================================================
-- DELETE FROM public.venue_stats WHERE venue_id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003');
-- DELETE FROM public.analytics_events_p WHERE metadata->>'source' = 'test_fixture';
-- DELETE FROM public.coin_ledger WHERE idempotency_key LIKE 'test_fixture_%';
-- DELETE FROM public.orders WHERE id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');
-- DELETE FROM public.venues WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');
