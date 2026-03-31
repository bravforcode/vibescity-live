-- ============================================
-- VibeCity Thailand: ALL 77 PROVINCES COVERAGE
-- This script ensures EVERY province has at least one key venue.
-- ============================================

INSERT INTO shops (name, category, latitude, longitude, province, zone, status, open_time, close_time, vibe_info, crowd_info, category_color, is_giant_active) VALUES

-- ===== NORTHERN (9 Provinces) =====
('City Pillar Chiang Mai', 'Attraction', 18.7883, 98.9853, 'เชียงใหม่', 'City Center', 'AUTO', '08:00', '17:00', 'Landmark', 'Tourist', '#F39C12', true),
('Clock Tower Chiang Rai', 'Attraction', 19.9105, 99.8406, 'เชียงราย', 'City Center', 'AUTO', '08:00', '22:00', 'Landmark', 'Tourist', '#F39C12', false),
('Lampang Horse Carriage', 'Attraction', 18.2888, 99.4908, 'ลำปาง', 'City Center', 'AUTO', '08:00', '18:00', 'Tradition', 'Tourist', '#F39C12', false),
('Hariphunchai Temple', 'Temple', 18.5748, 99.0087, 'ลำพูน', 'City Center', 'AUTO', '06:00', '18:00', 'Temple', 'Locals', '#F39C12', false),
('Mae Hong Son Lake', 'Attraction', 19.302, 97.9654, 'แม่ฮ่องสอน', 'City Center', 'AUTO', '06:00', '20:00', 'Nature', 'Tourist', '#27AE60', false),
('Wat Phumin Nan', 'Temple', 18.7756, 100.773, 'น่าน', 'City Center', 'AUTO', '06:00', '18:00', 'Mural Art', 'Tourist', '#F39C12', false),
('Kwan Phayao', 'Attraction', 19.1662, 99.9022, 'พะเยา', 'City Center', 'AUTO', '06:00', '20:00', 'Lake View', 'Locals', '#27AE60', false),
('Phrae City Hall', 'Attraction', 18.1446, 100.1403, 'แพร่', 'City Center', 'AUTO', '08:00', '17:00', 'Historic', 'Locals', '#F39C12', false),
('Phraya Phichai Monument', 'Attraction', 17.6201, 100.0993, 'อุตรดิตถ์', 'City Center', 'AUTO', '08:00', '18:00', 'Monument', 'Locals', '#F39C12', false),

-- ===== NORTHEASTERN (ISAN) (20 Provinces) =====
('Phra Mongkhon Ming Mueang', 'Temple', 15.8617, 104.6225, 'อำนาจเจริญ', 'City Center', 'AUTO', '08:00', '17:00', 'Buddha', 'Locals', '#F39C12', false),
('Chaophraya Abhaibhubejhr', 'Attraction', 18.3619, 103.6464, 'บึงกาฬ', 'City Center', 'AUTO', '08:00', '17:00', 'Landmark', 'Locals', '#F39C12', false),
('Chang Arena', 'Attraction', 14.993, 103.1029, 'บุรีรัมย์', 'City Center', 'AUTO', '09:00', '18:00', 'Sport Complex', 'Locals', '#27AE60', false),
('Phraya Phakdi Chumphon', 'Attraction', 15.8105, 102.0289, 'ชัยภูมิ', 'City Center', 'AUTO', '08:00', '18:00', 'Monument', 'Locals', '#F39C12', false),
('Phra That Yakhu', 'Temple', 16.4293, 103.5065, 'กาฬสินธุ์', 'City Center', 'AUTO', '08:00', '17:00', 'Ancient', 'Locals', '#F39C12', false),
('Central Khon Kaen', 'Shopping Mall', 16.4322, 102.8236, 'ขอนแก่น', 'City Center', 'AUTO', '10:00', '21:00', 'Lifestyle', 'Youth', '#3498DB', false),
('Chiang Khan Walking Street', 'Market', 17.896, 101.6700, 'เลย', 'Chiang Khan', 'LIVE', '17:00', '22:00', 'Walking Street', 'Tourist', '#E67E22', false),
('Phra Borommathat Nadun', 'Temple', 16.185, 103.3006, 'มหาสารคาม', 'City Center', 'AUTO', '08:00', '17:00', 'Temple', 'Locals', '#F39C12', false),
('Ho Kaeo Mukdahan', 'Attraction', 16.5436, 104.7046, 'มุกดาหาร', 'City Center', 'AUTO', '08:00', '18:00', 'Tower', 'Tourist', '#3498DB', false),
('Phaya Sri Satta Nakharat', 'Attraction', 17.4069, 104.7818, 'นครพนม', 'Riverside', 'AUTO', '06:00', '22:00', 'Naga Landmark', 'Tourist', '#F39C12', false),
('Thao Suranari Monument', 'Attraction', 14.9799, 102.0978, 'นครราชสีมา', 'City Center', 'AUTO', '06:00', '22:00', 'Yamo', 'Locals', '#F39C12', true),
('Somdej Phra Naresuan', 'Attraction', 17.2029, 102.434, 'หนองบัวลำภู', 'City Center', 'AUTO', '08:00', '18:00', 'Park', 'Locals', '#27AE60', false),
('Tha Sadet Market', 'Market', 17.8785, 102.742, 'หนองคาย', 'Riverside', 'AUTO', '09:00', '18:00', 'Border Market', 'Tourist', '#E67E22', false),
('Roi Et Tower', 'Attraction', 16.0537, 103.652, 'ร้อยเอ็ด', 'City Center', 'AUTO', '09:00', '19:00', 'Tower', 'Tourist', '#3498DB', false),
('Phra That Choeng Chum', 'Temple', 17.1546, 104.1487, 'สกลนคร', 'City Center', 'AUTO', '08:00', '18:00', 'Temple', 'Locals', '#F39C12', false),
('Somdet Phra Srinagarindra Park', 'Park', 15.1186, 104.322, 'ศรีสะเกษ', 'City Center', 'AUTO', '06:00', '19:00', 'Park', 'Locals', '#27AE60', false),
('Surin Elephant Round-up', 'Attraction', 14.8818, 103.4936, 'สุรินทร์', 'City Center', 'AUTO', '08:00', '17:00', 'Culture', 'Tourist', '#F39C12', false),
('Candle Festival Grounds', 'Attraction', 15.2448, 104.8473, 'อุบลราชธานี', 'City Center', 'AUTO', '08:00', '20:00', 'Culture', 'Tourist', '#F39C12', false),
('UD Town', 'Shopping Mall', 17.4156, 102.7872, 'อุดรธานี', 'City Center', 'LIVE', '16:00', '23:00', 'Night Market', 'Youth', '#3498DB', false),
('Phaya Thaen Park', 'Park', 15.7924, 104.145, 'ยโสธร', 'City Center', 'AUTO', '06:00', '19:00', 'Toad Museum', 'Locals', '#27AE60', false),

-- ===== CENTRAL (22 Provinces) =====
('Ang Thong Big Buddha', 'Temple', 14.5896, 100.4551, 'อ่างทอง', 'City Center', 'AUTO', '08:00', '17:00', 'Big Buddha', 'Tourist', '#F39C12', true),
('Ayutthaya Historical Park', 'Attraction', 14.3532, 100.5684, 'พระนครศรีอยุธยา', 'Historical Park', 'AUTO', '08:00', '18:00', 'Ruins', 'Tourist', '#F39C12', true),
('Grand Palace', 'Attraction', 13.7500, 100.4913, 'กรุงเทพฯ', 'Old City', 'AUTO', '08:30', '15:30', 'Royal', 'Tourist', '#F39C12', true),
('Chai Nat Bird Park', 'Attraction', 15.1848, 100.1253, 'ชัยนาท', 'City Center', 'AUTO', '08:00', '17:00', 'Bird Park', 'Family', '#27AE60', false),
('Kamphaeng Phet Historical Park', 'Attraction', 16.4828, 99.5227, 'กำแพงเพชร', 'City Center', 'AUTO', '08:00', '17:00', 'Ruins', 'Tourist', '#F39C12', false),
('Phra Prang Sam Yot', 'Attraction', 14.7995, 100.6533, 'ลพบุรี', 'City Center', 'AUTO', '08:00', '18:00', 'Monkey Temple', 'Tourist', '#F39C12', false),
('Khun Dan Prakarn Chon Dam', 'Attraction', 14.3160, 101.3210, 'นครนายก', 'Dam', 'AUTO', '08:00', '17:00', 'Dam View', 'Tourist', '#3498DB', false),
('Phra Pathom Chedi', 'Temple', 13.8198, 100.0602, 'นครปฐม', 'City Center', 'AUTO', '07:00', '19:00', 'Pagoda', 'Locals', '#F39C12', true),
('Pak Nam Pho', 'Attraction', 15.7042, 100.1372, 'นครสวรรค์', 'Riverside', 'AUTO', '06:00', '20:00', 'River Source', 'Locals', '#3498DB', false),
('Koh Kret', 'Attraction', 13.9125, 100.4895, 'นนทบุรี', 'River', 'AUTO', '09:00', '17:00', 'Island', 'Tourist', '#27AE60', false),
('Dream World', 'Attraction', 13.9865, 100.6755, 'ปทุมธานี', 'Rangsit', 'AUTO', '10:00', '17:00', 'Theme Park', 'Family', '#E74C3C', false),
('Wat Phra That Phasornkaew', 'Temple', 16.7895, 101.0345, 'เพชรบูรณ์', 'Khao Kho', 'AUTO', '08:00', '17:00', 'Mountain Temple', 'Tourist', '#F39C12', true),
('Bueng Si Fai', 'Park', 16.4419, 100.3488, 'พิจิตร', 'City Center', 'AUTO', '06:00', '19:00', 'Lake Park', 'Locals', '#27AE60', false),
('Wat Phra Si Rattana Mahathat', 'Temple', 16.8211, 100.2659, 'พิษณุโลก', 'City Center', 'AUTO', '07:00', '18:00', 'Chinnarat', 'Locals', '#F39C12', true),
('Ancient City', 'Attraction', 13.5395, 100.6235, 'สมุทรปราการ', 'Bang Pu', 'AUTO', '09:00', '18:00', 'Museum', 'Tourist', '#F39C12', false),
('Mahachai Market', 'Market', 13.5475, 100.2836, 'สมุทรสาคร', 'City Center', 'AUTO', '04:00', '18:00', 'Fresh Seafood', 'Locals', '#E67E22', false),
('Amphawa Floating Market', 'Market', 13.4245, 99.9545, 'สมุทรสงคราม', 'Amphawa', 'LIVE', '14:00', '21:00', 'Floating Market', 'Tourist', '#E67E22', true),
('Wat Phra Phutthabat', 'Temple', 14.7185, 100.7885, 'สระบุรี', 'City Center', 'AUTO', '08:00', '17:00', 'Temple', 'Locals', '#F39C12', false),
('Bang Rachan Memorial', 'Attraction', 14.891, 100.3957, 'สิงห์บุรี', 'City Center', 'AUTO', '08:00', '17:00', 'History', 'Locals', '#F39C12', false),
('Sukhothai Historical Park', 'Attraction', 17.0175, 99.7035, 'สุโขทัย', 'Old City', 'AUTO', '06:30', '19:30', 'World Heritage', 'Tourist', '#F39C12', true),
('Dragon Descendants Museum', 'Museum', 14.4745, 100.1177, 'สุพรรณบุรี', 'City Center', 'AUTO', '09:00', '17:00', 'Chinese Museum', 'Tourist', '#3498DB', false),
('Wat Tha Sung', 'Temple', 15.3305, 100.0755, 'อุทัยธานี', 'City Center', 'AUTO', '08:00', '18:00', 'Crystal Hall', 'Locals', '#F39C12', false),

-- ===== EASTERN (7 Provinces) =====
('Wat Sothon Wararam', 'Temple', 13.6785, 101.0665, 'ฉะเชิงเทรา', 'City Center', 'AUTO', '07:00', '17:00', 'Big Temple', 'Locals', '#F39C12', true),
('Noen Nangphaya Viewpoint', 'Viewpoint', 12.5895, 101.8845, 'จันทบุรี', 'Sea', 'AUTO', '06:00', '19:00', 'Sea View', 'Tourist', '#27AE60', false),
('Bang Saen Beach', 'Beach', 13.2925, 100.9155, 'ชลบุรี', 'Bang Saen', 'AUTO', '06:00', '22:00', 'Beach', 'Youth', '#3498DB', false),
('Walking Street Pattaya', 'Entertainment Zone', 12.9275, 100.8705, 'ชลบุรี', 'Pattaya', 'LIVE', '18:00', '04:00', 'Nightlife', 'Tourist', '#9B59B6', true),
('Abhaibhubejhr Hospital', 'Attraction', 14.0509, 101.3716, 'ปราจีนบุรี', 'City Center', 'AUTO', '08:00', '16:00', 'Herbal', 'Locals', '#3498DB', false),
('Ko Samet', 'Beach', 12.5685, 101.4525, 'ระยอง', 'Island', 'AUTO', '00:00', '23:59', 'Island', 'Tourist', '#2ECC71', true),
('Rong Kluea Market', 'Market', 13.6895, 102.5415, 'สระแก้ว', 'Border', 'AUTO', '08:00', '17:00', 'Border Market', 'Traders', '#E67E22', false),
('Ko Chang', 'Beach', 12.0455, 102.3255, 'ตราด', 'Island', 'AUTO', '00:00', '23:59', 'Island', 'Tourist', '#2ECC71', true),

-- ===== WESTERN (5 Provinces) =====
('Bridge Over River Kwai', 'Attraction', 14.0415, 99.5035, 'กาญจนบุรี', 'City Center', 'AUTO', '00:00', '23:59', 'History', 'Tourist', '#95A5A6', true),
('Phra Nakhon Khiri (Khao Wang)', 'Attraction', 13.109, 99.9398, 'เพชรบุรี', 'City Center', 'AUTO', '08:30', '16:30', 'Palace', 'Tourist', '#F39C12', false),
('Ao Manao', 'Beach', 11.7895, 99.7995, 'ประจวบคีรีขันธ์', 'Bay', 'AUTO', '06:00', '20:00', 'Bay', 'Locals', '#2ECC71', false),
('Hua Hin Beach', 'Beach', 12.5684, 99.9577, 'ประจวบคีรีขันธ์', 'Hua Hin', 'AUTO', '06:00', '22:00', 'Beach', 'Tourist', '#3498DB', true),
('Damnoen Saduak Floating Market', 'Market', 13.5185, 99.9585, 'ราชบุรี', 'Damnoen Saduak', 'LIVE', '07:00', '14:00', 'Floating Market', 'Tourist', '#E67E22', true),
('Thi Lo Su Waterfall', 'Attraction', 15.9255, 98.7535, 'ตาก', 'Umphang', 'AUTO', '08:00', '17:00', 'Waterfall', 'Adventure', '#27AE60', false),

-- ===== SOUTHERN (14 Provinces) =====
('Sairee Beach', 'Beach', 10.493, 99.1717, 'ชุมพร', 'Sea', 'AUTO', '06:00', '22:00', 'Beach', 'Locals', '#2ECC71', false),
('Ao Nang', 'Beach', 8.0295, 98.8235, 'กระบี่', 'Ao Nang', 'AUTO', '06:00', '22:00', 'Beach', 'Tourist', '#3498DB', true),
('Wat Phra Mahathat', 'Temple', 8.431, 99.9631, 'นครศรีธรรมราช', 'City Center', 'AUTO', '08:00', '17:00', 'Temple', 'Locals', '#F39C12', true),
('Narathat Beach', 'Beach', 6.4255, 101.8253, 'นราธิวาส', 'Sea', 'AUTO', '06:00', '19:00', 'Beach', 'Locals', '#2ECC71', false),
('Pattani Central Mosque', 'Attraction', 6.8696, 101.2501, 'ปัตตานี', 'City Center', 'AUTO', '08:00', '18:00', 'Mosque', 'Locals', '#3498DB', false),
('James Bond Island', 'Attraction', 8.2745, 98.5015, 'พังงา', 'Bay', 'AUTO', '08:00', '17:00', 'Island', 'Tourist', '#27AE60', true),
('Thale Noi', 'Attraction', 7.7855, 100.1215, 'พัทลุง', 'Lake', 'AUTO', '06:00', '18:00', 'Lotus Lake', 'Nature', '#27AE60', false),
('Patong Beach', 'Beach', 7.8925, 98.2985, 'ภูเก็ต', 'Patong', 'LIVE', '00:00', '23:59', 'Beach', 'Tourist', '#3498DB', true),
('Phu Khao Ya', 'Viewpoint', 9.8735, 98.6185, 'ระนอง', 'Mountain', 'AUTO', '06:00', '18:00', 'Grass Hill', 'Locals', '#27AE60', false),
('Koh Lipe', 'Beach', 6.4865, 99.3035, 'สตูล', 'Island', 'AUTO', '00:00', '23:59', 'Thai Maldives', 'Tourist', '#2ECC71', true),
('Samila Beach', 'Beach', 7.2145, 100.5935, 'สงขลา', 'City Center', 'AUTO', '06:00', '22:00', 'Mermaid Stat.', 'Locals', '#2ECC71', true),
('Ratchaprapha Dam', 'Attraction', 8.9735, 98.8185, 'สุราษฎร์ธานี', 'Khao Sok', 'AUTO', '06:00', '18:00', 'Guilin Thai', 'Tourist', '#27AE60', true),
('Pak Meng Beach', 'Beach', 7.4985, 99.3245, 'ตรัง', 'Sea', 'AUTO', '06:00', '20:00', 'Sunset', 'Locals', '#2ECC71', false),
('Betong Mongo', 'Attraction', 5.7745, 101.0715, 'ยะลา', 'Betong', 'AUTO', '08:00', '17:00', 'Border Landmark', 'Tourist', '#F39C12', false)

ON CONFLICT DO NOTHING;
