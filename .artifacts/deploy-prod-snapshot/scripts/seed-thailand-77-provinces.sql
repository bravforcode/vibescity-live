-- ============================================
-- VibeCity Thailand 77 Provinces Entertainment Data
-- Run this AFTER seed-database.sql to add comprehensive data
-- Version: 2.0 - Fixed column additions
-- ============================================
-- 
-- 📊 COVERAGE SUMMARY:
-- ┌──────────────────────────────────────┐
-- │ Buildings/Malls: ~100+ locations     │
-- │ Shops/Venues:    ~350+ locations     │
-- │ Categories:                          │
-- │   - Nightclubs, Bars, Rooftop Bars   │
-- │   - Cafes, Restaurants               │
-- │   - Beach Clubs, Beaches             │
-- │   - Markets, Walking Streets         │
-- │   - Temples, Attractions             │
-- │   - Shopping Malls                   │
-- │ Emergency:       ~50+ locations      │
-- │ Provinces:       77 จังหวัด          │
-- └──────────────────────────────────────┘
--
-- Regions covered:
-- ภาคเหนือ    (Northern)      - 17 จังหวัด
-- ภาคกลาง    (Central)       - 22 จังหวัด  
-- ภาคตะวันออก (Eastern)       - 7 จังหวัด
-- ภาคตะวันตก  (Western)       - 5 จังหวัด
-- ภาคอีสาน   (Northeastern)  - 20 จังหวัด
-- ภาคใต้     (Southern)      - 14 จังหวัด
-- ============================================

-- ============================================
-- 1. FIX: Add missing columns to buildings and shops tables
-- ============================================
DO $$
BEGIN
    -- ========== BUILDINGS TABLE ==========
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'latitude') THEN
        ALTER TABLE buildings ADD COLUMN latitude DECIMAL(10, 7);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'longitude') THEN
        ALTER TABLE buildings ADD COLUMN longitude DECIMAL(10, 7);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'province') THEN
        ALTER TABLE buildings ADD COLUMN province VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'is_giant_active') THEN
        ALTER TABLE buildings ADD COLUMN is_giant_active BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'icon') THEN
        ALTER TABLE buildings ADD COLUMN icon VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'short_name') THEN
        ALTER TABLE buildings ADD COLUMN short_name VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'data') THEN
        ALTER TABLE buildings ADD COLUMN data JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'floors') THEN
        ALTER TABLE buildings ADD COLUMN floors JSONB;
    END IF;
    
    -- ========== SHOPS TABLE ==========
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'is_giant_active') THEN
        ALTER TABLE shops ADD COLUMN is_giant_active BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'province') THEN
        ALTER TABLE shops ADD COLUMN province VARCHAR(100) DEFAULT 'กรุงเทพฯ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'zone') THEN
        ALTER TABLE shops ADD COLUMN zone VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'category_color') THEN
        ALTER TABLE shops ADD COLUMN category_color VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'vibe_info') THEN
        ALTER TABLE shops ADD COLUMN vibe_info TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'crowd_info') THEN
        ALTER TABLE shops ADD COLUMN crowd_info VARCHAR(100);
    END IF;
END $$;

-- ============================================
-- 2. CLEAR EXISTING DATA (Optional - comment out if appending)
-- ============================================
-- TRUNCATE TABLE shops RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE buildings CASCADE;

-- ============================================
-- 3. SEED BUILDINGS/MALLS (Giant Pins) - ALL REGIONS
-- ============================================

INSERT INTO buildings (id, name, latitude, longitude, province, is_giant_active, icon, short_name, data) VALUES
-- ==================== ภาคเหนือ (Northern Thailand) ====================
-- เชียงใหม่
('oneNimman', 'One Nimman', 18.8001, 98.9682, 'เชียงใหม่', true, '🏢', 'One Nimman', '{"floors": ["G", "1F", "2F"], "type": "community_mall"}'),
('maya', 'Maya Lifestyle Shopping Center', 18.8021, 98.9675, 'เชียงใหม่', true, '🏬', 'Maya', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "Rooftop"], "type": "mall"}'),
('centralFestivalCNX', 'Central Festival Chiang Mai', 18.7680, 98.9795, 'เชียงใหม่', true, '🛍️', 'Central CNX', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('centralAirportCNX', 'Central Airport Plaza', 18.7715, 99.0045, 'เชียงใหม่', true, '✈️', 'Airport Plaza', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('promenadaCNX', 'Promenada Resort Mall', 18.7560, 99.0255, 'เชียงใหม่', true, '🌴', 'Promenada', '{"floors": ["G", "1F"], "type": "mall"}'),
('kadSuanKaew', 'Kad Suan Kaew', 18.7925, 98.9675, 'เชียงใหม่', true, '🌸', 'KSK', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- เชียงราย
('centralCR', 'Central Chiang Rai', 19.9135, 99.8408, 'เชียงราย', true, '🏔️', 'Central CR', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- ลำปาง
('centralLampang', 'Central Lampang', 18.2888, 99.4908, 'ลำปาง', true, '🏛️', 'Central LP', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- พิษณุโลก
('centralPlazaPL', 'Central Plaza Phitsanulok', 16.8211, 100.2659, 'พิษณุโลก', true, '🏬', 'Central PL', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- นครสวรรค์
('vSquareNS', 'V Square Nakhon Sawan', 15.7047, 100.1367, 'นครสวรรค์', true, '🏢', 'V Square', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- แพร่
('bigCPhrae', 'Big C Phrae', 18.1445, 100.1414, 'แพร่', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- น่าน
('bigCNan', 'Big C Nan', 18.7756, 100.7730, 'น่าน', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ลำพูน
('bigCLamphun', 'Big C Lamphun', 18.5745, 99.0085, 'ลำพูน', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- เพชรบูรณ์
('robinsonPhetchabun', 'Robinson Phetchabun', 16.4185, 101.1555, 'เพชรบูรณ์', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- อุทัยธานี
('bigCUthaiThani', 'Big C Uthai Thani', 15.3825, 100.0255, 'อุทัยธานี', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),

-- ==================== ภาคกลาง (Central Thailand) ====================
-- กรุงเทพฯ
('siamParagon', 'Siam Paragon', 13.7462, 100.5348, 'กรุงเทพฯ', true, '💎', 'Paragon', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "5F"], "type": "luxury_mall"}'),
('centralWorld', 'CentralWorld', 13.7466, 100.5392, 'กรุงเทพฯ', true, '🌍', 'CentralWorld', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "5F", "6F", "7F"], "type": "mega_mall"}'),
('iconsiam', 'ICONSIAM', 13.7265, 100.5105, 'กรุงเทพฯ', true, '🏛️', 'ICONSIAM', '{"floors": ["B1", "G", "M", "1F", "2F", "3F", "4F", "5F", "6F"], "type": "luxury_mall"}'),
('emquartier', 'EmQuartier', 13.7308, 100.5695, 'กรุงเทพฯ', true, '✨', 'EmQuartier', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "5F"], "type": "luxury_mall"}'),
('emporium', 'Emporium', 13.7305, 100.5695, 'กรุงเทพฯ', true, '👑', 'Emporium', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "5F"], "type": "luxury_mall"}'),
('terminal21Asok', 'Terminal 21 Asok', 13.7377, 100.5603, 'กรุงเทพฯ', true, '✈️', 'T21 Asok', '{"floors": ["B1", "G", "M", "1F", "2F", "3F", "4F", "5F", "6F"], "type": "mall"}'),
('mbkCenter', 'MBK Center', 13.7444, 100.5300, 'กรุงเทพฯ', true, '🏬', 'MBK', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F", "6F", "7F"], "type": "mall"}'),
('siamCenter', 'Siam Center', 13.7458, 100.5322, 'กรุงเทพฯ', true, '🎨', 'Siam Center', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('siamDiscovery', 'Siam Discovery', 13.7465, 100.5305, 'กรุงเทพฯ', true, '🔬', 'Discovery', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('gaysornVillage', 'Gaysorn Village', 13.7455, 100.5402, 'กรุงเทพฯ', true, '💫', 'Gaysorn', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F"], "type": "luxury_mall"}'),
('centralEmbassy', 'Central Embassy', 13.7445, 100.5465, 'กรุงเทพฯ', true, '🏰', 'Embassy', '{"floors": ["B1", "G", "1F", "2F", "3F", "4F", "5F", "6F"], "type": "luxury_mall"}'),
('centralLadprao', 'Central Ladprao', 13.8167, 100.5619, 'กรุงเทพฯ', true, '🏬', 'Central LP', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F"], "type": "mall"}'),
('megaBangna', 'Mega Bangna', 13.6510, 100.7149, 'กรุงเทพฯ', true, '🛒', 'Mega Bangna', '{"floors": ["G", "1F", "2F"], "type": "mega_mall"}'),
('fashionIsland', 'Fashion Island', 13.8445, 100.6298, 'กรุงเทพฯ', true, '🏝️', 'Fashion Island', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('seaconSquare', 'Seacon Square', 13.7265, 100.6548, 'กรุงเทพฯ', true, '🌊', 'Seacon', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('futureRangsit', 'Future Park Rangsit', 13.9885, 100.6155, 'กรุงเทพฯ', true, '🚀', 'Future Park', '{"floors": ["G", "1F", "2F", "3F"], "type": "mega_mall"}'),
('centralRama9', 'Central Rama 9', 13.7582, 100.5685, 'กรุงเทพฯ', true, '🏬', 'Central R9', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F", "6F"], "type": "mall"}'),
('centralBangna', 'Central Bangna', 13.6642, 100.6068, 'กรุงเทพฯ', true, '🏬', 'Central BN', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('centralPinklao', 'Central Pinklao', 13.7785, 100.4668, 'กรุงเทพฯ', true, '🏬', 'Central PK', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F"], "type": "mall"}'),
('centralWestgate', 'CentralPlaza WestGate', 13.8775, 100.4098, 'กรุงเทพฯ', true, '🚪', 'WestGate', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F"], "type": "mall"}'),
('theMallBangkapi', 'The Mall Bangkapi', 13.7648, 100.6425, 'กรุงเทพฯ', true, '🏬', 'The Mall', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
-- นนทบุรี
('centralWestGateNT', 'Central WestGate', 13.8775, 100.4098, 'นนทบุรี', true, '🚪', 'WestGate', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F"], "type": "mall"}'),
('centralRattanathibet', 'Central Rattanathibet', 13.8595, 100.4215, 'นนทบุรี', true, '🏬', 'Central RT', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- ปทุมธานี
('futureRangsitPT', 'Future Park Rangsit', 13.9885, 100.6155, 'ปทุมธานี', true, '🚀', 'Future Park', '{"floors": ["G", "1F", "2F", "3F"], "type": "mega_mall"}'),
('zpellRangsit', 'Zpell@Future Park', 13.9872, 100.6175, 'ปทุมธานี', true, '⚡', 'Zpell', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- สมุทรปราการ
('megaBangnaSP', 'Mega Bangna', 13.6510, 100.7149, 'สมุทรปราการ', true, '🛒', 'Mega', '{"floors": ["G", "1F", "2F"], "type": "mega_mall"}'),
('centralBangnaSP', 'Central Bangna', 13.6642, 100.6068, 'สมุทรปราการ', true, '🏬', 'Central BN', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
-- นครปฐม
('centralSalaya', 'Central Salaya', 13.7948, 100.3215, 'นครปฐม', true, '🏬', 'Central SL', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- พระนครศรีอยุธยา
('ayutthayaCity', 'Ayutthaya City Park', 14.3545, 100.5685, 'พระนครศรีอยุธยา', true, '🏯', 'City Park', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('centralAyutthaya', 'Central Ayutthaya', 14.3512, 100.5702, 'พระนครศรีอยุธยา', true, '🏬', 'Central AY', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- สระบุรี
('robinsonSaraburi', 'Robinson Saraburi', 14.5285, 100.9145, 'สระบุรี', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- ลพบุรี
('robinsonLopburi', 'Robinson Lopburi', 14.8005, 100.6148, 'ลพบุรี', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- สิงห์บุรี
('bigCSingBuri', 'Big C Sing Buri', 14.8915, 100.3975, 'สิงห์บุรี', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- อ่างทอง
('bigCAngThong', 'Big C Ang Thong', 14.5895, 100.4525, 'อ่างทอง', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ชัยนาท
('bigCChaiNat', 'Big C Chai Nat', 15.1855, 100.1255, 'ชัยนาท', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- สมุทรสาคร
('centralMahachai', 'Central Mahachai', 13.5475, 100.2745, 'สมุทรสาคร', true, '🏬', 'Central', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- สมุทรสงคราม
('bigCSamutSongkhram', 'Big C Samut Songkhram', 13.4125, 99.9985, 'สมุทรสงคราม', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- นครนายก
('bigCNakhonNayok', 'Big C Nakhon Nayok', 14.2055, 101.2135, 'นครนายก', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ปราจีนบุรี
('robinsonPrachinBuri', 'Robinson Prachin Buri', 14.0505, 101.3715, 'ปราจีนบุรี', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- สระแก้ว
('bigCSaKaeo', 'Big C Sa Kaeo', 13.8245, 102.0645, 'สระแก้ว', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),

-- ==================== ภาคตะวันออก (Eastern Thailand) ====================
-- ชลบุรี/พัทยา
('terminal21Pattaya', 'Terminal 21 Pattaya', 12.9347, 100.8832, 'ชลบุรี', true, '✈️', 'T21 Pattaya', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F"], "type": "mall"}'),
('centralMarina', 'Central Marina Pattaya', 12.9395, 100.8860, 'ชลบุรี', true, '⚓', 'Central Marina', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('centralPattaya', 'Central Pattaya', 12.9285, 100.8775, 'ชลบุรี', true, '🏬', 'Central PTY', '{"floors": ["G", "1F", "2F", "3F", "4F", "5F"], "type": "mall"}'),
('royalGarden', 'Royal Garden Plaza', 12.9305, 100.8745, 'ชลบุรี', true, '👑', 'Royal Garden', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('harborPattaya', 'Harbor Pattaya', 12.9188, 100.8695, 'ชลบุรี', true, '⚓', 'Harbor', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('centralChonburi', 'Central Chonburi', 13.3611, 100.9848, 'ชลบุรี', true, '🏬', 'Central CB', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- ระยอง
('centralRayong', 'Central Rayong', 12.6815, 101.2775, 'ระยอง', true, '🏬', 'Central RY', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('passioneShopping', 'Passione Shopping Destination', 12.6785, 101.2805, 'ระยอง', true, '💕', 'Passione', '{"floors": ["G", "1F"], "type": "mall"}'),
-- ฉะเชิงเทรา
('robinsonChachoengsao', 'Robinson Chachoengsao', 13.6905, 101.0715, 'ฉะเชิงเทรา', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- จันทบุรี
('centralChanthaburi', 'Central Chanthaburi', 12.6115, 102.1045, 'จันทบุรี', true, '🏬', 'Central CT', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- ตราด
('bigCTrat', 'Big C Trat', 12.2425, 102.5155, 'ตราด', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),

-- ==================== ภาคตะวันตก (Western Thailand) ====================
-- กาญจนบุรี
('robinsonKanchanaburi', 'Robinson Kanchanaburi', 14.0225, 99.5355, 'กาญจนบุรี', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- ราชบุรี
('bluportRatchaburi', 'The Walk Ratchaburi', 13.5365, 99.8175, 'ราชบุรี', true, '🚶', 'The Walk', '{"floors": ["G", "1F"], "type": "mall"}'),
-- สุพรรณบุรี
('robinsonSuphanBuri', 'Robinson Suphan Buri', 14.4745, 100.1285, 'สุพรรณบุรี', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- เพชรบุรี
('robinsonPetchaburi', 'Robinson Petchaburi', 13.1105, 99.9455, 'เพชรบุรี', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- ประจวบคีรีขันธ์/หัวหิน
('bluportHuaHin', 'Bluport Hua Hin Resort Mall', 12.5685, 99.9488, 'ประจวบคีรีขันธ์', true, '🌅', 'Bluport', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('marketVillageHuaHin', 'Market Village Hua Hin', 12.5715, 99.9525, 'ประจวบคีรีขันธ์', true, '🏘️', 'Market Village', '{"floors": ["G", "1F"], "type": "mall"}'),

-- ==================== ภาคอีสาน (Northeastern Thailand) ====================
-- นครราชสีมา (โคราช)
('terminalKorat', 'Terminal 21 Korat', 14.9785, 102.0975, 'นครราชสีมา', true, '✈️', 'T21 Korat', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('centralKorat', 'Central Korat', 14.9725, 102.0855, 'นครราชสีมา', true, '🏬', 'Central Korat', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('theMallKorat', 'The Mall Korat', 14.9695, 102.0945, 'นครราชสีมา', true, '🏬', 'The Mall', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- ขอนแก่น
('centralKhonKaen', 'Central Khon Kaen', 16.4325, 102.8365, 'ขอนแก่น', true, '🏬', 'Central KK', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('centralPlazaKK', 'CentralPlaza Khon Kaen', 16.4265, 102.8295, 'ขอนแก่น', true, '🏬', 'CentralPlaza', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- อุดรธานี
('centralUdon', 'Central Udon', 17.4155, 102.7875, 'อุดรธานี', true, '🏬', 'Central UD', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('udTown', 'UD Town', 17.4125, 102.7915, 'อุดรธานี', true, '🏘️', 'UD Town', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- อุบลราชธานี
('centralUbon', 'Central Ubon', 15.2285, 104.8565, 'อุบลราชธานี', true, '🏬', 'Central UB', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('suneeGrand', 'Sunee Grand', 15.2315, 104.8505, 'อุบลราชธานี', true, '☀️', 'Sunee Grand', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- สุรินทร์
('robinsonSurin', 'Robinson Surin', 14.8825, 103.4905, 'สุรินทร์', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- บุรีรัมย์
('robinsonBuriram', 'Robinson Buriram', 14.9945, 103.1025, 'บุรีรัมย์', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- ร้อยเอ็ด
('bigCRoiEt', 'Big C Roi Et', 16.0545, 103.6515, 'ร้อยเอ็ด', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- มหาสารคาม
('robinsonMahaSarakham', 'Robinson Maha Sarakham', 16.1825, 103.3005, 'มหาสารคาม', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- กาฬสินธุ์
('bigCKalasin', 'Big C Kalasin', 16.4325, 103.5065, 'กาฬสินธุ์', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- สกลนคร
('robinsonSakonNakhon', 'Robinson Sakon Nakhon', 17.1565, 104.1485, 'สกลนคร', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- นครพนม
('bigCNakhonPhanom', 'Big C Nakhon Phanom', 17.4085, 104.7825, 'นครพนม', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- มุกดาหาร
('bigCMukdahan', 'Big C Mukdahan', 16.5425, 104.7185, 'มุกดาหาร', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ยโสธร
('bigCYasothon', 'Big C Yasothon', 15.7925, 104.1455, 'ยโสธร', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- อำนาจเจริญ
('tescoAmnat', 'Tesco Lotus Amnat Charoen', 15.8625, 104.6285, 'อำนาจเจริญ', true, '🛒', 'Tesco', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ชัยภูมิ
('robinsonChaiyaphum', 'Robinson Chaiyaphum', 15.8065, 102.0315, 'ชัยภูมิ', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- เลย
('bigCLoei', 'Big C Loei', 17.4855, 101.7225, 'เลย', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- หนองคาย
('bigCNongKhai', 'Big C Nong Khai', 17.8785, 102.7425, 'หนองคาย', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- หนองบัวลำภู
('bigCNongBua', 'Big C Nong Bua Lamphu', 17.2045, 102.4415, 'หนองบัวลำภู', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- บึงกาฬ
('bigCBuengKan', 'Big C Bueng Kan', 18.3605, 103.6465, 'บึงกาฬ', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ศรีสะเกษ
('robinsonSrisaket', 'Robinson Si Sa Ket', 15.1185, 104.3225, 'ศรีสะเกษ', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),

-- ==================== ภาคใต้ (Southern Thailand) ====================
-- ภูเก็ต
('jungceylon', 'Jungceylon', 7.8912, 98.2975, 'ภูเก็ต', true, '🌊', 'Jungceylon', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('centralPhuket', 'Central Phuket', 7.8915, 98.3625, 'ภูเก็ต', true, '🏬', 'Central Phuket', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('centralFloresta', 'Central Floresta Phuket', 7.8885, 98.3685, 'ภูเก็ต', true, '🌸', 'Floresta', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
('portoPhuket', 'Porto de Phuket', 7.8875, 98.3025, 'ภูเก็ต', true, '⚓', 'Porto', '{"floors": ["G", "1F"], "type": "community_mall"}'),
-- สุราษฎร์ธานี
('centralSuratthani', 'Central Suratthani', 9.1385, 99.3285, 'สุราษฎร์ธานี', true, '🏬', 'Central ST', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- นครศรีธรรมราช
('centralNakhonSi', 'Central Nakhon Si', 8.4325, 99.9665, 'นครศรีธรรมราช', true, '🏬', 'Central NS', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
-- กระบี่
('vanaKrabi', 'Vana Nava Krabi', 8.0855, 98.9065, 'กระบี่', true, '🌴', 'Vana Nava', '{"floors": ["G", "1F"], "type": "mall"}'),
('bigCKrabi', 'Big C Krabi', 8.0715, 98.9135, 'กระบี่', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ตรัง
('robinsonTrang', 'Robinson Trang', 7.5565, 99.6115, 'ตรัง', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- พังงา
('bigCPhangNga', 'Big C Phang Nga', 8.4505, 98.5275, 'พังงา', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- สงขลา/หาดใหญ่
('centralHatyai', 'Central Hatyai', 7.0085, 100.4765, 'สงขลา', true, '🏬', 'Central HY', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
('leeGardens', 'Lee Gardens Plaza', 7.0065, 100.4715, 'สงขลา', true, '🌳', 'Lee Gardens', '{"floors": ["G", "1F", "2F", "3F"], "type": "mall"}'),
('dianaMall', 'Diana Mall Hatyai', 7.0095, 100.4685, 'สงขลา', true, '👸', 'Diana', '{"floors": ["G", "1F", "2F", "3F", "4F"], "type": "mall"}'),
-- ปัตตานี
('bigCPattani', 'Big C Pattani', 6.8685, 101.2505, 'ปัตตานี', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ยะลา
('bigCYala', 'Big C Yala', 6.5385, 101.2805, 'ยะลา', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- นราธิวาส
('bigCNarathiwat', 'Big C Narathiwat', 6.4255, 101.8235, 'นราธิวาส', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- พัทลุง
('bigCPhatthalung', 'Big C Phatthalung', 7.6165, 100.0785, 'พัทลุง', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- สตูล
('bigCSatun', 'Big C Satun', 6.6235, 100.0675, 'สตูล', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}'),
-- ชุมพร
('robinsonChumphon', 'Robinson Chumphon', 10.4925, 99.1785, 'ชุมพร', true, '🏬', 'Robinson', '{"floors": ["G", "1F", "2F"], "type": "mall"}'),
-- ระนอง
('bigCRanong', 'Big C Ranong', 9.9655, 98.6345, 'ระนอง', true, '🛒', 'Big C', '{"floors": ["G", "1F"], "type": "hypermarket"}')

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
-- 4. SEED SHOPS/VENUES - ALL 77 PROVINCES
-- Categories: Cafe, Bar, Restaurant, Nightclub, Beach Club, Market, Temple, Attraction
-- ============================================

INSERT INTO shops (name, category, latitude, longitude, province, zone, status, open_time, close_time, vibe_info, crowd_info, category_color, is_giant_active) VALUES

-- ==================== ภาคเหนือ (Northern Thailand) ====================

-- เชียงใหม่ (Chiang Mai)
('Warm Up Cafe', 'Bar/Nightlife', 18.7945, 98.9661, 'เชียงใหม่', 'นิมมาน', 'LIVE', '18:00', '02:00', 'ตำนานเชียงใหม่', 'วัยรุ่น', '#9B59B6', false),
('Ristr8to Lab', 'Cafe', 18.7992, 98.9672, 'เชียงใหม่', 'นิมมาน', 'AUTO', '08:00', '17:00', 'ลาเต้อาร์ตแชมป์โลก', 'สายกาแฟ', '#8B4513', false),
('Graph Cafe', 'Cafe', 18.7968, 98.9695, 'เชียงใหม่', 'ศิริมังคลาจารย์', 'AUTO', '09:00', '17:00', 'กาแฟ Specialty', 'สายกาแฟ', '#8B4513', false),
('Beer Lab', 'Bar', 18.8005, 98.9675, 'เชียงใหม่', 'นิมมาน', 'LIVE', '17:00', '00:00', 'เบียร์คราฟต์', 'สายดื่ม', '#9B59B6', false),
('North Gate Jazz Co-op', 'Live Music', 18.7925, 98.9875, 'เชียงใหม่', 'เมืองเก่า', 'LIVE', '19:00', '00:00', 'แจ๊สทุกคืน', 'สายดนตรี', '#9B59B6', false),
('Zoe in Yellow', 'Bar/Nightlife', 18.7882, 98.9928, 'เชียงใหม่', 'ลอยเคราะห์', 'LIVE', '20:00', '02:00', 'ตำนานถนนคนเดิน', 'วัยรุ่น', '#9B59B6', false),
('Akha Ama Coffee', 'Cafe', 18.7895, 98.9875, 'เชียงใหม่', 'เมืองเก่า', 'AUTO', '08:00', '18:00', 'กาแฟชาวเขา', 'สายกาแฟ', '#8B4513', false),
('Huen Phen', 'Restaurant', 18.7870, 98.9895, 'เชียงใหม่', 'เมืองเก่า', 'AUTO', '08:30', '22:00', 'อาหารเหนือดั้งเดิม', 'คนไทย', '#E74C3C', false),
('Doi Suthep', 'Temple', 18.8048, 98.9215, 'เชียงใหม่', 'ดอยสุเทพ', 'AUTO', '06:00', '18:00', 'วัดพระธาตุ', 'นักท่องเที่ยว', '#F39C12', false),
('Sunday Walking Street', 'Market', 18.7908, 98.9860, 'เชียงใหม่', 'เมืองเก่า', 'AUTO', '17:00', '23:00', 'ถนนคนเดินวันอาทิตย์', 'ทุกคน', '#F39C12', false),
('Myst Maya Rooftop', 'Rooftop Bar', 18.8021, 98.9675, 'เชียงใหม่', 'นิมมาน', 'LIVE', '17:00', '00:00', 'วิวดาดฟ้าห้าง Maya', 'สายดื่ม', '#9B59B6', false),
('One Nimman', 'Community Mall', 18.8001, 98.9682, 'เชียงใหม่', 'นิมมาน', 'AUTO', '10:00', '22:00', 'จุดเช็คอินหลัก', 'ครอบครัว', '#F39C12', true),
('Maya Lifestyle', 'Shopping Mall', 18.8021, 98.9675, 'เชียงใหม่', 'นิมมาน', 'AUTO', '10:00', '22:00', 'ห้างสรรพสินค้า', 'ครอบครัว', '#3498DB', true),
('Think Park', 'Community Mall', 18.8012, 98.9678, 'เชียงใหม่', 'นิมมาน', 'AUTO', '10:00', '22:00', 'ลานกิจกรรมนิมมาน', 'วัยรุ่น', '#3498DB', true),
('Spicy Chiangmai', 'Nightclub', 18.7942, 98.9665, 'เชียงใหม่', 'นิมมาน', 'LIVE', '21:00', '02:00', 'คลับดังเชียงใหม่', 'วัยรุ่น', '#9B59B6', false),
('Oxygen Bar', 'Bar', 18.7948, 98.9658, 'เชียงใหม่', 'นิมมาน', 'LIVE', '20:00', '02:00', 'บาร์สุดฮิต', 'วัยรุ่น', '#9B59B6', false),
('Saturday Night Market', 'Market', 18.7845, 98.9925, 'เชียงใหม่', 'วัวลาย', 'AUTO', '17:00', '23:00', 'ถนนคนเดินวันเสาร์', 'ทุกคน', '#F39C12', false),
('Camp Nimman', 'Community Mall', 18.7958, 98.9672, 'เชียงใหม่', 'นิมมาน', 'AUTO', '10:00', '22:00', 'แคมป์นิมมาน', 'ครอบครัว', '#F39C12', true),
('Doi Inthanon', 'Attraction', 18.5875, 98.4865, 'เชียงใหม่', 'ดอยอินทนนท์', 'AUTO', '05:30', '18:00', 'ดอยอินทนนท์', 'สายธรรมชาติ', '#27AE60', false),
('Mon Cham', 'Attraction', 18.9025, 98.8145, 'เชียงใหม่', 'แม่ริม', 'AUTO', '06:00', '18:00', 'ม่อนแจ่ม', 'สายถ่ายรูป', '#27AE60', false),
('Elephant Nature Park', 'Attraction', 19.2025, 98.9255, 'เชียงใหม่', 'แม่แตง', 'AUTO', '08:00', '17:00', 'สถานดูแลช้าง', 'นักท่องเที่ยว', '#27AE60', false),
('Night Safari', 'Attraction', 18.7485, 98.9185, 'เชียงใหม่', 'หางดง', 'AUTO', '11:00', '22:00', 'เชียงใหม่ไนท์ซาฟารี', 'ครอบครัว', '#27AE60', false),
('Royal Flora Ratchaphruek', 'Attraction', 18.7955, 98.8855, 'เชียงใหม่', 'เมือง', 'AUTO', '08:00', '18:00', 'ราชพฤกษ์', 'ครอบครัว', '#27AE60', false),
('Bo Sang Umbrella Village', 'Attraction', 18.7805, 99.0625, 'เชียงใหม่', 'สันกำแพง', 'AUTO', '08:00', '17:00', 'หมู่บ้านร่มบ่อสร้าง', 'นักท่องเที่ยว', '#F39C12', false),

-- เชียงราย (Chiang Rai)
('Chiang Rai Night Bazaar', 'Market', 19.9058, 99.8295, 'เชียงราย', 'เมือง', 'LIVE', '17:00', '23:00', 'ไนท์บาซาร์เชียงราย', 'ทุกคน', '#F39C12', false),
('White Temple', 'Temple', 19.8242, 99.7630, 'เชียงราย', 'เมือง', 'AUTO', '06:30', '18:00', 'วัดร่องขุ่น', 'นักท่องเที่ยว', '#F39C12', false),
('Blue Temple', 'Temple', 19.9318, 99.8768, 'เชียงราย', 'เมือง', 'AUTO', '07:00', '20:00', 'วัดร่องเสือเต้น', 'นักท่องเที่ยว', '#F39C12', false),
('Singha Park', 'Attraction', 19.8455, 99.7250, 'เชียงราย', 'เมือง', 'AUTO', '09:00', '18:00', 'สิงห์ปาร์ค', 'ครอบครัว', '#27AE60', false),
('Baan Dam Museum', 'Attraction', 19.8965, 99.7885, 'เชียงราย', 'เมือง', 'AUTO', '09:00', '17:00', 'บ้านดำ', 'สายศิลปะ', '#F39C12', false),
('Cat n A Cup Cat Cafe', 'Cafe', 19.9085, 99.8325, 'เชียงราย', 'เมือง', 'AUTO', '10:00', '20:00', 'คาเฟ่แมว', 'สายแมว', '#8B4513', false),
('Central Chiang Rai', 'Shopping Mall', 19.9135, 99.8408, 'เชียงราย', 'เมือง', 'AUTO', '10:00', '21:00', 'ศูนย์การค้า', 'ครอบครัว', '#3498DB', true),

-- ลำปาง (Lampang)
('Kad Kong Ta Walking Street', 'Market', 18.2862, 99.4965, 'ลำปาง', 'เมือง', 'AUTO', '16:00', '21:00', 'ถนนคนเดิน', 'ทุกคน', '#F39C12', false),
('Wat Phra That Lampang Luang', 'Temple', 18.2285, 99.3875, 'ลำปาง', 'เกาะคา', 'AUTO', '06:00', '18:00', 'วัดพระธาตุ', 'นักท่องเที่ยว', '#F39C12', false),
('Dhanabadee Ceramic Museum', 'Attraction', 18.2945, 99.4825, 'ลำปาง', 'เมือง', 'AUTO', '08:00', '17:00', 'พิพิธภัณฑ์เซรามิค', 'สายศิลปะ', '#F39C12', false),

-- พิษณุโลก (Phitsanulok)
('Central Plaza Phitsanulok', 'Shopping Mall', 16.8211, 100.2659, 'พิษณุโลก', 'เมือง', 'AUTO', '10:00', '21:00', 'ศูนย์การค้า', 'ครอบครัว', '#3498DB', true),
('Wat Phra Si Rattana Mahathat', 'Temple', 16.8205, 100.2635, 'พิษณุโลก', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดใหญ่', 'นักท่องเที่ยว', '#F39C12', false),
('Chokdee Dimsum', 'Restaurant', 16.8185, 100.2595, 'พิษณุโลก', 'เมือง', 'AUTO', '06:00', '14:00', 'ติ่มซำอร่อย', 'คนท้องถิ่น', '#E74C3C', false),

-- แม่ฮ่องสอน (Mae Hong Son)
('Pai Walking Street', 'Market', 19.3585, 98.4395, 'แม่ฮ่องสอน', 'ปาย', 'AUTO', '17:00', '22:00', 'ถนนคนเดินปาย', 'นักท่องเที่ยว', '#F39C12', false),
('Coffee in Love', 'Cafe', 19.3745, 98.4265, 'แม่ฮ่องสอน', 'ปาย', 'AUTO', '08:00', '18:00', 'คาเฟ่วิวสวย', 'สายถ่ายรูป', '#8B4513', false),
('Pai Canyon', 'Attraction', 19.3155, 98.4685, 'แม่ฮ่องสอน', 'ปาย', 'AUTO', '06:00', '18:00', 'จุดชมวิวปาย', 'นักท่องเที่ยว', '#27AE60', false),

-- น่าน (Nan)
('Nan Walking Street', 'Market', 18.7785, 100.7715, 'น่าน', 'เมือง', 'AUTO', '16:00', '21:00', 'ถนนคนเดิน', 'ทุกคน', '#F39C12', false),
('Wat Phumin', 'Temple', 18.7765, 100.7725, 'น่าน', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดภูมินทร์', 'นักท่องเที่ยว', '#F39C12', false),
('Doi Phu Kha', 'Attraction', 19.1985, 101.0725, 'น่าน', 'ปัว', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติ', 'สายธรรมชาติ', '#27AE60', false),

-- แพร่ (Phrae)
('Khum Wongburi', 'Attraction', 18.1455, 100.1415, 'แพร่', 'เมือง', 'AUTO', '08:30', '16:30', 'บ้านวงศ์บุรี', 'นักท่องเที่ยว', '#F39C12', false),
('Phae Muang Phi', 'Attraction', 18.2085, 100.1125, 'แพร่', 'เมือง', 'AUTO', '06:00', '18:00', 'แพะเมืองผี', 'สายธรรมชาติ', '#27AE60', false),

-- ตาก (Tak)
('Mae Sot Border Market', 'Market', 16.7135, 98.5685, 'ตาก', 'แม่สอด', 'AUTO', '06:00', '18:00', 'ตลาดชายแดน', 'ทุกคน', '#F39C12', false),
('Taksin Maharat Shrine', 'Temple', 16.8755, 99.1285, 'ตาก', 'เมือง', 'AUTO', '06:00', '18:00', 'ศาลสมเด็จพระเจ้าตากสิน', 'นักท่องเที่ยว', '#F39C12', false),

-- สุโขทัย (Sukhothai)
('Sukhothai Historical Park', 'Attraction', 17.0175, 99.7045, 'สุโขทัย', 'เมืองเก่า', 'AUTO', '06:00', '18:00', 'อุทยานประวัติศาสตร์', 'นักท่องเที่ยว', '#F39C12', false),
('Sri Satchanalai Historical Park', 'Attraction', 17.4325, 99.7885, 'สุโขทัย', 'ศรีสัชนาลัย', 'AUTO', '06:00', '18:00', 'อุทยานประวัติศาสตร์', 'นักท่องเที่ยว', '#F39C12', false),

-- อุตรดิตถ์ (Uttaradit)
('Laplae Old Town', 'Attraction', 17.5055, 99.9385, 'อุตรดิตถ์', 'ลับแล', 'AUTO', '08:00', '17:00', 'เมืองลับแล', 'นักท่องเที่ยว', '#F39C12', false),
('Sirikit Dam', 'Attraction', 17.8905, 100.1985, 'อุตรดิตถ์', 'ท่าปลา', 'AUTO', '06:00', '18:00', 'เขื่อนสิริกิติ์', 'ครอบครัว', '#27AE60', false),

-- กำแพงเพชร (Kamphaeng Phet)
('Kamphaeng Phet Historical Park', 'Attraction', 16.4825, 99.5215, 'กำแพงเพชร', 'เมือง', 'AUTO', '06:00', '18:00', 'อุทยานประวัติศาสตร์', 'นักท่องเที่ยว', '#F39C12', false),
('Khlong Lan Waterfall', 'Attraction', 16.1185, 99.2655, 'กำแพงเพชร', 'คลองลาน', 'AUTO', '06:00', '18:00', 'น้ำตกคลองลาน', 'สายธรรมชาติ', '#27AE60', false),

-- พะเยา (Phayao)
('Kwan Phayao Lake', 'Attraction', 19.1825, 99.8775, 'พะเยา', 'เมือง', 'AUTO', '00:00', '23:59', 'กว๊านพะเยา', 'ครอบครัว', '#27AE60', false),
('Wat Tilok Aram', 'Temple', 19.2065, 99.8815, 'พะเยา', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดติโลกอาราม', 'นักท่องเที่ยว', '#F39C12', false),

-- ลำพูน (Lamphun)
('Wat Phra That Hariphunchai', 'Temple', 18.5775, 99.0085, 'ลำพูน', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดพระธาตุหริภุญชัย', 'นักท่องเที่ยว', '#F39C12', false),
('Lamphun Walking Street', 'Market', 18.5755, 99.0095, 'ลำพูน', 'เมือง', 'AUTO', '17:00', '21:00', 'ถนนคนเดินลำพูน', 'ทุกคน', '#F39C12', false),
('Hariphunchai Museum', 'Attraction', 18.5785, 99.0075, 'ลำพูน', 'เมือง', 'AUTO', '09:00', '16:00', 'พิพิธภัณฑ์หริภุญชัย', 'นักท่องเที่ยว', '#F39C12', false),

-- เพชรบูรณ์ (Phetchabun)
('Khao Kho', 'Attraction', 16.5485, 101.0545, 'เพชรบูรณ์', 'เขาค้อ', 'AUTO', '06:00', '18:00', 'เขาค้อ', 'นักท่องเที่ยว', '#27AE60', false),
('Phu Thap Boek', 'Attraction', 16.8925, 101.1055, 'เพชรบูรณ์', 'หล่มเก่า', 'AUTO', '05:00', '18:00', 'ภูทับเบิก', 'สายธรรมชาติ', '#27AE60', false),
('Phu Hin Rong Kla', 'Attraction', 16.9785, 100.9985, 'เพชรบูรณ์', 'นครไทย', 'AUTO', '06:00', '18:00', 'ภูหินร่องกล้า', 'สายธรรมชาติ', '#27AE60', false),
('Robinson Phetchabun', 'Shopping Mall', 16.4185, 101.1555, 'เพชรบูรณ์', 'เมือง', 'AUTO', '10:00', '21:00', 'โรบินสัน', 'ครอบครัว', '#3498DB', true),

-- อุทัยธานี (Uthai Thani)
('Huai Kha Khaeng', 'Attraction', 15.6055, 99.2255, 'อุทัยธานี', 'ลานสัก', 'AUTO', '06:00', '18:00', 'ห้วยขาแข้ง', 'สายธรรมชาติ', '#27AE60', false),
('Wat Tha Sung', 'Temple', 15.3655, 99.9985, 'อุทัยธานี', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดท่าซุง', 'นักท่องเที่ยว', '#F39C12', false),

-- ==================== กรุงเทพฯ และปริมณฑล ====================

-- กรุงเทพฯ (Bangkok)
('Khao San Road', 'Entertainment Zone', 13.7589, 100.4974, 'กรุงเทพฯ', 'บางลำพู', 'LIVE', '18:00', '04:00', 'ถนนข้าวสาร', 'นักท่องเที่ยว', '#9B59B6', false),
('Route 66 RCA', 'Nightclub', 13.7559, 100.5706, 'กรุงเทพฯ', 'RCA', 'LIVE', '21:00', '04:00', 'คลับยอดฮิต', 'วัยรุ่น', '#9B59B6', false),
('Onyx RCA', 'Nightclub', 13.7555, 100.5710, 'กรุงเทพฯ', 'RCA', 'LIVE', '22:00', '05:00', 'EDM Club', 'วัยรุ่น', '#9B59B6', false),
('Sky Bar Lebua', 'Rooftop Bar', 13.7220, 100.5140, 'กรุงเทพฯ', 'สีลม', 'AUTO', '18:00', '01:00', 'บาร์วิว 63 ชั้น', 'คู่รัก', '#9B59B6', false),
('Octave Rooftop', 'Rooftop Bar', 13.7252, 100.5672, 'กรุงเทพฯ', 'ทองหล่อ', 'LIVE', '17:00', '02:00', 'Rooftop 360 องศา', 'สายดื่ม', '#9B59B6', false),
('Thonglor Social', 'Bar', 13.7320, 100.5792, 'กรุงเทพฯ', 'ทองหล่อ', 'LIVE', '18:00', '02:00', 'บาร์หรูทองหล่อ', 'Expats', '#9B59B6', false),
('Demo Bangkok', 'Nightclub', 13.7310, 100.5805, 'กรุงเทพฯ', 'ทองหล่อ', 'LIVE', '22:00', '05:00', 'EDM Club สุดล้ำ', 'วัยรุ่น', '#9B59B6', false),
('ICONSIAM', 'Shopping Mall', 13.7265, 100.5105, 'กรุงเทพฯ', 'คลองสาน', 'AUTO', '10:00', '22:00', 'ห้างริมน้ำ', 'ครอบครัว', '#3498DB', true),
('Siam Paragon', 'Shopping Mall', 13.7462, 100.5348, 'กรุงเทพฯ', 'สยาม', 'AUTO', '10:00', '22:00', 'ห้างหรูสยาม', 'ครอบครัว', '#3498DB', true),
('CentralWorld', 'Shopping Mall', 13.7466, 100.5392, 'กรุงเทพฯ', 'ราชประสงค์', 'AUTO', '10:00', '22:00', 'ห้างใหญ่ที่สุด', 'ครอบครัว', '#3498DB', true),
('Chatuchak Market', 'Market', 13.7999, 100.5503, 'กรุงเทพฯ', 'จตุจักร', 'AUTO', '08:00', '18:00', 'ตลาดนัดจตุจักร', 'ทุกคน', '#F39C12', false),
('Jodd Fairs', 'Night Market', 13.7462, 100.5613, 'กรุงเทพฯ', 'รามอินทรา', 'LIVE', '16:00', '00:00', 'ตลาดนัดจ๊อดแฟร์', 'ทุกคน', '#F39C12', false),
('Asiatique', 'Market', 13.7058, 100.5015, 'กรุงเทพฯ', 'เจริญกรุง', 'LIVE', '16:00', '00:00', 'เอเชียทีค', 'นักท่องเที่ยว', '#F39C12', false),
('Warehouse 30', 'Art/Cafe', 13.7225, 100.5135, 'กรุงเทพฯ', 'เจริญกรุง', 'AUTO', '11:00', '21:00', 'คาเฟ่ศิลปะ', 'สายศิลปะ', '#8B4513', false),
('Factory Coffee', 'Cafe', 13.7232, 100.5028, 'กรุงเทพฯ', 'เจริญกรุง', 'AUTO', '08:00', '18:00', 'คาเฟ่ในโกดัง', 'สายกาแฟ', '#8B4513', false),
('Featherstone Cafe', 'Cafe', 13.7428, 100.5912, 'กรุงเทพฯ', 'เอกมัย', 'AUTO', '09:00', '19:00', 'คาเฟ่สวยเอกมัย', 'สายถ่ายรูป', '#8B4513', false),
('Roast Coffee', 'Cafe', 13.7295, 100.5695, 'กรุงเทพฯ', 'ทองหล่อ', 'AUTO', '07:00', '19:00', 'กาแฟพิเศษ', 'สายกาแฟ', '#8B4513', false),
('Wat Arun', 'Temple', 13.7437, 100.4889, 'กรุงเทพฯ', 'ฝั่งธนบุรี', 'AUTO', '08:00', '18:00', 'วัดอรุณ', 'นักท่องเที่ยว', '#F39C12', false),
('Grand Palace', 'Attraction', 13.7500, 100.4913, 'กรุงเทพฯ', 'พระนคร', 'AUTO', '08:30', '15:30', 'พระบรมมหาราชวัง', 'นักท่องเที่ยว', '#F39C12', false),
('Somtum Der', 'Restaurant', 13.7265, 100.5310, 'กรุงเทพฯ', 'สีลม', 'AUTO', '11:00', '22:00', 'ส้มตำอีสานมิชลิน', 'Foodies', '#E74C3C', false),
('Gaggan Anand', 'Restaurant', 13.7385, 100.5655, 'กรุงเทพฯ', 'ทองหล่อ', 'AUTO', '18:00', '23:00', 'อินเดียนพรีเมียม', 'คู่รัก', '#E74C3C', false),
('Beam Club', 'Nightclub', 13.7315, 100.5785, 'กรุงเทพฯ', 'ทองหล่อ', 'LIVE', '22:00', '04:00', 'EDM/Techno Club', 'วัยรุ่น', '#9B59B6', false),
('Glow Club', 'Nightclub', 13.7318, 100.5788, 'กรุงเทพฯ', 'ทองหล่อ', 'LIVE', '22:00', '04:00', 'คลับมาตรฐาน', 'วัยรุ่น', '#9B59B6', false),
('Sugar Club', 'Nightclub', 13.7320, 100.5790, 'กรุงเทพฯ', 'สุขุมวิท11', 'LIVE', '22:00', '04:00', 'Hip Hop Club', 'วัยรุ่น', '#9B59B6', false),
('The Iron Fairies', 'Bar', 13.7295, 100.5698, 'กรุงเทพฯ', 'ทองหล่อ', 'LIVE', '18:00', '02:00', 'บาร์บรรยากาศแฟนตาซี', 'Expats', '#9B59B6', false),
('Tep Bar', 'Bar', 13.7455, 100.5005, 'กรุงเทพฯ', 'เจริญกรุง', 'LIVE', '18:00', '01:00', 'บาร์ไทยร่วมสมัย', 'สายดื่ม', '#9B59B6', false),
('Maggie Choos', 'Bar', 13.7345, 100.5715, 'กรุงเทพฯ', 'สีลม', 'LIVE', '19:00', '02:00', 'บาร์แจ๊สย้อนยุค', 'Expats', '#9B59B6', false),
('Above Eleven', 'Rooftop Bar', 13.7405, 100.5595, 'กรุงเทพฯ', 'สุขุมวิท', 'AUTO', '18:00', '02:00', 'รูฟท็อปเปรู-ญี่ปุ่น', 'สายดื่ม', '#9B59B6', false),
('Vanilla Sky', 'Rooftop Bar', 13.7355, 100.5635, 'กรุงเทพฯ', 'นานา', 'LIVE', '17:00', '01:00', 'รูฟท็อปวิวสวย', 'สายดื่ม', '#9B59B6', false),
('Jay Fai', 'Restaurant', 13.7525, 100.5025, 'กรุงเทพฯ', 'มหานาค', 'AUTO', '15:00', '23:00', 'สตรีทฟู้ดมิชลิน', 'Foodies', '#E74C3C', false),
('Sorn', 'Restaurant', 13.7295, 100.5745, 'กรุงเทพฯ', 'สุขุมวิท', 'AUTO', '18:00', '22:00', 'อาหารใต้ 2 ดาวมิชลิน', 'Foodies', '#E74C3C', false),
('Namsaah Bottling Trust', 'Restaurant', 13.7285, 100.5305, 'กรุงเทพฯ', 'สีลม', 'AUTO', '11:30', '22:30', 'อาหารไทยโมเดิร์น', 'Foodies', '#E74C3C', false),
('Roots Coffee', 'Cafe', 13.7385, 100.5565, 'กรุงเทพฯ', 'อโศก', 'AUTO', '07:00', '18:00', 'กาแฟสเปเชียลตี้', 'สายกาแฟ', '#8B4513', false),
('Pacamara Coffee', 'Cafe', 13.7305, 100.5695, 'กรุงเทพฯ', 'ทองหล่อ', 'AUTO', '08:00', '18:00', 'กาแฟแชมป์', 'สายกาแฟ', '#8B4513', false),
('Wat Pho', 'Temple', 13.7465, 100.4925, 'กรุงเทพฯ', 'พระนคร', 'AUTO', '08:00', '18:30', 'วัดโพธิ์', 'นักท่องเที่ยว', '#F39C12', false),
('Wat Benchamabophit', 'Temple', 13.7655, 100.5135, 'กรุงเทพฯ', 'ดุสิต', 'AUTO', '08:00', '17:30', 'วัดเบญจมบพิตร', 'นักท่องเที่ยว', '#F39C12', false),
('Jim Thompson House', 'Attraction', 13.7495, 100.5285, 'กรุงเทพฯ', 'สยาม', 'AUTO', '09:00', '18:00', 'บ้านจิมทอมป์สัน', 'นักท่องเที่ยว', '#F39C12', false),
('Talat Rot Fai', 'Market', 13.7595, 100.5635, 'กรุงเทพฯ', 'รัชดา', 'LIVE', '17:00', '01:00', 'ตลาดรถไฟรัชดา', 'วัยรุ่น', '#F39C12', false),
('Or Tor Kor Market', 'Market', 13.7985, 100.5495, 'กรุงเทพฯ', 'จตุจักร', 'AUTO', '07:00', '18:00', 'ตลาด อตก.', 'Foodies', '#F39C12', false),
('Silom Soi 4', 'Entertainment Zone', 13.7275, 100.5305, 'กรุงเทพฯ', 'สีลม', 'LIVE', '20:00', '02:00', 'ซอยสีลม 4', 'LGBT', '#9B59B6', false),
('Ekkamai Area', 'Entertainment Zone', 13.7195, 100.5855, 'กรุงเทพฯ', 'เอกมัย', 'LIVE', '18:00', '02:00', 'ย่านเอกมัย', 'วัยรุ่น', '#9B59B6', false),

-- นนทบุรี (Nonthaburi) - เพิ่มเติม
('Koh Kret', 'Attraction', 13.9125, 100.4855, 'นนทบุรี', 'เกาะเกร็ด', 'AUTO', '08:00', '18:00', 'เกาะเกร็ด', 'นักท่องเที่ยว', '#F39C12', false),
('Central Rattanathibet', 'Shopping Mall', 13.8595, 100.4215, 'นนทบุรี', 'รัตนาธิเบศร์', 'AUTO', '10:00', '22:00', 'เซ็นทรัลรัตนาธิเบศร์', 'ครอบครัว', '#3498DB', true),

-- ปทุมธานี (Pathum Thani) - เพิ่มเติม
('Dream World', 'Attraction', 14.0485, 100.7125, 'ปทุมธานี', 'ธัญบุรี', 'AUTO', '10:00', '17:00', 'ดรีมเวิลด์', 'ครอบครัว', '#27AE60', false),
('Science Museum', 'Attraction', 14.0545, 100.5855, 'ปทุมธานี', 'คลองหลวง', 'AUTO', '09:00', '17:00', 'พิพิธภัณฑ์วิทยาศาสตร์', 'ครอบครัว', '#F39C12', false),

-- สมุทรปราการ (Samut Prakan) - เพิ่มเติม
('Erawan Museum', 'Attraction', 13.6465, 100.5935, 'สมุทรปราการ', 'เมือง', 'AUTO', '09:00', '18:00', 'พิพิธภัณฑ์ช้างเอราวัณ', 'นักท่องเที่ยว', '#F39C12', false),
('Ancient City', 'Attraction', 13.5475, 100.6385, 'สมุทรปราการ', 'เมืองโบราณ', 'AUTO', '09:00', '18:00', 'เมืองโบราณ', 'นักท่องเที่ยว', '#F39C12', false),
('Bang Pu Recreation Center', 'Attraction', 13.5125, 100.6655, 'สมุทรปราการ', 'บางปู', 'AUTO', '06:00', '18:00', 'บางปู', 'ครอบครัว', '#27AE60', false),

-- นครปฐม (Nakhon Pathom) - เพิ่มเติม
('Phra Pathom Chedi', 'Temple', 13.8195, 100.0625, 'นครปฐม', 'เมือง', 'AUTO', '06:00', '18:00', 'พระปฐมเจดีย์', 'นักท่องเที่ยว', '#F39C12', false),
('Sanam Chandra Palace', 'Attraction', 13.8225, 100.0655, 'นครปฐม', 'เมือง', 'AUTO', '09:00', '16:00', 'พระราชวังสนามจันทร์', 'นักท่องเที่ยว', '#F39C12', false),
('Don Wai Floating Market', 'Market', 13.8625, 100.2155, 'นครปฐม', 'สามพราน', 'AUTO', '06:00', '18:00', 'ตลาดน้ำดอนหวาย', 'ครอบครัว', '#F39C12', false),

-- สิงห์บุรี (Sing Buri)
('Wat Phra Non Chaksi', 'Temple', 14.8915, 100.4025, 'สิงห์บุรี', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดพระนอนจักรสีห์', 'นักท่องเที่ยว', '#F39C12', false),
('Bang Rachan Memorial', 'Attraction', 14.9655, 100.3255, 'สิงห์บุรี', 'ค่ายบางระจัน', 'AUTO', '08:00', '17:00', 'อนุสรณ์สถานค่ายบางระจัน', 'นักท่องเที่ยว', '#F39C12', false),

-- อ่างทอง (Ang Thong)
('Wat Muang', 'Temple', 14.5125, 100.3965, 'อ่างทอง', 'วิเศษชัยชาญ', 'AUTO', '06:00', '18:00', 'วัดม่วง พระใหญ่', 'นักท่องเที่ยว', '#F39C12', false),
('Bang Sadet Market', 'Market', 14.5555, 100.4185, 'อ่างทอง', 'เมือง', 'AUTO', '06:00', '12:00', 'ตลาดบางเสด็จ', 'ทุกคน', '#F39C12', false),

-- ชัยนาท (Chai Nat)
('Bird Park', 'Attraction', 15.1865, 100.1225, 'ชัยนาท', 'เมือง', 'AUTO', '08:00', '17:00', 'สวนนกชัยนาท', 'ครอบครัว', '#27AE60', false),
('Chao Phraya Dam', 'Attraction', 15.1575, 100.1755, 'ชัยนาท', 'เมือง', 'AUTO', '06:00', '18:00', 'เขื่อนเจ้าพระยา', 'ครอบครัว', '#27AE60', false),

-- สมุทรสาคร (Samut Sakhon)
('Mahachai Seafood Market', 'Market', 13.5425, 100.2795, 'สมุทรสาคร', 'มหาชัย', 'AUTO', '06:00', '18:00', 'ตลาดมหาชัย', 'ทุกคน', '#F39C12', false),
('Wat Chong Lom', 'Temple', 13.5515, 100.2855, 'สมุทรสาคร', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดช่องลม', 'นักท่องเที่ยว', '#F39C12', false),

-- สมุทรสงคราม (Samut Songkhram)
('Amphawa Floating Market', 'Market', 13.4265, 99.9525, 'สมุทรสงคราม', 'อัมพวา', 'AUTO', '12:00', '21:00', 'ตลาดน้ำอัมพวา', 'นักท่องเที่ยว', '#F39C12', false),
('Maeklong Railway Market', 'Market', 13.4085, 99.9985, 'สมุทรสงคราม', 'เมือง', 'AUTO', '06:00', '18:00', 'ตลาดร่มหุบ', 'นักท่องเที่ยว', '#F39C12', false),
('Firefly Watching', 'Attraction', 13.4315, 99.9475, 'สมุทรสงคราม', 'อัมพวา', 'AUTO', '18:00', '21:00', 'ล่องเรือดูหิ่งห้อย', 'คู่รัก', '#27AE60', false),

-- นครนายก (Nakhon Nayok)
('Khun Dan Prakarn Chon Dam', 'Attraction', 14.3545, 101.3085, 'นครนายก', 'เมือง', 'AUTO', '06:00', '18:00', 'เขื่อนขุนด่านปราการชล', 'ครอบครัว', '#27AE60', false),
('Sarika Waterfall', 'Attraction', 14.3285, 101.2655, 'นครนายก', 'เมือง', 'AUTO', '08:00', '17:00', 'น้ำตกสาริกา', 'สายธรรมชาติ', '#27AE60', false),
('Wang Takrai Park', 'Attraction', 14.3125, 101.2755, 'นครนายก', 'เมือง', 'AUTO', '06:00', '18:00', 'วังตะไคร้', 'ครอบครัว', '#27AE60', false),

-- ปราจีนบุรี (Prachin Buri)
('Tab Lan National Park', 'Attraction', 14.2545, 101.8425, 'ปราจีนบุรี', 'นาดี', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติทับลาน', 'สายธรรมชาติ', '#27AE60', false),
('Prachin Buri Botanic Garden', 'Attraction', 14.0525, 101.3685, 'ปราจีนบุรี', 'เมือง', 'AUTO', '08:00', '17:00', 'สวนพฤกษศาสตร์', 'ครอบครัว', '#27AE60', false),

-- สระแก้ว (Sa Kaeo)
('Ban Khlong Luek Border Market', 'Market', 13.5865, 102.5625, 'สระแก้ว', 'อรัญประเทศ', 'AUTO', '06:00', '17:00', 'ตลาดโรงเกลือ', 'ทุกคน', '#F39C12', false),
('Pang Sida National Park', 'Attraction', 14.1255, 102.2565, 'สระแก้ว', 'เมือง', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติปางสีดา', 'สายธรรมชาติ', '#27AE60', false),

-- ==================== ภาคตะวันออก (Eastern Thailand) ====================

-- ชลบุรี/พัทยา (Chonburi/Pattaya)
('Walking Street Pattaya', 'Entertainment Zone', 12.9275, 100.8705, 'ชลบุรี', 'พัทยา', 'LIVE', '18:00', '04:00', 'วอล์คกิ้งสตรีท', 'นักท่องเที่ยว', '#9B59B6', false),
('Lucifer Disco', 'Nightclub', 12.9270, 100.8710, 'ชลบุรี', 'พัทยา', 'LIVE', '22:00', '05:00', 'คลับดังพัทยา', 'วัยรุ่น', '#9B59B6', false),
('Horizon Rooftop', 'Rooftop Bar', 12.9355, 100.8795, 'ชลบุรี', 'พัทยา', 'AUTO', '17:00', '01:00', 'รูฟท็อปวิวทะเล', 'สายดื่ม', '#9B59B6', false),
('Terminal 21 Pattaya', 'Shopping Mall', 12.9347, 100.8832, 'ชลบุรี', 'พัทยา', 'AUTO', '10:00', '22:00', 'ห้างพัทยา', 'ครอบครัว', '#3498DB', true),
('Pattaya Beach', 'Beach', 12.9358, 100.8765, 'ชลบุรี', 'พัทยา', 'AUTO', '06:00', '23:00', 'หาดพัทยา', 'นักท่องเที่ยว', '#2ECC71', false),
('Sanctuary of Truth', 'Attraction', 12.9748, 100.8925, 'ชลบุรี', 'พัทยา', 'AUTO', '08:00', '18:00', 'ปราสาทสัจธรรม', 'นักท่องเที่ยว', '#F39C12', false),
('Nong Nooch Garden', 'Attraction', 12.7645, 100.9345, 'ชลบุรี', 'พัทยา', 'AUTO', '08:00', '18:00', 'สวนนงนุช', 'ครอบครัว', '#27AE60', false),
('Koh Larn', 'Beach', 12.9185, 100.7855, 'ชลบุรี', 'พัทยา', 'AUTO', '06:00', '18:00', 'เกาะล้าน', 'นักท่องเที่ยว', '#2ECC71', false),
('Sriracha Tiger Zoo', 'Attraction', 13.1215, 100.9425, 'ชลบุรี', 'ศรีราชา', 'AUTO', '08:00', '18:00', 'สวนเสือศรีราชา', 'ครอบครัว', '#27AE60', false),

-- ระยอง (Rayong)
('Koh Samet', 'Beach', 12.5725, 101.4585, 'ระยอง', 'เกาะเสม็ด', 'AUTO', '00:00', '23:59', 'เกาะเสม็ด', 'นักท่องเที่ยว', '#2ECC71', false),
('Central Rayong', 'Shopping Mall', 12.6815, 101.2775, 'ระยอง', 'เมือง', 'AUTO', '10:00', '21:00', 'ศูนย์การค้า', 'ครอบครัว', '#3498DB', true),
('Ban Phe Night Market', 'Market', 12.6185, 101.4135, 'ระยอง', 'บ้านเพ', 'AUTO', '17:00', '22:00', 'ตลาดบ้านเพ', 'ทุกคน', '#F39C12', false),

-- ตราด (Trat)
('Koh Chang', 'Beach', 12.0675, 102.3185, 'ตราด', 'เกาะช้าง', 'AUTO', '00:00', '23:59', 'เกาะช้าง', 'นักท่องเที่ยว', '#2ECC71', false),
('Koh Kood', 'Beach', 11.6425, 102.5685, 'ตราด', 'เกาะกูด', 'AUTO', '00:00', '23:59', 'เกาะกูด', 'นักท่องเที่ยว', '#2ECC71', false),
('White Sand Beach', 'Beach', 12.1155, 102.2875, 'ตราด', 'เกาะช้าง', 'AUTO', '00:00', '23:59', 'หาดทรายขาว', 'นักท่องเที่ยว', '#2ECC71', false),

-- จันทบุรี (Chanthaburi)
('Chanthabun Riverside', 'Market', 12.6085, 102.1125, 'จันทบุรี', 'เมือง', 'AUTO', '17:00', '22:00', 'ริมน้ำจันท์', 'นักท่องเที่ยว', '#F39C12', false),
('Namtok Phlio', 'Attraction', 12.5145, 102.1605, 'จันทบุรี', 'แหลมสิงห์', 'AUTO', '06:00', '18:00', 'น้ำตกพลิ้ว', 'สายธรรมชาติ', '#27AE60', false),
('Gem Market', 'Market', 12.6105, 102.1085, 'จันทบุรี', 'เมือง', 'AUTO', '09:00', '18:00', 'ตลาดพลอย', 'นักท่องเที่ยว', '#F39C12', false),
('Cathedral of Immaculate Conception', 'Attraction', 12.6065, 102.1095, 'จันทบุรี', 'เมือง', 'AUTO', '06:00', '18:00', 'โบสถ์คาทอลิก', 'นักท่องเที่ยว', '#F39C12', false),

-- ฉะเชิงเทรา (Chachoengsao)
('Wat Sothon', 'Temple', 13.6905, 101.0755, 'ฉะเชิงเทรา', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดโสธร', 'นักท่องเที่ยว', '#F39C12', false),
('Bang Pakong River', 'Attraction', 13.5855, 100.9985, 'ฉะเชิงเทรา', 'บางปะกง', 'AUTO', '00:00', '23:59', 'แม่น้ำบางปะกง', 'ครอบครัว', '#27AE60', false),
('100 Year Old Market', 'Market', 13.7555, 101.0585, 'ฉะเชิงเทรา', 'เมือง', 'AUTO', '07:00', '16:00', 'ตลาดร้อยปี', 'นักท่องเที่ยว', '#F39C12', false),

-- ==================== ภาคใต้ (Southern Thailand) ====================

-- ภูเก็ต (Phuket)
('Bangla Road', 'Entertainment Zone', 7.8869, 98.2965, 'ภูเก็ต', 'ป่าตอง', 'LIVE', '18:00', '04:00', 'บางลาถนนดัง', 'นักท่องเที่ยว', '#9B59B6', false),
('Illuzion Phuket', 'Nightclub', 7.8862, 98.2970, 'ภูเก็ต', 'ป่าตอง', 'LIVE', '22:00', '05:00', 'คลับใหญ่สุดภูเก็ต', 'วัยรุ่น', '#9B59B6', false),
('Seduction Phuket', 'Nightclub', 7.8858, 98.2968, 'ภูเก็ต', 'ป่าตอง', 'AUTO', '22:00', '05:00', 'คลับดัง', 'วัยรุ่น', '#9B59B6', false),
('Cafe Del Mar Phuket', 'Beach Club', 7.8920, 98.2810, 'ภูเก็ต', 'กมลา', 'LIVE', '10:00', '00:00', 'บีชคลับสุดชิค', 'Expats', '#9B59B6', false),
('Catch Beach Club', 'Beach Club', 7.8895, 98.2820, 'ภูเก็ต', 'สุรินทร์', 'AUTO', '11:00', '02:00', 'บีชคลับริมหาด', 'Expats', '#9B59B6', false),
('Jungceylon', 'Shopping Mall', 7.8912, 98.2975, 'ภูเก็ต', 'ป่าตอง', 'AUTO', '10:00', '22:00', 'ห้างป่าตอง', 'ครอบครัว', '#3498DB', true),
('Central Phuket', 'Shopping Mall', 7.8915, 98.3625, 'ภูเก็ต', 'เมือง', 'AUTO', '10:00', '22:00', 'เซ็นทรัลภูเก็ต', 'ครอบครัว', '#3498DB', true),
('Patong Beach', 'Beach', 7.8889, 98.2945, 'ภูเก็ต', 'ป่าตอง', 'AUTO', '06:00', '22:00', 'หาดป่าตอง', 'นักท่องเที่ยว', '#2ECC71', false),
('Kata Beach', 'Beach', 7.8205, 98.2985, 'ภูเก็ต', 'กะตะ', 'AUTO', '06:00', '22:00', 'หาดกะตะ', 'นักท่องเที่ยว', '#2ECC71', false),
('Karon Viewpoint', 'Viewpoint', 7.8368, 98.3015, 'ภูเก็ต', 'กะรน', 'AUTO', '06:00', '19:00', 'จุดชมวิว 3 หาด', 'นักท่องเที่ยว', '#2ECC71', false),
('Big Buddha Phuket', 'Temple', 7.8275, 98.3130, 'ภูเก็ต', 'ฉลอง', 'AUTO', '06:00', '19:30', 'พระใหญ่ภูเก็ต', 'นักท่องเที่ยว', '#F39C12', false),
('Phuket Old Town', 'Attraction', 7.8835, 98.3905, 'ภูเก็ต', 'เมือง', 'AUTO', '10:00', '22:00', 'ย่านเมืองเก่า', 'นักท่องเที่ยว', '#F39C12', false),

-- กระบี่ (Krabi)
('Ao Nang Beach', 'Beach', 8.0375, 98.8255, 'กระบี่', 'อ่าวนาง', 'AUTO', '06:00', '22:00', 'หาดอ่าวนาง', 'นักท่องเที่ยว', '#2ECC71', false),
('Railay Beach', 'Beach', 8.0125, 98.8365, 'กระบี่', 'ไร่เลย์', 'AUTO', '06:00', '22:00', 'หาดไร่เลย์', 'นักท่องเที่ยว', '#2ECC71', false),
('Phi Phi Islands', 'Beach', 7.7405, 98.7685, 'กระบี่', 'พีพี', 'AUTO', '00:00', '23:59', 'หมู่เกาะพีพี', 'นักท่องเที่ยว', '#2ECC71', false),
('Krabi Town Night Market', 'Market', 8.0605, 98.9185, 'กระบี่', 'เมือง', 'AUTO', '17:00', '22:00', 'ตลาดกลางคืน', 'ทุกคน', '#F39C12', false),
('Tiger Cave Temple', 'Temple', 8.1225, 98.9245, 'กระบี่', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดถ้ำเสือ', 'นักท่องเที่ยว', '#F39C12', false),

-- สุราษฎร์ธานี/สมุย (Surat Thani/Samui)
('Chaweng Beach', 'Beach', 9.5328, 100.0615, 'สุราษฎร์ธานี', 'เกาะสมุย', 'LIVE', '06:00', '23:00', 'หาดเฉวง', 'นักท่องเที่ยว', '#2ECC71', false),
('Ark Bar Beach Resort', 'Beach Club', 9.5305, 100.0635, 'สุราษฎร์ธานี', 'เกาะสมุย', 'LIVE', '10:00', '02:00', 'บีชคลับสมุย', 'วัยรุ่น', '#9B59B6', false),
('Green Mango Club', 'Nightclub', 9.5312, 100.0620, 'สุราษฎร์ธานี', 'เกาะสมุย', 'AUTO', '21:00', '04:00', 'กรีนแมงโก้', 'วัยรุ่น', '#9B59B6', false),
('Koh Phangan Full Moon Party', 'Beach Party', 9.7545, 100.0615, 'สุราษฎร์ธานี', 'เกาะพะงัน', 'LIVE', '20:00', '06:00', 'ฟูลมูนปาร์ตี้', 'นักท่องเที่ยว', '#9B59B6', false),
('Koh Tao', 'Beach', 10.0975, 99.8385, 'สุราษฎร์ธานี', 'เกาะเต่า', 'AUTO', '00:00', '23:59', 'เกาะเต่า ดำน้ำ', 'สายดำน้ำ', '#2ECC71', false),
('Ang Thong Marine Park', 'Attraction', 9.6275, 99.7015, 'สุราษฎร์ธานี', 'เกาะสมุย', 'AUTO', '08:00', '17:00', 'อุทยานแห่งชาติอ่างทอง', 'สายธรรมชาติ', '#27AE60', false),

-- สงขลา/หาดใหญ่ (Songkhla/Hat Yai)
('Central Hatyai', 'Shopping Mall', 7.0085, 100.4765, 'สงขลา', 'หาดใหญ่', 'AUTO', '10:00', '21:00', 'เซ็นทรัลหาดใหญ่', 'ครอบครัว', '#3498DB', true),
('Kim Yong Market', 'Market', 7.0045, 100.4695, 'สงขลา', 'หาดใหญ่', 'AUTO', '06:00', '18:00', 'ตลาดกิมหยง', 'ทุกคน', '#F39C12', false),
('Songkhla Old Town', 'Attraction', 7.2025, 100.5945, 'สงขลา', 'เมือง', 'AUTO', '08:00', '18:00', 'เมืองเก่าสงขลา', 'นักท่องเที่ยว', '#F39C12', false),
('Samila Beach', 'Beach', 7.2255, 100.6015, 'สงขลา', 'เมือง', 'AUTO', '06:00', '22:00', 'หาดสมิหลา', 'ครอบครัว', '#2ECC71', false),

-- นครศรีธรรมราช (Nakhon Si Thammarat)
('Wat Phra Mahathat', 'Temple', 8.4125, 99.9675, 'นครศรีธรรมราช', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดพระมหาธาตุ', 'นักท่องเที่ยว', '#F39C12', false),
('Central Nakhon Si', 'Shopping Mall', 8.4325, 99.9665, 'นครศรีธรรมราช', 'เมือง', 'AUTO', '10:00', '21:00', 'เซ็นทรัลนครศรี', 'ครอบครัว', '#3498DB', true),

-- ตรัง (Trang)
('Trang Walking Street', 'Market', 7.5525, 99.6105, 'ตรัง', 'เมือง', 'AUTO', '17:00', '22:00', 'ถนนคนเดินตรัง', 'ทุกคน', '#F39C12', false),
('Koh Lipe', 'Beach', 6.4875, 99.3025, 'ตรัง', 'เกาะลิเป๊ะ', 'AUTO', '00:00', '23:59', 'เกาะลิเป๊ะ', 'นักท่องเที่ยว', '#2ECC71', false),

-- พังงา (Phang Nga)
('James Bond Island', 'Attraction', 8.2755, 98.5015, 'พังงา', 'เขาพิงกัน', 'AUTO', '08:00', '17:00', 'เกาะเจมส์บอนด์', 'นักท่องเที่ยว', '#27AE60', false),
('Khao Lak Beach', 'Beach', 8.6415, 98.2475, 'พังงา', 'เขาหลัก', 'AUTO', '06:00', '22:00', 'หาดเขาหลัก', 'นักท่องเที่ยว', '#2ECC71', false),
('Similan Islands', 'Beach', 8.6515, 97.6385, 'พังงา', 'หมู่เกาะสิมิลัน', 'AUTO', '00:00', '23:59', 'หมู่เกาะสิมิลัน', 'สายดำน้ำ', '#2ECC71', false),

-- ชุมพร (Chumphon)
('Chumphon Night Market', 'Market', 10.4955, 99.1805, 'ชุมพร', 'เมือง', 'AUTO', '17:00', '22:00', 'ตลาดกลางคืน', 'ทุกคน', '#F39C12', false),
('Koh Tao Ferry Terminal', 'Transport', 10.4705, 99.1885, 'ชุมพร', 'เมือง', 'AUTO', '06:00', '18:00', 'ท่าเรือไปเกาะเต่า', 'นักท่องเที่ยว', '#3498DB', false),

-- ระนอง (Ranong)
('Raksa Warin Hot Spring', 'Attraction', 9.9665, 98.6335, 'ระนอง', 'เมือง', 'AUTO', '08:00', '18:00', 'น้ำพุร้อนรักษะวาริน', 'สายสุขภาพ', '#27AE60', false),
('Koh Phayam', 'Beach', 9.7855, 98.4185, 'ระนอง', 'เกาะพยาม', 'AUTO', '00:00', '23:59', 'เกาะพยาม', 'นักท่องเที่ยว', '#2ECC71', false),

-- ปัตตานี (Pattani)
('Kru Se Mosque', 'Temple', 6.8775, 101.2155, 'ปัตตานี', 'เมือง', 'AUTO', '06:00', '18:00', 'มัสยิดกรือเซะ', 'นักท่องเที่ยว', '#F39C12', false),
('Pattani Walking Street', 'Market', 6.8695, 101.2515, 'ปัตตานี', 'เมือง', 'AUTO', '17:00', '22:00', 'ถนนคนเดิน', 'ทุกคน', '#F39C12', false),

-- ยะลา (Yala)
('Betong', 'Attraction', 5.7715, 101.0715, 'ยะลา', 'เบตง', 'AUTO', '00:00', '23:59', 'เบตง', 'นักท่องเที่ยว', '#27AE60', false),
('Sea of Mist Aiyerweng', 'Attraction', 5.7965, 101.0855, 'ยะลา', 'เบตง', 'AUTO', '05:00', '08:00', 'ทะเลหมอกอัยเยอร์เวง', 'นักท่องเที่ยว', '#27AE60', false),
('Betong Hot Spring', 'Attraction', 5.8025, 101.0625, 'ยะลา', 'เบตง', 'AUTO', '08:00', '18:00', 'น้ำพุร้อนเบตง', 'สายสุขภาพ', '#27AE60', false),

-- นราธิวาส (Narathiwat)
('Takbai Border', 'Attraction', 6.2495, 102.0555, 'นราธิวาส', 'ตากใบ', 'AUTO', '06:00', '18:00', 'ด่านตากใบ', 'นักท่องเที่ยว', '#3498DB', false),
('Narathiwat Walking Street', 'Market', 6.4275, 101.8225, 'นราธิวาส', 'เมือง', 'AUTO', '17:00', '22:00', 'ถนนคนเดิน', 'ทุกคน', '#F39C12', false),

-- พัทลุง (Phatthalung)
('Thale Noi Waterfowl Park', 'Attraction', 7.7865, 100.1525, 'พัทลุง', 'ทะเลน้อย', 'AUTO', '06:00', '18:00', 'ทะเลน้อย', 'สายธรรมชาติ', '#27AE60', false),
('Khao Ok Thalu', 'Attraction', 7.5485, 100.0155, 'พัทลุง', 'เมือง', 'AUTO', '06:00', '18:00', 'เขาอกทะลุ', 'นักท่องเที่ยว', '#27AE60', false),

-- สตูล (Satun)
('Koh Lipe', 'Beach', 6.4875, 99.3025, 'สตูล', 'เกาะลิเป๊ะ', 'AUTO', '00:00', '23:59', 'เกาะลิเป๊ะ', 'นักท่องเที่ยว', '#2ECC71', false),
('Koh Tarutao', 'Beach', 6.6125, 99.6485, 'สตูล', 'เกาะตะรุเตา', 'AUTO', '00:00', '23:59', 'เกาะตะรุเตา', 'สายธรรมชาติ', '#2ECC71', false),
('Satun Walking Street', 'Market', 6.6255, 100.0685, 'สตูล', 'เมือง', 'AUTO', '17:00', '22:00', 'ถนนคนเดิน', 'ทุกคน', '#F39C12', false),

-- ==================== ภาคอีสาน (Northeastern Thailand) ====================

-- นครราชสีมา/โคราช (Nakhon Ratchasima/Korat)
('Terminal 21 Korat', 'Shopping Mall', 14.9785, 102.0975, 'นครราชสีมา', 'เมือง', 'AUTO', '10:00', '22:00', 'ห้างโคราช', 'ครอบครัว', '#3498DB', true),
('Central Korat', 'Shopping Mall', 14.9725, 102.0855, 'นครราชสีมา', 'เมือง', 'AUTO', '10:00', '21:00', 'เซ็นทรัลโคราช', 'ครอบครัว', '#3498DB', true),
('Khao Yai National Park', 'Attraction', 14.4365, 101.3755, 'นครราชสีมา', 'เขาใหญ่', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติเขาใหญ่', 'สายธรรมชาติ', '#27AE60', false),
('Pimai Historical Park', 'Attraction', 15.2215, 102.4925, 'นครราชสีมา', 'พิมาย', 'AUTO', '07:00', '18:00', 'ปราสาทหินพิมาย', 'นักท่องเที่ยว', '#F39C12', false),
('Farm Chokchai', 'Attraction', 14.5375, 101.4185, 'นครราชสีมา', 'ปากช่อง', 'AUTO', '09:00', '17:00', 'ฟาร์มโชคชัย', 'ครอบครัว', '#27AE60', false),

-- ขอนแก่น (Khon Kaen)
('Central Khon Kaen', 'Shopping Mall', 16.4325, 102.8365, 'ขอนแก่น', 'เมือง', 'AUTO', '10:00', '21:00', 'เซ็นทรัลขอนแก่น', 'ครอบครัว', '#3498DB', true),
('Bueng Kaen Nakhon', 'Attraction', 16.4265, 102.8185, 'ขอนแก่น', 'เมือง', 'AUTO', '00:00', '23:59', 'บึงแก่นนคร', 'ครอบครัว', '#27AE60', false),
('Khon Kaen Walking Street', 'Market', 16.4305, 102.8295, 'ขอนแก่น', 'เมือง', 'AUTO', '17:00', '22:00', 'ถนนคนเดิน', 'ทุกคน', '#F39C12', false),
('Dinosaur Museum', 'Attraction', 16.3355, 102.8275, 'ขอนแก่น', 'เมือง', 'AUTO', '09:00', '17:00', 'พิพิธภัณฑ์ไดโนเสาร์', 'ครอบครัว', '#F39C12', false),

-- อุดรธานี (Udon Thani)
('Central Udon', 'Shopping Mall', 17.4155, 102.7875, 'อุดรธานี', 'เมือง', 'AUTO', '10:00', '21:00', 'เซ็นทรัลอุดร', 'ครอบครัว', '#3498DB', true),
('UD Town', 'Community Mall', 17.4125, 102.7915, 'อุดรธานี', 'เมือง', 'AUTO', '10:00', '21:00', 'ยูดีทาวน์', 'วัยรุ่น', '#3498DB', true),
('Nong Prajak Park', 'Attraction', 17.4085, 102.7855, 'อุดรธานี', 'เมือง', 'AUTO', '05:00', '21:00', 'สวนหนองประจักษ์', 'ครอบครัว', '#27AE60', false),
('Red Lotus Sea', 'Attraction', 17.4675, 103.0155, 'อุดรธานี', 'กุมภวาปี', 'AUTO', '06:00', '12:00', 'ทะเลบัวแดง', 'นักท่องเที่ยว', '#27AE60', false),
('Ban Chiang Museum', 'Attraction', 17.4075, 103.2355, 'อุดรธานี', 'บ้านเชียง', 'AUTO', '09:00', '16:00', 'พิพิธภัณฑ์บ้านเชียง', 'นักท่องเที่ยว', '#F39C12', false),

-- อุบลราชธานี (Ubon Ratchathani)
('Central Ubon', 'Shopping Mall', 15.2285, 104.8565, 'อุบลราชธานี', 'เมือง', 'AUTO', '10:00', '21:00', 'เซ็นทรัลอุบล', 'ครอบครัว', '#3498DB', true),
('Pha Taem National Park', 'Attraction', 15.5525, 105.5215, 'อุบลราชธานี', 'โขงเจียม', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติผาแต้ม', 'สายธรรมชาติ', '#27AE60', false),
('Sam Phan Bok', 'Attraction', 15.5815, 105.4685, 'อุบลราชธานี', 'โขงเจียม', 'AUTO', '06:00', '18:00', 'สามพันโบก', 'นักท่องเที่ยว', '#27AE60', false),
('Candle Festival', 'Festival', 15.2275, 104.8555, 'อุบลราชธานี', 'เมือง', 'AUTO', '08:00', '22:00', 'งานแห่เทียนพรรษา', 'ทุกคน', '#F39C12', false),

-- เลย (Loei)
('Phu Kradueng', 'Attraction', 16.8815, 101.8325, 'เลย', 'ภูกระดึง', 'AUTO', '05:00', '17:00', 'ภูกระดึง', 'สายธรรมชาติ', '#27AE60', false),
('Chiang Khan Walking Street', 'Market', 17.8925, 101.6635, 'เลย', 'เชียงคาน', 'AUTO', '17:00', '22:00', 'ถนนคนเดินเชียงคาน', 'นักท่องเที่ยว', '#F39C12', false),
('Phu Thok', 'Attraction', 17.9185, 101.6575, 'เลย', 'เชียงคาน', 'AUTO', '05:00', '08:00', 'ภูทอก', 'สายธรรมชาติ', '#27AE60', false),

-- หนองคาย (Nong Khai)
('Friendship Bridge', 'Attraction', 17.8785, 102.7535, 'หนองคาย', 'เมือง', 'AUTO', '06:00', '22:00', 'สะพานมิตรภาพไทย-ลาว', 'นักท่องเที่ยว', '#3498DB', false),
('Sala Kaew Ku', 'Attraction', 17.8705, 102.8055, 'หนองคาย', 'เมือง', 'AUTO', '07:00', '18:00', 'ศาลาแก้วกู่', 'นักท่องเที่ยว', '#F39C12', false),

-- บุรีรัมย์ (Buriram)
('Chang Arena', 'Stadium', 15.0165, 103.1485, 'บุรีรัมย์', 'เมือง', 'AUTO', '09:00', '21:00', 'สนามช้างอารีนา', 'สายกีฬา', '#3498DB', false),
('Phanom Rung', 'Attraction', 14.5315, 102.9415, 'บุรีรัมย์', 'เฉลิมพระเกียรติ', 'AUTO', '06:00', '18:00', 'ปราสาทพนมรุ้ง', 'นักท่องเที่ยว', '#F39C12', false),

-- สุรินทร์ (Surin)
('Elephant Village', 'Attraction', 14.8715, 103.4225, 'สุรินทร์', 'ท่าตูม', 'AUTO', '08:00', '17:00', 'หมู่บ้านช้าง', 'นักท่องเที่ยว', '#27AE60', false),
('Prasat Sikhoraphum', 'Attraction', 15.0335, 103.7985, 'สุรินทร์', 'ศีขรภูมิ', 'AUTO', '06:00', '18:00', 'ปราสาทศีขรภูมิ', 'นักท่องเที่ยว', '#F39C12', false),

-- ร้อยเอ็ด (Roi Et)
('Bung Phlan Chai', 'Attraction', 16.0505, 103.6525, 'ร้อยเอ็ด', 'เมือง', 'AUTO', '05:00', '21:00', 'บึงพลาญชัย', 'ครอบครัว', '#27AE60', false),
('Phra Maha Chedi Chai Mongkol', 'Temple', 16.0525, 103.6565, 'ร้อยเอ็ด', 'เมือง', 'AUTO', '06:00', '18:00', 'พระมหาเจดีย์ชัยมงคล', 'นักท่องเที่ยว', '#F39C12', false),

-- มหาสารคาม (Maha Sarakham)
('Maha Sarakham University', 'Attraction', 16.2465, 103.2515, 'มหาสารคาม', 'เมือง', 'AUTO', '08:00', '18:00', 'มหาวิทยาลัยมหาสารคาม', 'นักศึกษา', '#3498DB', false),
('Kaeng Loeng Chan', 'Attraction', 16.0625, 103.0185, 'มหาสารคาม', 'โกสุมพิสัย', 'AUTO', '06:00', '18:00', 'แก่งเลิงจาน', 'สายธรรมชาติ', '#27AE60', false),

-- กาฬสินธุ์ (Kalasin)
('Phu Phan National Park', 'Attraction', 16.5855, 103.8465, 'กาฬสินธุ์', 'เมือง', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติภูพาน', 'สายธรรมชาติ', '#27AE60', false),
('Dinosaur Museum Kalasin', 'Attraction', 16.5525, 103.8925, 'กาฬสินธุ์', 'เมือง', 'AUTO', '09:00', '17:00', 'พิพิธภัณฑ์ไดโนเสาร์', 'ครอบครัว', '#F39C12', false),

-- สกลนคร (Sakon Nakhon)
('Phu Phan Palace', 'Attraction', 17.0455, 104.0555, 'สกลนคร', 'เมือง', 'AUTO', '08:00', '17:00', 'พระตำหนักภูพาน', 'นักท่องเที่ยว', '#F39C12', false),
('Wat Phra That Choeng Chum', 'Temple', 17.1585, 104.1465, 'สกลนคร', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดพระธาตุเชิงชุม', 'นักท่องเที่ยว', '#F39C12', false),

-- นครพนม (Nakhon Phanom)
('Wat Phra That Phanom', 'Temple', 16.9445, 104.7165, 'นครพนม', 'ธาตุพนม', 'AUTO', '06:00', '18:00', 'วัดพระธาตุพนม', 'นักท่องเที่ยว', '#F39C12', false),
('Mekong River Walk', 'Attraction', 17.4125, 104.7845, 'นครพนม', 'เมือง', 'AUTO', '17:00', '22:00', 'ถนนริมโขง', 'ครอบครัว', '#27AE60', false),

-- มุกดาหาร (Mukdahan)
('Indochina Market', 'Market', 16.5455, 104.7195, 'มุกดาหาร', 'เมือง', 'AUTO', '06:00', '18:00', 'ตลาดอินโดจีน', 'นักท่องเที่ยว', '#F39C12', false),
('Phu Pha Thoep National Park', 'Attraction', 16.5285, 104.5125, 'มุกดาหาร', 'เมือง', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติภูผาเทิบ', 'สายธรรมชาติ', '#27AE60', false),

-- ยโสธร (Yasothon)
('Bun Bang Fai Festival Ground', 'Attraction', 15.7935, 104.1445, 'ยโสธร', 'เมือง', 'AUTO', '08:00', '18:00', 'สถานที่จัดงานบุญบั้งไฟ', 'นักท่องเที่ยว', '#F39C12', false),
('Phra That Kong Khao Noi', 'Temple', 15.8155, 104.1285, 'ยโสธร', 'เมือง', 'AUTO', '06:00', '18:00', 'พระธาตุก่องข้าวน้อย', 'นักท่องเที่ยว', '#F39C12', false),

-- อำนาจเจริญ (Amnat Charoen)
('Phra Mongkol Ming Muang', 'Temple', 15.8625, 104.6295, 'อำนาจเจริญ', 'เมือง', 'AUTO', '06:00', '18:00', 'พระมงคลมิ่งเมือง', 'นักท่องเที่ยว', '#F39C12', false),
('Tham Saeng Tawan', 'Attraction', 15.7125, 104.6555, 'อำนาจเจริญ', 'เมือง', 'AUTO', '08:00', '17:00', 'ถ้ำแสงตะวัน', 'สายธรรมชาติ', '#27AE60', false),

-- ชัยภูมิ (Chaiyaphum)
('Mor Hin Khao', 'Attraction', 16.0555, 101.4055, 'ชัยภูมิ', 'เทพสถิต', 'AUTO', '06:00', '18:00', 'มอหินขาว', 'สายธรรมชาติ', '#27AE60', false),
('Pa Hin Ngam National Park', 'Attraction', 15.6185, 101.3725, 'ชัยภูมิ', 'เมือง', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติป่าหินงาม', 'สายธรรมชาติ', '#27AE60', false),
('Tat Ton Waterfall', 'Attraction', 15.9845, 102.1185, 'ชัยภูมิ', 'เมือง', 'AUTO', '08:00', '17:00', 'น้ำตกตาดโตน', 'สายธรรมชาติ', '#27AE60', false),

-- หนองบัวลำภู (Nong Bua Lamphu)
('Wat Tham Klong Phen', 'Temple', 17.1855, 102.5185, 'หนองบัวลำภู', 'สุวรรณคูหา', 'AUTO', '06:00', '18:00', 'วัดถ้ำกลองเพล', 'นักท่องเที่ยว', '#F39C12', false),
('Erawan Cave', 'Attraction', 17.2085, 102.5355, 'หนองบัวลำภู', 'สุวรรณคูหา', 'AUTO', '08:00', '17:00', 'ถ้ำเอราวัณ', 'สายธรรมชาติ', '#27AE60', false),

-- บึงกาฬ (Bueng Kan)
('Phu Tok', 'Temple', 18.2755, 103.5825, 'บึงกาฬ', 'ศรีวิไล', 'AUTO', '06:00', '18:00', 'ภูทอก', 'นักท่องเที่ยว', '#F39C12', false),
('Naga Fireballs', 'Attraction', 18.0555, 103.6465, 'บึงกาฬ', 'เมือง', 'AUTO', '18:00', '23:00', 'บั้งไฟพญานาค', 'นักท่องเที่ยว', '#F39C12', false),

-- ศรีสะเกษ (Si Sa Ket)
('Prasat Khao Phra Wihan', 'Attraction', 14.3915, 104.6825, 'ศรีสะเกษ', 'กันทรลักษ์', 'AUTO', '06:00', '18:00', 'เขาพระวิหาร', 'นักท่องเที่ยว', '#F39C12', false),
('Wat Pa Maha Chedi Kaew', 'Temple', 15.3855, 104.2485, 'ศรีสะเกษ', 'ขุนหาญ', 'AUTO', '06:00', '18:00', 'วัดป่ามหาเจดีย์แก้ว', 'นักท่องเที่ยว', '#F39C12', false),

-- ==================== ภาคตะวันตก (Western Thailand) ====================

-- กาญจนบุรี (Kanchanaburi)
('Bridge Over River Kwai', 'Attraction', 14.0405, 99.5025, 'กาญจนบุรี', 'เมือง', 'AUTO', '06:00', '18:00', 'สะพานข้ามแม่น้ำแคว', 'นักท่องเที่ยว', '#F39C12', false),
('Erawan Waterfall', 'Attraction', 14.3685, 99.1455, 'กาญจนบุรี', 'ศรีสวัสดิ์', 'AUTO', '08:00', '16:30', 'น้ำตกเอราวัณ', 'สายธรรมชาติ', '#27AE60', false),
('Sai Yok National Park', 'Attraction', 14.4285, 98.8555, 'กาญจนบุรี', 'ไทรโยค', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติไทรโยค', 'สายธรรมชาติ', '#27AE60', false),
('Death Railway', 'Attraction', 14.3875, 98.9215, 'กาญจนบุรี', 'ไทรโยค', 'AUTO', '06:00', '18:00', 'ทางรถไฟสายมรณะ', 'นักท่องเที่ยว', '#F39C12', false),

-- ประจวบคีรีขันธ์/หัวหิน (Prachuap Khiri Khan/Hua Hin)
('Hua Hin Night Market', 'Market', 12.5698, 99.9568, 'ประจวบคีรีขันธ์', 'หัวหิน', 'LIVE', '17:00', '23:00', 'ตลาดโต้รุ่งหัวหิน', 'นักท่องเที่ยว', '#F39C12', false),
('Hua Hin Beach', 'Beach', 12.5678, 99.9625, 'ประจวบคีรีขันธ์', 'หัวหิน', 'AUTO', '06:00', '22:00', 'หาดหัวหิน', 'ครอบครัว', '#2ECC71', false),
('Cicada Market', 'Market', 12.5445, 99.9612, 'ประจวบคีรีขันธ์', 'หัวหิน', 'LIVE', '16:00', '23:00', 'ตลาดซิเคด้า', 'สายศิลปะ', '#F39C12', false),
('Bluport Hua Hin', 'Shopping Mall', 12.5685, 99.9488, 'ประจวบคีรีขันธ์', 'หัวหิน', 'AUTO', '10:00', '22:00', 'บลูพอร์ทหัวหิน', 'ครอบครัว', '#3498DB', true),
('Vana Nava Water Park', 'Attraction', 12.5415, 99.9545, 'ประจวบคีรีขันธ์', 'หัวหิน', 'AUTO', '10:00', '18:00', 'สวนน้ำวานานาวา', 'ครอบครัว', '#27AE60', false),
('Maruekhathaiyawan Palace', 'Attraction', 12.4265, 99.9395, 'ประจวบคีรีขันธ์', 'ชะอำ', 'AUTO', '08:30', '16:30', 'พระราชนิเวศน์มฤคทายวัน', 'นักท่องเที่ยว', '#F39C12', false),

-- เพชรบุรี (Phetchaburi)
('Cha-Am Beach', 'Beach', 12.7965, 99.9685, 'เพชรบุรี', 'ชะอำ', 'AUTO', '06:00', '22:00', 'หาดชะอำ', 'ครอบครัว', '#2ECC71', false),
('Phra Nakhon Khiri', 'Attraction', 13.1055, 99.9385, 'เพชรบุรี', 'เมือง', 'AUTO', '08:30', '16:30', 'เขาวัง', 'นักท่องเที่ยว', '#F39C12', false),
('Kaeng Krachan National Park', 'Attraction', 12.8075, 99.4225, 'เพชรบุรี', 'แก่งกระจาน', 'AUTO', '06:00', '18:00', 'อุทยานแห่งชาติแก่งกระจาน', 'สายธรรมชาติ', '#27AE60', false),

-- ราชบุรี (Ratchaburi)
('Damnoen Saduak Floating Market', 'Market', 13.5185, 99.9575, 'ราชบุรี', 'ดำเนินสะดวก', 'AUTO', '07:00', '14:00', 'ตลาดน้ำดำเนินสะดวก', 'นักท่องเที่ยว', '#F39C12', false),
('Suan Phueng', 'Attraction', 13.5285, 99.3125, 'ราชบุรี', 'สวนผึ้ง', 'AUTO', '08:00', '18:00', 'สวนผึ้ง', 'ครอบครัว', '#27AE60', false),
('Swiss Valley', 'Attraction', 13.4855, 99.2755, 'ราชบุรี', 'สวนผึ้ง', 'AUTO', '08:00', '18:00', 'สวิสวัลเลย์', 'ครอบครัว', '#27AE60', false),

-- สุพรรณบุรี (Suphan Buri) - เพิ่มใหม่
('Bueng Chawak Aquarium', 'Attraction', 14.8515, 99.8955, 'สุพรรณบุรี', 'เมือง', 'AUTO', '08:30', '16:30', 'บึงฉวากเฉลิมพระเกียรติ', 'ครอบครัว', '#27AE60', false),
('Dragon Temple', 'Temple', 14.9025, 100.0485, 'สุพรรณบุรี', 'เมือง', 'AUTO', '06:00', '18:00', 'วัดมังกรบุปผาราม', 'นักท่องเที่ยว', '#F39C12', false),
('Don Chedi Monument', 'Attraction', 14.6855, 99.9685, 'สุพรรณบุรี', 'ดอนเจดีย์', 'AUTO', '08:00', '18:00', 'อนุสรณ์ดอนเจดีย์', 'นักท่องเที่ยว', '#F39C12', false),
('Sam Chuk Old Market', 'Market', 14.7625, 100.1225, 'สุพรรณบุรี', 'สามชุก', 'AUTO', '08:00', '16:00', 'ตลาดร้อยปีสามชุก', 'นักท่องเที่ยว', '#F39C12', false)

ON CONFLICT DO NOTHING;

-- ============================================
-- 5. UPDATE SHOP is_giant_active FLAG FOR MALLS
-- ============================================
UPDATE shops SET is_giant_active = true WHERE category IN ('Shopping Mall', 'Community Mall');

-- ============================================
-- 6. SEED EMERGENCY LOCATIONS - MORE PROVINCES
-- ============================================

INSERT INTO emergency_locations (name, type, latitude, longitude, phone, province, is_24h) VALUES
-- Additional Emergency Locations
('โรงพยาบาลศิริราช', 'hospital', 13.7595, 100.4855, '02-419-7000', 'กรุงเทพฯ', true),
('โรงพยาบาลจุฬาลงกรณ์', 'hospital', 13.7325, 100.5345, '02-256-4000', 'กรุงเทพฯ', true),
('โรงพยาบาลรามาธิบดี', 'hospital', 13.7685, 100.5255, '02-201-1000', 'กรุงเทพฯ', true),
('โรงพยาบาลศรีนครินทร์', 'hospital', 16.4285, 102.8325, '043-363-000', 'ขอนแก่น', true),
('โรงพยาบาลอุดรธานี', 'hospital', 17.4155, 102.7845, '042-245-555', 'อุดรธานี', true),
('โรงพยาบาลสุราษฎร์ธานี', 'hospital', 9.1355, 99.3315, '077-915-600', 'สุราษฎร์ธานี', true),
('โรงพยาบาลสงขลานครินทร์', 'hospital', 7.0045, 100.4755, '074-451-000', 'สงขลา', true),
('โรงพยาบาลนครราชสีมา', 'hospital', 14.9745, 102.0905, '044-395-000', 'นครราชสีมา', true),
('โรงพยาบาลพัทยาเมมโมเรียล', 'hospital', 12.9355, 100.8825, '038-488-777', 'ชลบุรี', true),
('โรงพยาบาลระยอง', 'hospital', 12.6805, 101.2765, '038-611-104', 'ระยอง', true),
('ตำรวจท่องเที่ยว', 'police', 13.7550, 100.5350, '1155', 'กรุงเทพฯ', true),
('ตำรวจท่องเที่ยว ภูเก็ต', 'police', 7.8865, 98.2975, '1155', 'ภูเก็ต', true),
('ตำรวจท่องเที่ยว เชียงใหม่', 'police', 18.7885, 98.9865, '1155', 'เชียงใหม่', true),
('ตำรวจท่องเที่ยว พัทยา', 'police', 12.9285, 100.8725, '1155', 'ชลบุรี', true),
('ตำรวจท่องเที่ยว สมุย', 'police', 9.5295, 100.0605, '1155', 'สุราษฎร์ธานี', true),
('ตำรวจท่องเที่ยว หัวหิน', 'police', 12.5685, 99.9575, '1155', 'ประจวบคีรีขันธ์', true),
-- เพิ่มโรงพยาบาลทุกภาค
('โรงพยาบาลลำปาง', 'hospital', 18.2875, 99.4905, '054-237-400', 'ลำปาง', true),
('โรงพยาบาลน่าน', 'hospital', 18.7765, 100.7755, '054-710-138', 'น่าน', true),
('โรงพยาบาลพิษณุโลก', 'hospital', 16.8195, 100.2645, '055-270-300', 'พิษณุโลก', true),
('โรงพยาบาลเชียงราย', 'hospital', 19.9125, 99.8405, '053-711-300', 'เชียงราย', true),
('โรงพยาบาลแพร่', 'hospital', 18.1455, 100.1415, '054-533-500', 'แพร่', true),
('โรงพยาบาลอยุธยา', 'hospital', 14.3525, 100.5685, '035-211-888', 'พระนครศรีอยุธยา', true),
('โรงพยาบาลกาญจนบุรี', 'hospital', 14.0215, 99.5365, '034-622-000', 'กาญจนบุรี', true),
('โรงพยาบาลกระบี่', 'hospital', 8.0595, 98.9165, '075-611-212', 'กระบี่', true),
('โรงพยาบาลตรัง', 'hospital', 7.5555, 99.6115, '075-218-018', 'ตรัง', true),
('โรงพยาบาลสตูล', 'hospital', 6.6245, 100.0685, '074-711-505', 'สตูล', true),
('โรงพยาบาลยะลา', 'hospital', 6.5385, 101.2815, '073-244-711', 'ยะลา', true),
('โรงพยาบาลนราธิวาส', 'hospital', 6.4265, 101.8225, '073-511-024', 'นราธิวาส', true),
('โรงพยาบาลปัตตานี', 'hospital', 6.8695, 101.2515, '073-335-051', 'ปัตตานี', true),
('โรงพยาบาลบุรีรัมย์', 'hospital', 14.9955, 103.1025, '044-615-002', 'บุรีรัมย์', true),
('โรงพยาบาลสุรินทร์', 'hospital', 14.8835, 103.4915, '044-511-757', 'สุรินทร์', true),
('โรงพยาบาลศรีสะเกษ', 'hospital', 15.1195, 104.3235, '045-612-502', 'ศรีสะเกษ', true),
('โรงพยาบาลเลย', 'hospital', 17.4865, 101.7235, '042-862-123', 'เลย', true),
('โรงพยาบาลหนองคาย', 'hospital', 17.8795, 102.7435, '042-413-456', 'หนองคาย', true),
('โรงพยาบาลมุกดาหาร', 'hospital', 16.5435, 104.7195, '042-611-285', 'มุกดาหาร', true),
('โรงพยาบาลนครพนม', 'hospital', 17.4095, 104.7835, '042-511-422', 'นครพนม', true),
('โรงพยาบาลจันทบุรี', 'hospital', 12.6095, 102.1055, '039-311-042', 'จันทบุรี', true),
('โรงพยาบาลตราด', 'hospital', 12.2435, 102.5165, '039-511-040', 'ตราด', true),
('โรงพยาบาลฉะเชิงเทรา', 'hospital', 13.6915, 101.0725, '038-814-375', 'ฉะเชิงเทรา', true),
('โรงพยาบาลนครปฐม', 'hospital', 13.8205, 100.0635, '034-254-150', 'นครปฐม', true),
('โรงพยาบาลสมุทรสาคร', 'hospital', 13.5465, 100.2755, '034-427-099', 'สมุทรสาคร', true),
('โรงพยาบาลเพชรบุรี', 'hospital', 13.1115, 99.9465, '032-425-062', 'เพชรบุรี', true),
('โรงพยาบาลราชบุรี', 'hospital', 13.5375, 99.8185, '032-719-600', 'ราชบุรี', true),
('โรงพยาบาลสุพรรณบุรี', 'hospital', 14.4755, 100.1295, '035-535-253', 'สุพรรณบุรี', true),
-- ตำรวจท่องเที่ยวเพิ่มเติม
('ตำรวจท่องเที่ยว กระบี่', 'police', 8.0595, 98.9165, '1155', 'กระบี่', true),
('ตำรวจท่องเที่ยว เกาะช้าง', 'police', 12.0685, 102.3195, '1155', 'ตราด', true),
('ตำรวจท่องเที่ยว โคราช', 'police', 14.9755, 102.0885, '1155', 'นครราชสีมา', true),
('ตำรวจท่องเที่ยว ขอนแก่น', 'police', 16.4335, 102.8375, '1155', 'ขอนแก่น', true)
ON CONFLICT ON CONSTRAINT emergency_locations_natural_key DO NOTHING;

-- ============================================
-- 7. VERIFICATION QUERIES
-- ============================================

-- Count by province
SELECT province, COUNT(*) as venue_count 
FROM shops 
GROUP BY province 
ORDER BY venue_count DESC 
LIMIT 20;

-- Count by category
SELECT category, COUNT(*) as count 
FROM shops 
GROUP BY category 
ORDER BY count DESC;

-- Count buildings
SELECT province, COUNT(*) as building_count 
FROM buildings 
GROUP BY province 
ORDER BY building_count DESC;

-- Total counts
SELECT 
    (SELECT COUNT(*) FROM shops) as total_shops,
    (SELECT COUNT(*) FROM buildings) as total_buildings,
    (SELECT COUNT(*) FROM emergency_locations) as total_emergency,
    (SELECT COUNT(DISTINCT province) FROM shops) as provinces_covered;
