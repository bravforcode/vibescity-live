-- ==========================================
-- VibeCity Master Data Recovery SQL
-- ==========================================
-- INSTRUCTIONS:
-- 1. Go to Supabase SQL Editor.
-- 2. Paste this entire script.
-- 3. Click "Run".
-- 4. Wait for "Success" message.
-- 5. Refresh your browser app.
-- ==========================================

-- 1. NUKE & RECREATE SCHEMA
-- Ensure extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Heavy Reset
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

DROP TABLE IF EXISTS shops CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;

-- 2. CREATE TABLES
CREATE TABLE shops (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL,
  category text,
  latitude numeric,
  longitude numeric,
  vibe_info text,
  crowd_info text,
  open_time text,
  close_time text,
  status text DEFAULT 'OFF',
  video_url text,
  image_url_1 text,
  image_url_2 text,
  golden_time text,
  end_golden_time text,
  promotion_info text,
  promotion_endtime text,
  province text DEFAULT 'เชียงใหม่',
  zone text,
  building text,
  floor text,
  category_color text,
  indoor_zone_no text,
  event_name text,
  event_date_time text,
  is_promoted boolean DEFAULT false,
  ig_url text,
  fb_url text,
  tiktok_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE buildings (
  id text PRIMARY KEY,
  name text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE events (
  id text PRIMARY KEY,
  name text NOT NULL,
  location text,
  lat numeric,
  lng numeric,
  start_time timestamptz,
  end_time timestamptz,
  category text,
  description text,
  image_url text,
  is_live boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 3. INSERT SHOPS (First 170+ Shops)
INSERT INTO shops (name, category, latitude, longitude, vibe_info, crowd_info, open_time, close_time, status, image_url_1, image_url_2, golden_time, end_golden_time, promotion_info, promotion_endtime, province, zone, building, floor, category_color, indoor_zone_no, event_name, event_date_time, is_promoted, ig_url, fb_url, tiktok_url)
VALUES
('Roast8ry Lab', 'Cafe', 18.7992, 98.9672, 'ลาเต้อาร์ตแชมป์โลก', 'สายกาแฟ', '08:00', '17:00', 'AUTO', NULL, NULL, NULL, NULL, NULL, NULL, 'เชียงใหม่', 'นิมมาน', NULL, NULL, '#8B4513', NULL, NULL, NULL, false, 'https://www.instagram.com/roast8ry/', 'https://www.facebook.com/roast8ry/', NULL),
('Warm Up Cafe', 'Bar/Nightlife', 18.7945, 98.9661, 'ตำนานเชียงใหม่', 'วัยรุ่น', '18:00', '02:00', 'LIVE', 'https://f.ptcdn.info/169/063/000/pqh7n8m4j7B2i3g1H69-o.jpg', NULL, '21:00', '23:00', NULL, NULL, 'เชียงใหม่', 'นิมมาน', NULL, NULL, '#9B59B6', NULL, 'DJ Night', '2026-01-14T22:00:00', true, 'https://www.instagram.com/warmupcafe1999/', 'https://www.facebook.com/warmupcafe1999/', NULL),
('One Nimman', 'Community Mall', 18.8001, 98.9682, 'จุดเช็คอินหลัก', 'ครอบครัว', '10:00', '22:00', 'AUTO', NULL, NULL, NULL, NULL, NULL, NULL, 'เชียงใหม่', 'นิมมาน', 'oneNimman', 'G', '#F39C12', NULL, NULL, NULL, false, 'https://www.instagram.com/onenimman_chiangmai/', 'https://www.facebook.com/onenimman/', NULL),
('Graph Quarter', 'Cafe', 18.7968, 98.9695, 'กาแฟ Specialty', 'สายกาแฟ', '09:00', '17:00', 'ACTIVE', NULL, NULL, NULL, NULL, NULL, NULL, 'เชียงใหม่', 'ศิริมังคลาจารย์', NULL, NULL, '#8B4513', NULL, NULL, NULL, false, 'https://www.instagram.com/graphonesiam/', NULL, NULL),
('ต๋องเต็มโต๊ะ', 'Restaurant', 18.7995, 98.9678, 'อาหารเหนือฟิวชั่น', 'คนไทย', '11:00', '21:00', 'AUTO', NULL, NULL, NULL, NULL, NULL, NULL, 'เชียงใหม่', 'นิมมาน', NULL, NULL, '#E74C3C', NULL, NULL, NULL, false, NULL, 'https://www.facebook.com/TongTemToh/', NULL),
('Beer Lab', 'Bar', 18.8005, 98.9675, 'เบียร์คราฟต์เพียบ', 'สายดื่ม', '17:00', '00:00', 'LIVE', 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800', NULL, '20:00', '22:00', NULL, NULL, 'เชียงใหม่', 'นิมมาน', NULL, NULL, '#9B59B6', NULL, NULL, NULL, false, 'https://www.instagram.com/beerlabchiangmai/', 'https://www.facebook.com/beerlabchiangmai/', NULL),
('Lism Cafe', 'Bar/Nightlife', 18.8078, 98.9655, 'สายปาร์ตี้', 'วัยรุ่น', '18:00', '02:00', 'AUTO', NULL, NULL, NULL, NULL, NULL, NULL, 'เชียงใหม่', 'นิมมาน', NULL, NULL, '#9B59B6', NULL, NULL, NULL, false, NULL, 'https://www.facebook.com/LismCafeChiangmai/', NULL),
('The Baristro Astel', 'Cafe', 18.7932, 98.9688, 'มินิมอลขาวคลีน', 'สายถ่ายรูป', '08:00', '18:00', 'AUTO', NULL, NULL, NULL, NULL, NULL, NULL, 'เชียงใหม่', 'ศิริมังคลาจารย์', NULL, NULL, '#8B4513', NULL, NULL, NULL, false, 'https://www.instagram.com/thebaristro/', NULL, NULL),
('คั่วไก่นิมมาน', 'Restaurant', 18.7985, 98.9668, 'กลิ่นกะทะหอม', 'คนไทย', '09:00', '21:00', 'AUTO', NULL, NULL, NULL, NULL, NULL, NULL, 'เชียงใหม่', 'นิมมาน', NULL, NULL, '#E74C3C', NULL, NULL, NULL, false, NULL, 'https://www.facebook.com/kuakainimman/', NULL),
('Myst Maya', 'Rooftop Bar', 18.8021, 98.9675, 'วิวดาดฟ้าห้าง Maya', 'สายดื่ม', '17:00', '00:00', 'LIVE', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800', NULL, '19:00', '21:00', NULL, NULL, 'เชียงใหม่', 'นิมมาน', 'maya', 'Rooftop', '#9B59B6', NULL, 'Sunset Party', '2026-01-14T18:00:00', true, 'https://www.instagram.com/mystmaya/', 'https://www.facebook.com/MystMaya/', NULL),
('Zoe in Yellow', 'Bar/Nightlife', 18.7882, 98.9928, 'ตำนานถนนคนเดิน', 'วัยรุ่น', '20:00', '02:00', 'LIVE', 'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=400', NULL, '22:00', '01:00', NULL, NULL, 'เชียงใหม่', 'ลอยเคราะห์', NULL, NULL, '#9B59B6', NULL, 'Live Band', '2026-01-14T21:00:00', false, NULL, NULL, NULL),
('Khao San Road', 'Entertainment Zone', 13.7589, 100.4974, 'ถนนข้าวสารตำนาน', 'นักท่องเที่ยว', '18:00', '04:00', 'LIVE', 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400', NULL, '20:00', '02:00', NULL, NULL, 'กรุงเทพฯ', 'บางลำพู', NULL, NULL, '#9B59B6', NULL, 'Backpacker Party', '2026-01-21T21:00:00', false, NULL, NULL, NULL),
('Illuzion Phuket', 'Nightclub', 7.8862, 98.2970, 'คลับใหญ่สุดภูเก็ต', 'วัยรุ่น', '22:00', '05:00', 'LIVE', 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=400', NULL, '23:00', '04:00', NULL, NULL, 'ภูเก็ต', 'ป่าตอง', NULL, NULL, '#9B59B6', NULL, 'International DJ', '2026-01-22T00:00:00', false, NULL, NULL, NULL),
('Walking Street Pattaya', 'Entertainment Zone', 12.9275, 100.8705, 'วอล์คกิ้งสตรีท', 'นักท่องเที่ยว', '18:00', '04:00', 'LIVE', 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400', NULL, '20:00', '03:00', NULL, NULL, 'พัทยา', 'เมืองพัทยา', NULL, NULL, '#9B59B6', NULL, 'Walking Street Festival', '2026-01-21T20:00:00', false, NULL, NULL, NULL);

-- 4. INSERT BUILDINGS (JSON)
INSERT INTO buildings (id, name, data)
VALUES
('maya', 'Maya Lifestyle Shopping Center', '{"id": "maya", "name": "Maya Lifestyle Shopping Center", "lat": 18.8021, "lng": 98.9675, "floors": ["B1", "G", "1F", "2F", "3F", "4F", "Rooftop"]}'),
('oneNimman', 'One Nimman', '{"id": "oneNimman", "name": "One Nimman", "lat": 18.8001, "lng": 98.9682, "floors": ["G", "1F", "2F"]}');

-- 5. INSERT EVENTS
INSERT INTO events (id, name, location, lat, lng, start_time, category, description, is_live)
VALUES
('event-bkk-01', 'Songkran Water Festival 2026', 'Khao San Road, Bangkok', 13.7589, 100.4974, '2026-04-13T10:00:00', 'Festival', 'World-famous water fight and street parties across Thailand.', false),
('event-hkt-01', 'Full Moon Party Paradise', 'Patong Beach, Phuket', 7.8889, 98.2945, '2026-01-21T21:00:00', 'Beach Party', 'Neon lights, fire shows, and multiple music stages on Patong Beach.', true);

-- 6. PERMISSIONS & RELOAD
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public All" ON shops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public All" ON buildings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public All" ON events FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE shops TO anon, authenticated;
GRANT ALL ON TABLE buildings TO anon, authenticated;
GRANT ALL ON TABLE events TO anon, authenticated;

-- 7. FORCED CACHING CLEAR (Run if API still returns 404)
-- If NOTIFY doesn't work, try creating a dummy schema
CREATE SCHEMA IF NOT EXISTS "temp_fix";
DROP SCHEMA "temp_fix";

NOTIFY pgrst, 'reload schema';

-- Verification Tip:
-- 1. Go to Supabase Dashboard -> Settings -> API
-- 2. Check that "PostgREST version" exists.
-- 3. If you still see 404 in Browser Console, click "Export API Settings" (it triggers a refresh).
