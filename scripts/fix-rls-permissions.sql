-- ============================================
-- FIX: Enable Public Read Access (RLS)
-- Run this if data exists but frontend returns empty arrays.
-- ============================================

-- 1. Enable RLS on core tables (if not already)
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Public can view shops" ON shops;
DROP POLICY IF EXISTS "Public can view buildings" ON buildings;
DROP POLICY IF EXISTS "Public can view emergency_locations" ON emergency_locations;
DROP POLICY IF EXISTS "Public can view events" ON events;

-- 3. Create "Allow All Select" policies for public users (anon)
CREATE POLICY "Public can view shops" ON shops
    FOR SELECT USING (true);

CREATE POLICY "Public can view buildings" ON buildings
    FOR SELECT USING (true);

CREATE POLICY "Public can view emergency_locations" ON emergency_locations
    FOR SELECT USING (true);

CREATE POLICY "Public can view events" ON events
    FOR SELECT USING (true);

-- 4. Verify Policy Existence
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('shops', 'buildings', 'events');
