-- VibeCity Entertainment Map Database Schema & Seed Data
-- Run this script in Supabase SQL Editor

-- ============================================
-- 1. CREATE TABLES (if not exists)
-- ============================================

-- Shops/Venues Table
CREATE TABLE IF NOT EXISTS shops (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    vibe_info TEXT,
    crowd_info VARCHAR(100),
    open_time VARCHAR(10),
    close_time VARCHAR(10),
    status VARCHAR(20) DEFAULT 'AUTO',
    video_url TEXT,
    image_url_1 TEXT,
    image_url_2 TEXT,
    golden_time VARCHAR(10),
    end_golden_time VARCHAR(10),
    promotion_info TEXT,
    promotion_endtime TIMESTAMP,
    province VARCHAR(100) DEFAULT 'กรุงเทพฯ',
    zone VARCHAR(100),
    building VARCHAR(100),
    floor VARCHAR(20),
    category_color VARCHAR(20),
    indoor_zone_no VARCHAR(20),
    event_name VARCHAR(255),
    event_datetime TIMESTAMP,
    is_promoted BOOLEAN DEFAULT FALSE,
    ig_url TEXT,
    fb_url TEXT,
    tiktok_url TEXT,
    phone VARCHAR(50),
    website TEXT,
    description TEXT,
    is_giant_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Buildings Table (for Giant Pins / Malls)
-- NOTE: latitude/longitude added for map positioning
CREATE TABLE IF NOT EXISTS buildings (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    province VARCHAR(100),
    floors JSONB,
    data JSONB,
    is_giant_active BOOLEAN DEFAULT TRUE,
    icon TEXT,
    short_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add missing columns if they don't exist (for existing tables)
DO $$
BEGIN
    -- Geo columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'latitude') THEN
        ALTER TABLE buildings ADD COLUMN latitude DECIMAL(10, 7);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'longitude') THEN
        ALTER TABLE buildings ADD COLUMN longitude DECIMAL(10, 7);
    END IF;
    -- Province column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'province') THEN
        ALTER TABLE buildings ADD COLUMN province VARCHAR(100);
    END IF;
    -- Display columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'is_giant_active') THEN
        ALTER TABLE buildings ADD COLUMN is_giant_active BOOLEAN DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'icon') THEN
        ALTER TABLE buildings ADD COLUMN icon TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'short_name') THEN
        ALTER TABLE buildings ADD COLUMN short_name VARCHAR(100);
    END IF;
    -- Data columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'floors') THEN
        ALTER TABLE buildings ADD COLUMN floors JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'data') THEN
        ALTER TABLE buildings ADD COLUMN data JSONB;
    END IF;
END $$;

-- Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER REFERENCES shops(id),
    user_name VARCHAR(100),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    emoji_reaction VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- User Home Locations (for Take Me Home feature)
-- ✅ Sensitive table: RLS enabled below with user-only access policy
CREATE TABLE IF NOT EXISTS user_home_locations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    address TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Favorites Table
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    shop_id INTEGER REFERENCES shops(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, shop_id)
);

-- View Analytics (for Merchant Dashboard)
CREATE TABLE IF NOT EXISTS shop_views (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER REFERENCES shops(id),
    view_date DATE DEFAULT CURRENT_DATE,
    view_count INTEGER DEFAULT 1,
    unique_visitors INTEGER DEFAULT 1,
    UNIQUE(shop_id, view_date)
);

-- Emergency Locations (for SOS feature)
-- ✅ Added unique constraint on natural key to enable ON CONFLICT upserts
CREATE TABLE IF NOT EXISTS emergency_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'hospital', 'police', 'fire'
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    phone VARCHAR(50),
    province VARCHAR(100),
    address TEXT,
    is_24h BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT emergency_locations_natural_key UNIQUE (name, type, province)
);

-- ============================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_shops_province ON shops(province);
CREATE INDEX IF NOT EXISTS idx_shops_category ON shops(category);
CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status);
CREATE INDEX IF NOT EXISTS idx_shops_location ON shops(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_shops_building ON shops(building);
CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_views_date ON shop_views(shop_id, view_date);
CREATE INDEX IF NOT EXISTS idx_emergency_type ON emergency_locations(type);
CREATE INDEX IF NOT EXISTS idx_emergency_location ON emergency_locations(latitude, longitude);

-- ============================================
-- 3. CREATE RPC FUNCTIONS
-- ============================================

-- Function to get random nearby venues (for 30-shop rotation)
CREATE OR REPLACE FUNCTION get_random_nearby_venues(
    user_lat DECIMAL,
    user_lng DECIMAL,
    radius_km INTEGER DEFAULT 5,
    limit_count INTEGER DEFAULT 30,
    exclude_ids INTEGER[] DEFAULT '{}'
)
RETURNS SETOF shops AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM shops s
    WHERE 
        s.id != ALL(exclude_ids)
        AND (
            -- ✅ Clamp acos argument to [-1, 1] to prevent NaN from floating-point errors
            6371 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians(user_lat)) * cos(radians(s.latitude)) *
                    cos(radians(s.longitude) - radians(user_lng)) +
                    sin(radians(user_lat)) * sin(radians(s.latitude))
                ))
            )
        ) <= radius_km
    ORDER BY 
        CASE WHEN s.status = 'LIVE' THEN 0 ELSE 1 END,
        RANDOM()
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to increment view count
-- ✅ Note: unique_visitors is only set on initial insert (1); 
-- actual unique tracking would require session/user ID logic
CREATE OR REPLACE FUNCTION increment_shop_view(shop_id_param INTEGER)
RETURNS void AS $$
BEGIN
    INSERT INTO shop_views (shop_id, view_date, view_count)
    VALUES (shop_id_param, CURRENT_DATE, 1)
    ON CONFLICT (shop_id, view_date)
    DO UPDATE SET view_count = shop_views.view_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get nearby emergency locations
CREATE OR REPLACE FUNCTION get_nearby_emergency(
    user_lat DECIMAL,
    user_lng DECIMAL,
    emergency_type VARCHAR DEFAULT NULL,
    radius_km INTEGER DEFAULT 10
)
RETURNS TABLE(
    id INTEGER,
    name VARCHAR,
    type VARCHAR,
    latitude DECIMAL,
    longitude DECIMAL,
    phone VARCHAR,
    distance_km DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name,
        e.type,
        e.latitude,
        e.longitude,
        e.phone,
        -- ✅ Clamp acos argument to [-1, 1] to prevent NaN
        (6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
                cos(radians(user_lat)) * cos(radians(e.latitude)) *
                cos(radians(e.longitude) - radians(user_lng)) +
                sin(radians(user_lat)) * sin(radians(e.latitude))
            ))
        ))::DECIMAL AS distance_km
    FROM emergency_locations e
    WHERE 
        (emergency_type IS NULL OR e.type = emergency_type)
        AND (
            6371 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians(user_lat)) * cos(radians(e.latitude)) *
                    cos(radians(e.longitude) - radians(user_lng)) +
                    sin(radians(user_lat)) * sin(radians(e.latitude))
                ))
            )
        ) <= radius_km
    ORDER BY distance_km
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_home_locations ENABLE ROW LEVEL SECURITY;

-- Public read access for shops
CREATE POLICY "Allow public read access on shops" ON shops
    FOR SELECT USING (true);

-- Public read access for buildings
CREATE POLICY "Allow public read access on buildings" ON buildings
    FOR SELECT USING (true);

-- Public read access for reviews
CREATE POLICY "Allow public read access on reviews" ON reviews
    FOR SELECT USING (true);

-- ✅ Favorites: User can only access their own favorites
CREATE POLICY "Users can view their own favorites" ON favorites
    FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert their own favorites" ON favorites
    FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can delete their own favorites" ON favorites
    FOR DELETE USING (user_id = auth.uid()::text);

-- ✅ Shop views: Public read for analytics dashboard, insert via RPC (SECURITY DEFINER)
CREATE POLICY "Allow public read access on shop_views" ON shop_views
    FOR SELECT USING (true);

-- ✅ User home locations: User can only access their own data
CREATE POLICY "Users can view their own home location" ON user_home_locations
    FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert their own home location" ON user_home_locations
    FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update their own home location" ON user_home_locations
    FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete their own home location" ON user_home_locations
    FOR DELETE USING (user_id = auth.uid()::text);

-- Public insert for reviews (anonymous allowed)
CREATE POLICY "Allow public insert on reviews" ON reviews
    FOR INSERT WITH CHECK (true);

-- Public read access for emergency locations
CREATE POLICY "Allow public read access on emergency_locations" ON emergency_locations
    FOR SELECT USING (true);

-- ============================================
-- 5. SEED BUILDINGS DATA (Giant Pins)
-- ============================================

INSERT INTO buildings (id, name, latitude, longitude, province, is_giant_active, icon, short_name, data) VALUES
('oneNimman', 'One Nimman', 18.8001, 98.9682, 'เชียงใหม่', true, '🏢', 'One Nimman', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('maya', 'Maya Lifestyle Shopping Center', 18.8021, 98.9675, 'เชียงใหม่', true, '🏬', 'Maya', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "Rooftop"], "type": "mall"}'),
('thinkPark', 'Think Park', 18.8012, 98.9678, 'เชียงใหม่', true, '🎯', 'Think Park', '{"floors": ["G"], "type": "community_mall"}'),
('centralFestival', 'Central Festival Chiang Mai', 18.7680, 98.9795, 'เชียงใหม่', true, '🛍️', 'Central Festival', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('centralAirport', 'Central Airport Plaza', 18.7715, 99.0045, 'เชียงใหม่', true, '✈️', 'Central Airport', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('kadSuanKaew', 'Kad Suan Kaew', 18.7925, 98.9675, 'เชียงใหม่', true, '🌸', 'Kad Suan Kaew', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('promenada', 'Promenada Resort Mall', 18.7560, 99.0255, 'เชียงใหม่', true, '🌴', 'Promenada', '{"floors": ["G", "1F"], "type": "mall"}'),
('campNimman', 'Camp Nimman', 18.7958, 98.9672, 'เชียงใหม่', true, '🏕️', 'Camp', '{"floors": ["G"], "type": "community_mall"}'),
('siamParagon', 'Siam Paragon', 13.7462, 100.5348, 'กรุงเทพฯ', true, '💎', 'Paragon', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "5F"], "type": "mall"}'),
('centralWorld', 'Central World', 13.7466, 100.5392, 'กรุงเทพฯ', true, '🌍', 'Central World', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "5F", "6F", "7F"], "type": "mall"}'),
('iconsiam', 'ICONSIAM', 13.7265, 100.5105, 'กรุงเทพฯ', true, '🏛️', 'ICONSIAM', '{"floors": ["B1", "G", "M", "1F", "2F", "3F", "4F", "5F", "6F"], "type": "mall"}'),
('jungceylon', 'Jungceylon', 7.8912, 98.2975, 'ภูเก็ต', true, '🌊', 'Jungceylon', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('terminal21Pattaya', 'Terminal 21 Pattaya', 12.9347, 100.8832, 'พัทยา', true, '✈️', 'T21 Pattaya', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F"], "type": "mall"}'),
('centralMarina', 'Central Marina Pattaya', 12.9395, 100.8860, 'พัทยา', true, '⚓', 'Central Marina', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('centralCR', 'Central Plaza Chiang Rai', 19.9135, 99.8408, 'เชียงราย', true, '🏔️', 'Central CR', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('bluportHuaHin', 'Bluport Hua Hin Resort Mall', 12.5685, 99.9488, 'ประจวบ', true, '🌅', 'Bluport', '{"floors": ["G", "1F", "2F"], "type": "mall"}')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    province = EXCLUDED.province,
    is_giant_active = EXCLUDED.is_giant_active,
    icon = EXCLUDED.icon,
    short_name = EXCLUDED.short_name,
    data = EXCLUDED.data;

-- ============================================
-- 6. SEED EMERGENCY LOCATIONS
-- ============================================

INSERT INTO emergency_locations (name, type, latitude, longitude, phone, province, is_24h) VALUES
-- เชียงใหม่
('โรงพยาบาลมหาราชนครเชียงใหม่', 'hospital', 18.7892, 98.9735, '053-936150', 'เชียงใหม่', true),
('โรงพยาบาลเชียงใหม่ราม', 'hospital', 18.7945, 98.9775, '053-920300', 'เชียงใหม่', true),
('โรงพยาบาลลานนา', 'hospital', 18.7785, 98.9925, '053-999777', 'เชียงใหม่', true),
('สถานีตำรวจภูธรเมืองเชียงใหม่', 'police', 18.7875, 98.9855, '053-276040', 'เชียงใหม่', true),
('สถานีตำรวจท่องเที่ยวเชียงใหม่', 'police', 18.7890, 98.9870, '1155', 'เชียงใหม่', true),
-- กรุงเทพฯ
('โรงพยาบาลบำรุงราษฎร์', 'hospital', 13.7455, 100.5525, '02-066-8888', 'กรุงเทพฯ', true),
('โรงพยาบาลกรุงเทพ', 'hospital', 13.7285, 100.5515, '02-310-3000', 'กรุงเทพฯ', true),
('โรงพยาบาลศิริราช', 'hospital', 13.7595, 100.4855, '02-419-7000', 'กรุงเทพฯ', true),
('สถานีตำรวจท่องเที่ยว สยาม', 'police', 13.7465, 100.5365, '1155', 'กรุงเทพฯ', true),
('สถานีตำรวจนครบาลปทุมวัน', 'police', 13.7455, 100.5345, '02-251-4995', 'กรุงเทพฯ', true),
-- ภูเก็ต
('โรงพยาบาลกรุงเทพภูเก็ต', 'hospital', 7.8815, 98.3885, '076-254425', 'ภูเก็ต', true),
('โรงพยาบาลวชิระภูเก็ต', 'hospital', 7.8825, 98.3925, '076-361234', 'ภูเก็ต', true),
('สถานีตำรวจท่องเที่ยวป่าตอง', 'police', 7.8875, 98.2955, '1155', 'ภูเก็ต', true),
-- พัทยา
('โรงพยาบาลกรุงเทพพัทยา', 'hospital', 12.9285, 100.8745, '038-259999', 'พัทยา', true),
('โรงพยาบาลพัทยาเมมโมเรียล', 'hospital', 12.9355, 100.8825, '038-488777', 'พัทยา', true),
('สถานีตำรวจท่องเที่ยวพัทยา', 'police', 12.9295, 100.8715, '1155', 'พัทยา', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- 7. VERIFY DATA
-- ============================================

-- Check counts
SELECT 'shops' as table_name, COUNT(*) as count FROM shops
UNION ALL
SELECT 'buildings', COUNT(*) FROM buildings
UNION ALL
SELECT 'emergency_locations', COUNT(*) FROM emergency_locations;
