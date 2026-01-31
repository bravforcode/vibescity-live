-- 🇹🇭 VibeCity Thailand Mega Seed 2026
-- Run this in your Supabase SQL Editor to populate the map!

-- 1. CLEANUP (Optional: Remove old data to avoid duplicates)
TRUNCATE TABLE shops RESTART IDENTITY CASCADE;

-- 2. INSERT REALISTIC DATA (Bangkok, Chiang Mai, Phuket, Chonburi, Khon Kaen)
INSERT INTO shops (
    name, category, sub_category,
    latitude, longitude,
    status, province,
    image_url_1, image_url_2,
    open_time, close_time,
    vibe_info, crowd_info
) VALUES
-- ================= BANGKOK (กรุงเทพมหานคร) =================
('Route66 Club', 'Club', 'Nightlife', 13.7544, 100.5744, 'LIVE', 'กรุงเทพมหานคร', 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67', '', '20:00', '02:00', 'EDM Party', 'Crowded'),
('Tichuca Rooftop Bar', 'Bar', 'Rooftop', 13.7314, 100.5814, 'LIVE', 'กรุงเทพมหานคร', 'https://images.unsplash.com/photo-1570577903250-93a97bd40a58?q=80&w=600', '', '17:00', '00:00', 'Jungle View', 'High End'),
('The Commons Thonglor', 'Community Mall', 'Lifestyle', 13.7351, 100.5822, 'OPEN', 'กรุงเทพมหานคร', 'https://images.unsplash.com/photo-1554118811-1e0d58224f24', '', '10:00', '22:00', 'Chilled', 'Moderate'),
('Jodd Fairs Rama 9', 'Night Market', 'Market', 13.7563, 100.5663, 'LIVE', 'กรุงเทพมหานคร', 'https://images.unsplash.com/photo-1533900298318-6b8da08a523e', '', '16:00', '00:00', 'Street Food', 'Very Crowded'),
('Siam Paragon', 'Mall', 'Shopping', 13.7462, 100.5347, 'OPEN', 'กรุงเทพมหานคร', 'https://images.unsplash.com/photo-1519567241046-7f570eee3c9e', '', '10:00', '22:00', 'Luxury', 'Busy'),
('Chatuchak Weekend Market', 'Market', 'Shopping', 13.7995, 100.5505, 'OPEN', 'กรุงเทพมหานคร', 'https://images.unsplash.com/photo-1517260739337-6799d2eb9ce0', '', '09:00', '18:00', 'Shopping', 'Packed'),
('ICONSIAM', 'Mall', 'Shopping', 13.7266, 100.5109, 'OPEN', 'กรุงเทพมหานคร', 'https://images.unsplash.com/photo-1555529733-0e670560f7e1', '', '10:00', '22:00', 'Riverside', 'Busy'),
('Nana Plaza', 'Club', 'Nightlife', 13.7409, 100.5555, 'OPEN', 'กรุงเทพมหานคร', 'https://images.unsplash.com/photo-1569388330292-7aaa1db9d332', '', '19:00', '02:00', 'Neon Lights', 'Active'),

-- ================= CHIANG MAI (เชียงใหม่) =================
('Warm Up Cafe', 'Club', 'Live Music', 18.7963, 98.9664, 'LIVE', 'เชียงใหม่', 'https://images.unsplash.com/photo-1574096079513-d82599692951', '', '18:00', '00:00', 'Live Band', 'Legends'),
('Tha Phae Gate', 'Landmark', 'Tourist', 18.7877, 98.9931, 'OPEN', 'เชียงใหม่', 'https://images.unsplash.com/photo-1590777593676-4648753a4794', '', '00:00', '24:00', 'Historical', 'Tourists'),
('Maya Lifestyle Shopping Center', 'Mall', 'Shopping', 18.8021, 98.9673, 'OPEN', 'เชียงใหม่', 'https://images.unsplash.com/photo-1567449303078-57a636c228d7', '', '10:00', '22:00', 'Modern', 'Students'),
('One Nimman', 'Community Mall', 'Lifestyle', 18.8000, 98.9682, 'LIVE', 'เชียงใหม่', 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b', '', '11:00', '23:00', 'Classic', 'Chic'),
('Zoe in Yellow', 'Bar', 'Nightlife', 18.7915, 98.9930, 'LIVE', 'เชียงใหม่', 'https://images.unsplash.com/photo-1514525253440-b393452e8d26', '', '18:00', '00:00', 'Party', 'Backpackers'),
('Good Goods', 'Cafe', 'Coffee', 18.7762, 98.9989, 'OPEN', 'เชียงใหม่', 'https://images.unsplash.com/photo-1554118811-1e0d58224f24', '', '09:00', '17:00', 'Local Coffee', 'Relaxed'),
('Graph Cafe', 'Cafe', 'Specialty', 18.7925, 98.9690, 'OPEN', 'เชียงใหม่', 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf', '', '08:00', '17:00', 'Hipster', 'Quiet'),

-- ================= PHUKET (ภูเก็ต) =================
('Illuzion Phuket', 'Club', 'Nightlife', 7.8936, 98.2975, 'LIVE', 'ภูเก็ต', 'https://images.unsplash.com/photo-1545128485-c400e7702796', '', '21:00', '03:00', 'Top 100 Club', 'Wild'),
('Café Del Mar Phuket', 'Beach Club', 'Party', 7.9546, 98.2842, 'LIVE', 'ภูเก็ต', 'https://images.unsplash.com/photo-1575878235252-4734747db153', '', '12:00', '02:00', 'Sunset', 'High Energy'),
('Old Phuket Town', 'Landmark', 'Culture', 7.8856, 98.3907, 'OPEN', 'ภูเก็ต', 'https://images.unsplash.com/photo-1534008897965-4812a772008e', '', '00:00', '24:00', 'Sino-Portuguese', 'Photogenic'),
('Promthep Cape', 'Landmark', 'Nature', 7.7634, 98.3056, 'OPEN', 'ภูเก็ต', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e', '', '00:00', '24:00', 'Sunset View', 'Crowded'),

-- ================= CHONBURI / PATTAYA (ชลบุรี) =================
('Walking Street Pattaya', 'Nightlife', 'Street', 12.9258, 100.8718, 'LIVE', 'ชลบุรี', 'https://images.unsplash.com/photo-1535136923985-7076a59b9aa7', '', '19:00', '03:00', 'Neon', 'Tourists'),
('The Glass House', 'Restaurant', 'Beachfront', 12.8530, 100.9030, 'OPEN', 'ชลบุรี', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b', '', '11:00', '23:00', 'Romantic', 'Couples'),
('Cape Dara Resort', 'Hotel', 'Luxury', 12.9547, 100.8847, 'OPEN', 'ชลบุรี', 'https://images.unsplash.com/photo-1566073771259-6a8506099945', '', '00:00', '24:00', 'Seaview', 'Elite'),

-- ================= KHON KAEN (ขอนแก่น) =================
('U-Bar Khon Kaen', 'Club', 'Nightlife', 16.4322, 102.8236, 'LIVE', 'ขอนแก่น', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7', '', '20:00', '02:00', 'Local Hits', 'Students'),
('Ton Tann Market', 'Market', 'Night Market', 16.4215, 102.8170, 'OPEN', 'ขอนแก่น', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5', '', '16:00', '23:00', 'Foodies', 'Locals');

-- 3. VERIFY
SELECT count(*) as total_shops FROM shops;
