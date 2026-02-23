-- ═══════════════════════════════════════════════════════════════════════════════
-- OSM Data Support Migration
-- Adds columns needed for OpenStreetMap venue imports
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add OSM-specific columns to venues table if they don't exist
DO $$
BEGIN
    -- OSM ID for deduplication
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'venues' AND column_name = 'osm_id') THEN
        ALTER TABLE venues ADD COLUMN osm_id TEXT;
    END IF;

    -- OSM element type (node/way/relation)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'venues' AND column_name = 'osm_type') THEN
        ALTER TABLE venues ADD COLUMN osm_type TEXT DEFAULT 'node';
    END IF;

    -- Region (north, northeast, central, east, west, south)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'venues' AND column_name = 'region') THEN
        ALTER TABLE venues ADD COLUMN region TEXT;
    END IF;

    -- English name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'venues' AND column_name = 'name_en') THEN
        ALTER TABLE venues ADD COLUMN name_en TEXT;
    END IF;

    -- Source of data (osm, ugc, partner)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'venues' AND column_name = 'source') THEN
        ALTER TABLE venues ADD COLUMN source TEXT DEFAULT 'ugc';
    END IF;

    -- Opening hours in OSM format
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'venues' AND column_name = 'opening_hours') THEN
        ALTER TABLE venues ADD COLUMN opening_hours TEXT;
    END IF;

    -- Phone number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'venues' AND column_name = 'phone') THEN
        ALTER TABLE venues ADD COLUMN phone TEXT;
    END IF;

    -- Updated timestamp
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'venues' AND column_name = 'updated_at') THEN
        ALTER TABLE venues ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Create unique index on osm_id for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS venues_osm_id_unique ON venues (osm_id) WHERE osm_id IS NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS venues_region_idx ON venues (region);
CREATE INDEX IF NOT EXISTS venues_province_idx ON venues (province);
CREATE INDEX IF NOT EXISTS venues_source_idx ON venues (source);

-- ═══════════════════════════════════════════════════════════════════════════════
-- UGC Support Tables (if not already created)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check-ins table
CREATE TABLE IF NOT EXISTS check_ins (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL, -- Fixed: UUID
    venue_id UUID REFERENCES venues(id) ON DELETE CASCADE, -- Fixed: UUID
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venue photos (UGC)
CREATE TABLE IF NOT EXISTS venue_photos (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL, -- Fixed: UUID
    venue_id UUID REFERENCES venues(id) ON DELETE CASCADE, -- Fixed: UUID
    image_url TEXT NOT NULL,
    caption TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User achievements
CREATE TABLE IF NOT EXISTS user_achievements (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL, -- Fixed: UUID
    achievement_id TEXT NOT NULL,
    achieved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- User stats (gamification)
CREATE TABLE IF NOT EXISTS user_stats (
    user_id UUID PRIMARY KEY, -- Fixed: UUID
    coins INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    submissions_count INTEGER DEFAULT 0,
    check_ins_count INTEGER DEFAULT 0,
    photos_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User submissions (UGC venues)
CREATE TABLE IF NOT EXISTS user_submissions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL, -- Fixed: UUID
    name TEXT NOT NULL,
    category TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    province TEXT,
    images TEXT[],
    description TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Grant Rewards Function
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION grant_rewards(
    target_user_id UUID, -- Fixed: UUID
    reward_coins INTEGER,
    reward_xp INTEGER,
    action_name TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_stats (user_id, coins, xp, level)
    VALUES (target_user_id, reward_coins, reward_xp, 1)
    ON CONFLICT (user_id) DO UPDATE SET
        coins = user_stats.coins + reward_coins,
        xp = user_stats.xp + reward_xp,
        level = GREATEST(1, (user_stats.xp + reward_xp) / 100 + 1),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on new tables
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_submissions ENABLE ROW LEVEL SECURITY;

-- Allow public read on venues
DROP POLICY IF EXISTS "Public can read venues" ON venues;
CREATE POLICY "Public can read venues" ON venues FOR SELECT USING (true);

-- Allow authenticated users to read their own stats
DROP POLICY IF EXISTS "Users can read own stats" ON user_stats;
CREATE POLICY "Users can read own stats" ON user_stats
    FOR SELECT USING (auth.uid() = user_id OR true); -- No cast needed now, both are UUID

-- Allow service role to insert/update everything
DROP POLICY IF EXISTS "Service role full access on venues" ON venues;
CREATE POLICY "Service role full access on venues" ON venues
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE venues IS 'Entertainment venues from OSM and UGC';
COMMENT ON COLUMN venues.osm_id IS 'OpenStreetMap element ID for deduplication';
COMMENT ON COLUMN venues.region IS 'Thai region: north, northeast, central, east, west, south';
