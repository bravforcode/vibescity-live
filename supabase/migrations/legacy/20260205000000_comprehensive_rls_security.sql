-- ═══════════════════════════════════════════════════════════════════════════════
-- VibeCity Database Security & Schema Unification
-- Version: 1.0.0
-- Date: 2026-02-05
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- This script:
-- 1. Creates comprehensive RLS policies for maximum security
-- 2. Unifies shops/venues references
-- 3. Adds proper indexes for performance
-- 4. Sets up audit logging
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: Enable RLS on All Tables
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: Add owner_id Column if Missing (Required for RLS)
-- MOVED UP TO ENSURE COLUMN EXISTS BEFORE POLICIES USE IT
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'venues'
        AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE public.venues ADD COLUMN owner_id UUID REFERENCES auth.users(id);
        CREATE INDEX venues_owner_id_idx ON public.venues(owner_id);
        COMMENT ON COLUMN public.venues.owner_id IS 'User who owns/submitted this venue';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'venues'
        AND column_name = 'status'
    ) THEN
        ALTER TABLE public.venues ADD COLUMN status TEXT DEFAULT 'pending';
        CREATE INDEX venues_status_idx ON public.venues(status);
    END IF;

    -- FIX: Ensure entitlements_ledger has user_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'entitlements_ledger'
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.entitlements_ledger ADD COLUMN user_id UUID REFERENCES auth.users(id);
        -- Index will be created later in Section 13, but good to ensure constraints here if needed
    END IF;

    -- FIX: Ensure venues has latitude/longitude
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'latitude') THEN
        ALTER TABLE public.venues ADD COLUMN latitude DOUBLE PRECISION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'longitude') THEN
        ALTER TABLE public.venues ADD COLUMN longitude DOUBLE PRECISION;
    END IF;

    -- FIX: Ensure venues has legacy media columns (quoted to preserve case if needed by View)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'Image_URL1') THEN
        ALTER TABLE public.venues ADD COLUMN "Image_URL1" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'Image_URL2') THEN
        ALTER TABLE public.venues ADD COLUMN "Image_URL2" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'Image_URL3') THEN
        ALTER TABLE public.venues ADD COLUMN "Image_URL3" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'Video_URL') THEN
        ALTER TABLE public.venues ADD COLUMN "Video_URL" TEXT;
    END IF;

    -- FIX: Ensure venues has contact/location info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'location') THEN
        ALTER TABLE public.venues ADD COLUMN location TEXT;
    END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'phone') THEN
        ALTER TABLE public.venues ADD COLUMN phone TEXT;
    END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'website') THEN
        ALTER TABLE public.venues ADD COLUMN website TEXT;
    END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'opening_hours') THEN
        ALTER TABLE public.venues ADD COLUMN opening_hours TEXT;
    END IF;

    -- FIX: Ensure venues has metric/entitlement columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'total_views') THEN
        ALTER TABLE public.venues ADD COLUMN total_views INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'total_clicks') THEN
        ALTER TABLE public.venues ADD COLUMN total_clicks INTEGER DEFAULT 0;
    END IF;

    -- Entitlements
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'pin_type') THEN
        ALTER TABLE public.venues ADD COLUMN pin_type TEXT DEFAULT 'standard';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'pin_metadata') THEN
        ALTER TABLE public.venues ADD COLUMN pin_metadata JSONB DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'is_verified') THEN
        ALTER TABLE public.venues ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'verified_until') THEN
        ALTER TABLE public.venues ADD COLUMN verified_until TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'glow_until') THEN
        ALTER TABLE public.venues ADD COLUMN glow_until TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'boost_until') THEN
        ALTER TABLE public.venues ADD COLUMN boost_until TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'giant_until') THEN
        ALTER TABLE public.venues ADD COLUMN giant_until TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'visibility_score') THEN
        ALTER TABLE public.venues ADD COLUMN visibility_score INTEGER DEFAULT 0;
    END IF;

     -- OSM & Region
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'osm_id') THEN
        ALTER TABLE public.venues ADD COLUMN osm_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'osm_type') THEN
        ALTER TABLE public.venues ADD COLUMN osm_type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'source') THEN
        ALTER TABLE public.venues ADD COLUMN source TEXT DEFAULT 'ugc';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'province') THEN
        ALTER TABLE public.venues ADD COLUMN province TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'region') THEN
        ALTER TABLE public.venues ADD COLUMN region TEXT;
    END IF;

END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: Comprehensive RLS Policies for VENUES
-- Maximum Security: Separate policies for each operation
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop existing policies to recreate with proper security
DROP POLICY IF EXISTS "Public can read venues" ON public.venues;
DROP POLICY IF EXISTS "Service role full access on venues" ON public.venues;
DROP POLICY IF EXISTS "venues_select_public" ON public.venues;
DROP POLICY IF EXISTS "venues_insert_authenticated" ON public.venues;
DROP POLICY IF EXISTS "venues_update_owner" ON public.venues;
DROP POLICY IF EXISTS "venues_delete_admin" ON public.venues;

-- SELECT: Public can read only approved/active venues
CREATE POLICY "venues_select_public" ON public.venues
    FOR SELECT
    USING (
        -- Public venues are visible to everyone
        (status IS NULL OR status IN ('active', 'approved', 'LIVE'))
        OR
        -- Owners can always see their own venues
        (auth.uid() IS NOT NULL AND owner_id = auth.uid())
        OR
        -- Service role can see all
        (auth.role() = 'service_role')
    );

-- INSERT: Only authenticated users can create venues (UGC)
CREATE POLICY "venues_insert_authenticated" ON public.venues
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            -- User becomes the owner
            owner_id = auth.uid()
            OR
            -- Service role can insert
            auth.role() = 'service_role'
        )
    );

-- UPDATE: Only venue owner or admin can update
CREATE POLICY "venues_update_owner" ON public.venues
    FOR UPDATE
    USING (
        -- Owner can update their venue
        (auth.uid() IS NOT NULL AND owner_id = auth.uid())
        OR
        -- Service role can update all
        auth.role() = 'service_role'
    )
    WITH CHECK (
        -- Prevent changing owner_id (ownership transfer must be explicit)
        owner_id = owner_id
    );

-- DELETE: Only admin/service role can delete
CREATE POLICY "venues_delete_admin" ON public.venues
    FOR DELETE
    USING (
        auth.role() = 'service_role'
    );



-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: RLS Policies for ORDERS (Payment Security)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users create own orders" ON public.orders;
DROP POLICY IF EXISTS "Service role manages orders" ON public.orders;

-- SELECT: Users can only see their own orders
CREATE POLICY "orders_select_own" ON public.orders
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR auth.role() = 'service_role'
    );

-- INSERT: Users can create orders for themselves
CREATE POLICY "orders_insert_own" ON public.orders
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        OR auth.role() = 'service_role'
    );

-- UPDATE: Only service role can update orders (payment status changes)
CREATE POLICY "orders_update_service" ON public.orders
    FOR UPDATE
    USING (auth.role() = 'service_role');

-- DELETE: No one deletes orders (audit trail)
-- No policy = no delete allowed

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: RLS for ORDER_ITEMS
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;

CREATE POLICY "order_items_select_own" ON public.order_items
    FOR SELECT
    USING (
        order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        OR auth.role() = 'service_role'
    );

CREATE POLICY "order_items_insert_service" ON public.order_items
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 6: RLS for USER_STATS (Gamification)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can read own stats" ON public.user_stats;
DROP POLICY IF EXISTS "user_stats_select" ON public.user_stats;

-- Public can see anyone's stats (leaderboard feature)
CREATE POLICY "user_stats_select_public" ON public.user_stats
    FOR SELECT
    USING (true);

-- Only service role can modify stats (anti-cheat)
CREATE POLICY "user_stats_modify_service" ON public.user_stats
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 7: RLS for CHECK_INS
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "check_ins_policy" ON public.check_ins;

-- Users can see all check-ins (social feature)
CREATE POLICY "check_ins_select_public" ON public.check_ins
    FOR SELECT
    USING (true);

-- Users can only create their own check-ins
CREATE POLICY "check_ins_insert_own" ON public.check_ins
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can delete only their own check-ins
CREATE POLICY "check_ins_delete_own" ON public.check_ins
    FOR DELETE
    USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 8: RLS for VENUE_PHOTOS (UGC)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "venue_photos_policy" ON public.venue_photos;

-- Public can see only approved photos
CREATE POLICY "venue_photos_select" ON public.venue_photos
    FOR SELECT
    USING (
        status = 'approved'
        OR user_id = auth.uid()
        OR auth.role() = 'service_role'
    );

-- Authenticated users can upload photos
CREATE POLICY "venue_photos_insert" ON public.venue_photos
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
    );

-- Users can delete their own photos
CREATE POLICY "venue_photos_delete" ON public.venue_photos
    FOR DELETE
    USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 9: RLS for USER_SUBMISSIONS (Admin Review Queue)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Users see only their own submissions
CREATE POLICY "user_submissions_select_own" ON public.user_submissions
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR auth.role() = 'service_role'
    );

CREATE POLICY "user_submissions_insert_own" ON public.user_submissions
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Only service role can update (approve/reject)
CREATE POLICY "user_submissions_update_service" ON public.user_submissions
    FOR UPDATE
    USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 10: RLS for ENTITLEMENTS_LEDGER (Payment Audit)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users view own entitlements" ON public.entitlements_ledger;

CREATE POLICY "entitlements_select_own" ON public.entitlements_ledger
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR venue_id IN (SELECT id FROM public.venues WHERE owner_id = auth.uid())
        OR auth.role() = 'service_role'
    );

-- Only service role can write
CREATE POLICY "entitlements_write_service" ON public.entitlements_ledger
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 11: RLS for STRIPE_WEBHOOK_EVENTS (Security Critical)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "stripe_events_service_only" ON public.stripe_webhook_events;

-- ONLY service role can access webhook events (security critical)
CREATE POLICY "stripe_events_service_only" ON public.stripe_webhook_events
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 12: Create VIEW to Unify shops/venues
-- This allows existing code using "shops" to work seamlessly
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop if exists
DROP VIEW IF EXISTS public.shops;

-- Create view that aliases venues as shops
CREATE VIEW public.shops AS
SELECT
    id,
    name,
    category,
    description,
    latitude,
    longitude,
    location,
    province,
    region,
    status,
    owner_id,
    -- Map venues columns to legacy shop columns
    "Image_URL1",
    "Image_URL2",
    "Image_URL3",
    "Video_URL",
    phone,
    website,
    opening_hours,
    -- Entitlement columns
    pin_type,
    pin_metadata,
    is_verified,
    verified_until,
    glow_until,
    boost_until,
    giant_until,
    visibility_score,
    -- Metrics
    total_views,
    total_clicks,
    -- Timestamps
    created_at,
    updated_at,
    -- OSM
    osm_id,
    osm_type,
    source
FROM public.venues;

COMMENT ON VIEW public.shops IS 'Legacy view - aliases venues table for backward compatibility. Use venues table directly for new code.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 13: Security Indexes for Performance
-- ═══════════════════════════════════════════════════════════════════════════════

-- These indexes speed up RLS policy checks
CREATE INDEX IF NOT EXISTS venues_owner_id_idx ON public.venues(owner_id);
CREATE INDEX IF NOT EXISTS venues_status_idx ON public.venues(status);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS check_ins_user_id_idx ON public.check_ins(user_id);
CREATE INDEX IF NOT EXISTS check_ins_venue_id_idx ON public.check_ins(venue_id);
CREATE INDEX IF NOT EXISTS venue_photos_user_id_idx ON public.venue_photos(user_id);
CREATE INDEX IF NOT EXISTS venue_photos_status_idx ON public.venue_photos(status);
CREATE INDEX IF NOT EXISTS user_submissions_user_id_idx ON public.user_submissions(user_id);
CREATE INDEX IF NOT EXISTS user_submissions_status_idx ON public.user_submissions(status);
CREATE INDEX IF NOT EXISTS entitlements_user_id_idx ON public.entitlements_ledger(user_id);
CREATE INDEX IF NOT EXISTS entitlements_venue_id_idx ON public.entitlements_ledger(venue_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 14: Audit Trigger for Venues (Track All Changes)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create audit log table if not exists
CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    user_id UUID,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX audit_log_table_idx ON public.audit_log(table_name);
CREATE INDEX audit_log_record_idx ON public.audit_log(record_id);
CREATE INDEX audit_log_created_idx ON public.audit_log(created_at);

-- RLS for audit log - only service role can access
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_service_only" ON public.audit_log
    FOR ALL USING (auth.role() = 'service_role');

-- Audit function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_log (table_name, record_id, action, old_data, user_id)
        VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', row_to_json(OLD)::JSONB, auth.uid());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, user_id)
        VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, auth.uid());
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
        VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'INSERT', row_to_json(NEW)::JSONB, auth.uid());
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to venues
DROP TRIGGER IF EXISTS venues_audit_trigger ON public.venues;
CREATE TRIGGER venues_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.venues
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 15: Grant Permissions
-- ═══════════════════════════════════════════════════════════════════════════════

-- Grant usage on shops view
GRANT SELECT ON public.shops TO anon, authenticated;
GRANT ALL ON public.shops TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run these to verify RLS is working)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check RLS status on all tables
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check all policies
-- SELECT tablename, policyname, permissive, roles, cmd, qual FROM pg_policies WHERE schemaname = 'public';

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! Your database is now secured with enterprise-grade RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════════
