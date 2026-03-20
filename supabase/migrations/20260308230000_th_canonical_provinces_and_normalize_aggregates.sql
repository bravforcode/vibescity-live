-- =============================================================================
-- Migration: Thailand Canonical Provinces + Normalized Province Aggregates
-- Date: 2026-03-08
-- Purpose:
--   1. Create th_provinces table with all 77 Thai provinces (EN+TH+region)
--   2. Create th_province_aliases for common mispellings/variants
--   3. Replace get_map_province_aggregates with normalization + TH-only filter
-- =============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Canonical 77 Thai Provinces reference table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.th_provinces (
  id       smallint NOT NULL GENERATED ALWAYS AS IDENTITY,
  name_en  text     NOT NULL UNIQUE,   -- Canonical English (display name)
  name_th  text     NOT NULL UNIQUE,   -- Canonical Thai
  region   text     NOT NULL,          -- N=North NE=Northeast E=East C=Central S=South W=West
  lat_hint double precision,           -- approximate center lat (for cold-start)
  lng_hint double precision,           -- approximate center lng
  CONSTRAINT th_provinces_pkey PRIMARY KEY (id)
);

-- Truncate + re-seed for idempotency
TRUNCATE public.th_provinces RESTART IDENTITY CASCADE;

INSERT INTO public.th_provinces (name_en, name_th, region, lat_hint, lng_hint) VALUES
-- ── Central ──────────────────────────────────────────────────────────────
('Bangkok',               'กรุงเทพมหานคร',       'C',  13.7563, 100.5018),
('Ang Thong',             'อ่างทอง',              'C',  14.5896, 100.4550),
('Chai Nat',              'ชัยนาท',               'C',  15.1851, 100.1256),
('Kanchanaburi',          'กาญจนบุรี',            'W',  14.0023, 99.5476),
('Nakhon Pathom',         'นครปฐม',               'C',  13.8199, 100.0624),
('Nakhon Nayok',          'นครนายก',              'C',  14.2067, 101.2131),
('Nonthaburi',            'นนทบุรี',               'C',  13.8622, 100.5131),
('Pathum Thani',          'ปทุมธานี',              'C',  14.0208, 100.5249),
('Phetchaburi',           'เพชรบุรี',              'W',  13.1126, 99.9397),
('Prachin Buri',          'ปราจีนบุรี',            'E',  14.0526, 101.3735),
('Prachuap Khiri Khan',   'ประจวบคีรีขันธ์',        'W',  11.8126, 99.7975),
('Ratchaburi',            'ราชบุรี',               'W',  13.5282, 99.8135),
('Samut Prakan',          'สมุทรปราการ',           'C',  13.5990, 100.5998),
('Samut Sakhon',          'สมุทรสาคร',             'C',  13.5474, 100.2744),
('Samut Songkhram',       'สมุทรสงคราม',           'C',  13.4098, 100.0023),
('Saraburi',              'สระบุรี',               'C',  14.5289, 100.9104),
('Sing Buri',             'สิงห์บุรี',             'C',  14.8936, 100.3967),
('Suphan Buri',           'สุพรรณบุรี',            'C',  14.4744, 100.1177),
('Sa Kaeo',               'สระแก้ว',               'E',  13.8240, 102.0645),
-- ── North ────────────────────────────────────────────────────────────────
('Chiang Mai',            'เชียงใหม่',             'N',  18.7883, 98.9853),
('Chiang Rai',            'เชียงราย',              'N',  19.9105, 99.8406),
('Kamphaeng Phet',        'กำแพงเพชร',             'N',  16.4827, 99.5226),
('Lampang',               'ลำปาง',                 'N',  18.2888, 99.4908),
('Lamphun',               'ลำพูน',                 'N',  18.5744, 99.0087),
('Mae Hong Son',          'แม่ฮ่องสอน',            'N',  19.3022, 97.9654),
('Nan',                   'น่าน',                  'N',  18.7756, 100.7730),
('Phayao',                'พะเยา',                 'N',  19.1664, 99.9019),
('Phichit',               'พิจิตร',                'N',  16.4419, 100.3487),
('Phitsanulok',           'พิษณุโลก',              'N',  16.8211, 100.2659),
('Phrae',                 'แพร่',                  'N',  18.1445, 100.1403),
('Sukhothai',             'สุโขทัย',               'N',  17.0074, 99.8265),
('Tak',                   'ตาก',                   'N',  16.8798, 99.1257),
('Uttaradit',             'อุตรดิตถ์',             'N',  17.6202, 100.0993),
-- ── Northeast (Isaan) ────────────────────────────────────────────────────
('Amnat Charoen',         'อำนาจเจริญ',            'NE', 15.8656, 104.6256),
('Bueng Kan',             'บึงกาฬ',                'NE', 18.3612, 103.6466),
('Buri Ram',              'บุรีรัมย์',              'NE', 14.9934, 103.1029),
('Chaiyaphum',            'ชัยภูมิ',               'NE', 15.8068, 102.0315),
('Kalasin',               'กาฬสินธุ์',             'NE', 16.4315, 103.5061),
('Khon Kaen',             'ขอนแก่น',               'NE', 16.4322, 102.8236),
('Loei',                  'เลย',                   'NE', 17.4860, 101.7223),
('Maha Sarakham',         'มหาสารคาม',             'NE', 16.1853, 103.3008),
('Mukdahan',              'มุกดาหาร',              'NE', 16.5437, 104.7237),
('Nakhon Phanom',         'นครพนม',                'NE', 17.3921, 104.7695),
('Nakhon Ratchasima',     'นครราชสีมา',            'NE', 14.9799, 102.0978),
('Nong Bua Lam Phu',      'หนองบัวลำภู',           'NE', 17.2036, 102.4260),
('Nong Khai',             'หนองคาย',               'NE', 17.8782, 102.7418),
('Roi Et',                'ร้อยเอ็ด',              'NE', 16.0553, 103.6520),
('Sakon Nakhon',          'สกลนคร',                'NE', 17.1664, 104.1486),
('Si Sa Ket',             'ศรีสะเกษ',              'NE', 15.1199, 104.3220),
('Surin',                 'สุรินทร์',              'NE', 14.8825, 103.4937),
('Ubon Ratchathani',      'อุบลราชธานี',           'NE', 15.2448, 104.8473),
('Udon Thani',            'อุดรธานี',              'NE', 17.4138, 102.7872),
('Yasothon',              'ยโสธร',                 'NE', 15.7924, 104.1453),
-- ── East ─────────────────────────────────────────────────────────────────
('Chachoengsao',          'ฉะเชิงเทรา',            'E',  13.6904, 101.0768),
('Chanthaburi',           'จันทบุรี',              'E',  12.6113, 102.1038),
('Chon Buri',             'ชลบุรี',                'E',  13.3611, 100.9847),
('Rayong',                'ระยอง',                 'E',  12.6814, 101.2816),
('Trat',                  'ตราด',                  'E',  12.2427, 102.5172),
-- ── South ────────────────────────────────────────────────────────────────
('Chumphon',              'ชุมพร',                 'S',  10.4930, 99.1800),
('Krabi',                 'กระบี่',                'S',   8.0863, 98.9063),
('Nakhon Si Thammarat',   'นครศรีธรรมราช',         'S',   8.4304, 99.9632),
('Narathiwat',            'นราธิวาส',              'S',   6.4261, 101.8231),
('Pattani',               'ปัตตานี',               'S',   6.8696, 101.2488),
('Phang Nga',             'พังงา',                 'S',   8.4510, 98.5273),
('Phatthalung',           'พัทลุง',                'S',   7.6167, 100.0741),
('Phuket',                'ภูเก็ต',                'S',   7.8804, 98.3923),
('Ranong',                'ระนอง',                 'S',   9.9529, 98.6087),
('Satun',                 'สตูล',                  'S',   6.6238, 100.0674),
('Songkhla',              'สงขลา',                 'S',   7.1756, 100.6137),
('Surat Thani',           'สุราษฎร์ธานี',          'S',   9.1382, 99.3217),
('Trang',                 'ตรัง',                  'S',   7.5594, 99.6112),
('Yala',                  'ยะลา',                  'S',   6.5415, 101.2808),
-- ── Ayutthaya (special) ──────────────────────────────────────────────────
('Phra Nakhon Si Ayutthaya', 'พระนครศรีอยุธยา',   'C',  14.3692, 100.5877),
('Phetchabun',            'เพชรบูรณ์',             'N',  16.4189, 101.1591),
('Lop Buri',              'ลพบุรี',                'C',  14.7996, 100.6534),
('Nakhon Sawan',          'นครสวรรค์',             'N',  15.7027, 100.1367),
('Uthai Thani',           'อุทัยธานี',             'N',  15.3835, 100.0248);

-- ============================================================================
-- PART 2: Alias mapping — variant spellings → canonical name_en
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.th_province_aliases (
  alias      text NOT NULL,
  name_en    text NOT NULL REFERENCES public.th_provinces(name_en) ON DELETE CASCADE,
  CONSTRAINT th_province_aliases_pkey PRIMARY KEY (alias)
);

TRUNCATE public.th_province_aliases;

INSERT INTO public.th_province_aliases (alias, name_en) VALUES
-- ── Bangkok variants ─────────────────────────────────────────────────────
('กรุงเทพ',               'Bangkok'),
('กรุงเทพฯ',              'Bangkok'),
('กรุงเทพมหานคร',         'Bangkok'),
('กรุงเเทพมหานคร',        'Bangkok'),
('กรุุงเทพมหานคร',        'Bangkok'),
('กรุเทพมหานคร',          'Bangkok'),
('กรุงเทพ์',              'Bangkok'),
('กทม',                   'Bangkok'),
('กทม.',                  'Bangkok'),
('บางกอก',                'Bangkok'),
('bkk',                   'Bangkok'),
('bangkok',               'Bangkok'),
-- ── Chiang Mai variants ──────────────────────────────────────────────────
('เชียงใหม่',             'Chiang Mai'),
('จังหวัดเชียงใหม่',     'Chiang Mai'),
('จ.เชียงใหม่',          'Chiang Mai'),
('เมืองเชียงใหม่',       'Chiang Mai'),
('chiang mai',            'Chiang Mai'),
('chiangmai',             'Chiang Mai'),
('Chiangmai',             'Chiang Mai'),
('เขียงใหม่',             'Chiang Mai'),
-- ── Chiang Rai variants ──────────────────────────────────────────────────
('เชียงราย',              'Chiang Rai'),
('จังหวัดเชียงราย',      'Chiang Rai'),
-- ── Phuket variants ──────────────────────────────────────────────────────
('ภูเก็ต',                'Phuket'),
('ภูเก็ด',                'Phuket'),
('phuket',                'Phuket'),
('Phuket 83100',          'Phuket'),
('puket',                 'Phuket'),
('Pukhet',                'Phuket'),
-- ── Khon Kaen variants ───────────────────────────────────────────────────
('ขอนแก่น',               'Khon Kaen'),
('จังหวัดขอนแก่น',       'Khon Kaen'),
('KhonKaen',              'Khon Kaen'),
('khon kaen',             'Khon Kaen'),
-- ── Nonthaburi variants ──────────────────────────────────────────────────
('นนทบุรี',               'Nonthaburi'),
-- ── Pathum Thani variants ────────────────────────────────────────────────
('ปทุมธานี',              'Pathum Thani'),
('Pathumthani',           'Pathum Thani'),
-- ── Chon Buri variants ───────────────────────────────────────────────────
('ชลบุรี',                'Chon Buri'),
('ชลยุรี',                'Chon Buri'),
('CHONBURI',              'Chon Buri'),
('chonburi',              'Chon Buri'),
('Chonburi',              'Chon Buri'),
('Chang Wat Chon Buri',   'Chon Buri'),
('จังหวัดชลบุรี',        'Chon Buri'),
('จังหวัด ชลบุรี',       'Chon Buri'),
('จังหวัด ชลบุร',        'Chon Buri'),
-- ── Nakhon Ratchasima variants ───────────────────────────────────────────
('นครราชสีมา',            'Nakhon Ratchasima'),
('เมืองนครราชสีมา',      'Nakhon Ratchasima'),
('นครราขสีมา',            'Nakhon Ratchasima'),
('ครราชสีมา',             'Nakhon Ratchasima'),
('Nakhon Ratschasima',    'Nakhon Ratchasima'),
('Nakhon Rachasima',      'Nakhon Ratchasima'),
('nakorn rachasima',      'Nakhon Ratchasima'),
-- ── Phra Nakhon Si Ayutthaya variants ───────────────────────────────────
('พระนครศรีอยุธยา',      'Phra Nakhon Si Ayutthaya'),
('จังหวัดพระนครศรีอยุธยา','Phra Nakhon Si Ayutthaya'),
('Ayutthaya',             'Phra Nakhon Si Ayutthaya'),
('อยุธยา',                'Phra Nakhon Si Ayutthaya'),
-- ── Kanchanaburi variants ────────────────────────────────────────────────
('กาญจนบุรี',             'Kanchanaburi'),
-- ── Samut Prakan variants ────────────────────────────────────────────────
('สมุทรปราการ',           'Samut Prakan'),
('samutprakan',           'Samut Prakan'),
-- ── Samut Sakhon variants ────────────────────────────────────────────────
('สมุทรสาคร',             'Samut Sakhon'),
-- ── Samut Songkhram variants ─────────────────────────────────────────────
('สมุทรสงคราม',           'Samut Songkhram'),
-- ── Udon Thani variants ──────────────────────────────────────────────────
('อุดรธานี',              'Udon Thani'),
('อุดร',                  'Udon Thani'),
('udonthani',             'Udon Thani'),
('Udon Thani 390',        'Udon Thani'),
-- ── Ubon Ratchathani variants ────────────────────────────────────────────
('อุบลราชธานี',           'Ubon Ratchathani'),
('Ubon Rachathani',       'Ubon Ratchathani'),
('ubon ratchathani',      'Ubon Ratchathani'),
-- ── Roi Et variants ──────────────────────────────────────────────────────
('ร้อยเอ็ด',              'Roi Et'),
-- ── Si Sa Ket variants ───────────────────────────────────────────────────
('ศรีสะเกษ',              'Si Sa Ket'),
-- ── Surat Thani variants ─────────────────────────────────────────────────
('สุราษฎร์ธานี',          'Surat Thani'),
('สุราษฎธานี',            'Surat Thani'),
('สุราาษฎร์ธานี',         'Surat Thani'),
('จังหวักสุราษฏร์ธานี',  'Surat Thani'),
('Suratthani',            'Surat Thani'),
('surat thani',           'Surat Thani'),
-- ── Phang Nga variants ───────────────────────────────────────────────────
('พังงา',                 'Phang Nga'),
('Phangnga',              'Phang Nga'),
('Phang-nga',             'Phang Nga'),
('Phang-Nga',             'Phang Nga'),
-- ── Songkhla variants ────────────────────────────────────────────────────
('สงขลา',                 'Songkhla'),
-- ── Krabi variants ───────────────────────────────────────────────────────
('กระบี่',                'Krabi'),
('krabi',                 'Krabi'),
-- ── Buri Ram variants ────────────────────────────────────────────────────
('บุรีรัมย์',             'Buri Ram'),
('Buri ram',              'Buri Ram'),
('burriram',              'Buri Ram'),
('Burriram',              'Buri Ram'),
('Buriram',               'Buri Ram'),
-- ── Loei variants ────────────────────────────────────────────────────────
('เลย',                   'Loei'),
-- ── Mae Hong Son variants ────────────────────────────────────────────────
('แม่ฮ่องสอน',            'Mae Hong Son'),
('Maehongson',            'Mae Hong Son'),
-- ── Prahuap Khiri Khan variants ──────────────────────────────────────────
('ประจวบคีรีขันธ์',       'Prachuap Khiri Khan'),
('Prachuap Kirikhan',     'Prachuap Khiri Khan'),
('Prachuap Khirikhan',    'Prachuap Khiri Khan'),
('prachuap khiri khan',   'Prachuap Khiri Khan'),
-- ── Rayong variants ──────────────────────────────────────────────────────
('ระยอง',                 'Rayong'),
-- ── Ranong variants ──────────────────────────────────────────────────────
('ระนอง',                 'Ranong'),
-- ── Ratchaburi variants ──────────────────────────────────────────────────
('ราชบุรี',               'Ratchaburi'),
('ratchaburi',            'Ratchaburi'),
-- ── Sakon Nakhon variants ────────────────────────────────────────────────
('สกลนคร',                'Sakon Nakhon'),
-- ── Trat variants ────────────────────────────────────────────────────────
('ตราด',                  'Trat'),
('trat',                  'Trat'),
-- ── Trang variants ───────────────────────────────────────────────────────
('ตรัง',                  'Trang'),
-- ── Tak variants ─────────────────────────────────────────────────────────
('ตาก',                   'Tak'),
-- ── Nakhon Si Thammarat variants ─────────────────────────────────────────
('นครศรีธรรมราช',         'Nakhon Si Thammarat'),
('NaKhon Si Thammarat',   'Nakhon Si Thammarat'),
('Nakhon Sri Thammarat',  'Nakhon Si Thammarat'),
-- ── Lop Buri variants ────────────────────────────────────────────────────
('ลพบุรี',                'Lop Buri'),
('Lopburi',               'Lop Buri'),
-- ── Phrae variants ───────────────────────────────────────────────────────
('แพร่',                  'Phrae'),
-- ── Phetchabun variants ──────────────────────────────────────────────────
('เพชรบูรณ์',             'Phetchabun'),
-- ── Phetchaburi variants ─────────────────────────────────────────────────
('เพชรบุรี',              'Phetchaburi'),
('Petchaburi',            'Phetchaburi'),
-- ── Phitsanulok variants ─────────────────────────────────────────────────
('พิษณุโลก',              'Phitsanulok'),
-- ── Phayao variants ──────────────────────────────────────────────────────
('พะเยา',                 'Phayao'),
('phayao',                'Phayao'),
-- ── Pattani variants ─────────────────────────────────────────────────────
('ปัตตานี',               'Pattani'),
-- ── Narathiwat variants ──────────────────────────────────────────────────
('นราธิวาส',              'Narathiwat'),
-- ── Nakhon Sawan variants ────────────────────────────────────────────────
('นครสวรรค์',             'Nakhon Sawan'),
('Nakhonsawan',           'Nakhon Sawan'),
-- ── Nakhon Pathom variants ───────────────────────────────────────────────
('นครปฐม',                'Nakhon Pathom'),
('จังหวัดนครปฐม',        'Nakhon Pathom'),
-- ── Nakhon Phanom variants ───────────────────────────────────────────────
('นครพนม',                'Nakhon Phanom'),
('NakhonPhanom',          'Nakhon Phanom'),
-- ── Kamphaeng Phet variants ──────────────────────────────────────────────
('กำแพงเพชร',             'Kamphaeng Phet'),
-- ── Kalasin variants ─────────────────────────────────────────────────────
('กาฬสินธุ์',             'Kalasin'),
-- ── Lampang variants ─────────────────────────────────────────────────────
('ลำปาง',                 'Lampang'),
('lampang',               'Lampang'),
-- ── Lamphun variants ─────────────────────────────────────────────────────
('ลำพูน',                 'Lamphun'),
-- ── Maha Sarakham variants ───────────────────────────────────────────────
('มหาสารคาม',             'Maha Sarakham'),
('Mahasarakham',          'Maha Sarakham'),
-- ── Mukdahan variants ────────────────────────────────────────────────────
('มุกดาหาร',              'Mukdahan'),
-- ── Amnat Charoen variants ───────────────────────────────────────────────
('อำนาจเจริญ',            'Amnat Charoen'),
-- ── Yasothon variants ────────────────────────────────────────────────────
('ยโสธร',                 'Yasothon'),
('yasothon',              'Yasothon'),
-- ── Yala variants ────────────────────────────────────────────────────────
('ยะลา',                  'Yala'),
-- ── Uttaradit variants ───────────────────────────────────────────────────
('อุตรดิตถ์',             'Uttaradit'),
-- ── Uthai Thani variants ─────────────────────────────────────────────────
('อุทัยธานี',             'Uthai Thani'),
-- ── Chumphon variants ────────────────────────────────────────────────────
('ชุมพร',                 'Chumphon'),
-- ── Chanthaburi variants ─────────────────────────────────────────────────
('จันทบุรี',              'Chanthaburi'),
-- ── Chaiyaphum variants ──────────────────────────────────────────────────
('ชัยภูมิ',               'Chaiyaphum'),
-- ── Chachoengsao variants ────────────────────────────────────────────────
('ฉะเชิงเทรา',            'Chachoengsao'),
-- ── Nakhon Nayok variants ────────────────────────────────────────────────
('นครนายก',               'Nakhon Nayok'),
-- ── Nong Khai variants ───────────────────────────────────────────────────
('หนองคาย',               'Nong Khai'),
('Chang Wat Nong Khai',   'Nong Khai'),
-- ── Nong Bua Lam Phu variants ────────────────────────────────────────────
('หนองบัวลำภู',           'Nong Bua Lam Phu'),
-- ── Phatthalung variants ─────────────────────────────────────────────────
('พัทลุง',                'Phatthalung'),
-- ── Phichit variants ─────────────────────────────────────────────────────
('พิจิตร',                'Phichit'),
-- ── Sa Kaeo variants ─────────────────────────────────────────────────────
('สระแก้ว',               'Sa Kaeo'),
-- ── Saraburi variants ────────────────────────────────────────────────────
('สระบุรี',               'Saraburi'),
('จังหวัดสระบุรี',       'Saraburi'),
-- ── Satun variants ───────────────────────────────────────────────────────
-- Satun already canonical
-- ── Sukhothai variants ───────────────────────────────────────────────────
('สุโขทัย',               'Sukhothai'),
-- ── Suphan Buri variants ─────────────────────────────────────────────────
('สุพรรณบุรี',            'Suphan Buri'),
('Suphanburi',            'Suphan Buri'),
('จังหวัดสุพรรณบุรี',   'Suphan Buri'),
-- ── Surin variants ───────────────────────────────────────────────────────
('สุรินทร์',              'Surin'),
-- ── Sing Buri variants ───────────────────────────────────────────────────
('สิงห์บุรี',             'Sing Buri'),
-- ── Ang Thong variants ───────────────────────────────────────────────────
('อ่างทอง',               'Ang Thong'),
-- ── Bueng Kan variants ───────────────────────────────────────────────────
('บึงกาฬ',                'Bueng Kan'),
-- ── Chai Nat variants ────────────────────────────────────────────────────
('ชัยนาท',                'Chai Nat'),
-- ── Nan variants ─────────────────────────────────────────────────────────
('น่าน',                  'Nan'),
-- ── extra Chang Wat variants ─────────────────────────────────────────────
('Chang Wat Pathum Thani','Pathum Thani'),
('Chang Wat Phetchaburi', 'Phetchaburi')
ON CONFLICT (alias) DO NOTHING;

-- ============================================================================
-- PART 3: Updated get_map_province_aggregates with normalization
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_map_province_aggregates(uuid[]);

CREATE FUNCTION public.get_map_province_aggregates(
  p_venue_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id                        text,
  name                      text,
  province                  text,
  lat                       double precision,
  lng                       double precision,
  pin_type                  text,
  pin_state                 text,
  aggregate_level           text,
  aggregate_shop_count      bigint,
  aggregate_dominant_count  bigint,
  promotion_score           numeric,
  visibility_score          numeric,
  verified_active           boolean,
  glow_active               boolean,
  boost_active              boolean,
  giant_active              boolean,
  sign_scale                numeric,
  cover_image               text,
  pin_metadata              jsonb
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH resolved AS (
    -- Resolve each venue's province to a canonical Thai province name
    SELECT
      v.id,
      v.latitude,
      v.longitude,
      v.visibility_score,
      v.status,
      v.verified_until,
      v.glow_until,
      v.boost_until,
      v.giant_until,
      v.pin_type,
      v.image_urls,
      v.pin_metadata,
      v.created_at,
      -- Canonical name lookup:
      -- 1. Try exact match in th_provinces (canonical EN or TH)
      -- 2. Try alias table
      -- 3. NULL if unresolvable (venue will be excluded)
      COALESCE(
        -- Direct canonical EN match
        tp1.name_en,
        -- Direct canonical TH match
        tp2.name_en,
        -- Alias match (case-insensitive via stored lowercase alias)
        ta.name_en
      ) AS canonical_province
    FROM public.venues v
    -- Direct EN match
    LEFT JOIN public.th_provinces tp1
           ON tp1.name_en = v.province
    -- Direct TH match
    LEFT JOIN public.th_provinces tp2
           ON tp2.name_th = v.province
    -- Alias match
    LEFT JOIN public.th_province_aliases ta
           ON ta.alias = v.province
    WHERE
      v.deleted_at IS NULL
      AND (v.is_deleted IS NULL OR v.is_deleted = false)
      AND v.latitude  IS NOT NULL
      AND v.longitude IS NOT NULL
      AND v.province  IS NOT NULL
      AND trim(v.province) <> ''
      AND (p_venue_ids IS NULL OR v.id = ANY(p_venue_ids))
  ),
  thai_only AS (
    -- Keep only venues that resolved to a canonical Thai province
    SELECT r.*, tp.lat_hint, tp.lng_hint
    FROM resolved r
    JOIN public.th_provinces tp ON tp.name_en = r.canonical_province
    WHERE r.canonical_province IS NOT NULL
  )
  SELECT
    lower(canonical_province)                          AS id,
    canonical_province                                 AS name,
    canonical_province                                 AS province,

    -- Use real average, fall back to hint for empty provinces
    COALESCE(AVG(latitude),  MAX(lat_hint))            AS lat,
    COALESCE(AVG(longitude), MAX(lng_hint))            AS lng,

    'giant'::text                                      AS pin_type,
    'province'::text                                   AS pin_state,
    'province'::text                                   AS aggregate_level,

    COUNT(*)                                           AS aggregate_shop_count,

    COUNT(*) FILTER (
      WHERE lower(status::text) IN ('active','live','tonight','open')
    )                                                  AS aggregate_dominant_count,

    COALESCE(MAX(visibility_score),  0)::numeric       AS promotion_score,
    COALESCE(AVG(visibility_score),  0)::numeric       AS visibility_score,

    BOOL_OR(verified_until IS NOT NULL AND verified_until > now()) AS verified_active,
    BOOL_OR(glow_until     IS NOT NULL AND glow_until     > now()) AS glow_active,
    BOOL_OR(boost_until    IS NOT NULL AND boost_until    > now()) AS boost_active,
    BOOL_OR(
      (giant_until IS NOT NULL AND giant_until > now())
      OR lower(COALESCE(pin_type,'')) = 'giant'
    )                                                              AS giant_active,

    GREATEST(
      1.0,
      LEAST(2.0, LOG(GREATEST(COUNT(*),1)+1)*0.4+0.8)
    )::numeric                                         AS sign_scale,

    (ARRAY_AGG(
       image_urls[1]
       ORDER BY COALESCE(visibility_score,0) DESC NULLS LAST,
                created_at DESC NULLS LAST
     ) FILTER (
       WHERE image_urls[1] IS NOT NULL AND image_urls[1] <> ''
     )
    )[1]                                               AS cover_image,

    COALESCE(
      (ARRAY_AGG(
         pin_metadata
         ORDER BY COALESCE(visibility_score,0) DESC NULLS LAST
       ) FILTER (
         WHERE pin_metadata IS NOT NULL AND pin_metadata <> '{}'::jsonb
       )
      )[1],
      '{}'::jsonb
    )                                                  AS pin_metadata

  FROM thai_only
  GROUP BY canonical_province
  HAVING COUNT(*) > 0
  ORDER BY COUNT(*) DESC
$$;

GRANT EXECUTE
  ON FUNCTION public.get_map_province_aggregates(uuid[])
  TO anon, authenticated, service_role;

-- ============================================================================
-- PART 4: Helper — list provinces with no venues (for data gap analysis)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_province_coverage AS
  SELECT
    tp.id,
    tp.name_en,
    tp.name_th,
    tp.region,
    tp.lat_hint,
    tp.lng_hint,
    COALESCE(agg.shop_count, 0) AS shop_count,
    COALESCE(agg.shop_count, 0) > 0 AS has_venues
  FROM public.th_provinces tp
  LEFT JOIN (
    SELECT
      COALESCE(tp1.name_en, tp2.name_en, ta.name_en) AS canon,
      COUNT(*) AS shop_count
    FROM public.venues v
    LEFT JOIN public.th_provinces    tp1 ON tp1.name_en = v.province
    LEFT JOIN public.th_provinces    tp2 ON tp2.name_th = v.province
    LEFT JOIN public.th_province_aliases ta ON ta.alias = v.province
    WHERE v.deleted_at IS NULL AND (v.is_deleted IS NULL OR v.is_deleted = false)
    GROUP BY 1
  ) agg ON agg.canon = tp.name_en
  ORDER BY tp.region, tp.name_en;

GRANT SELECT ON public.v_province_coverage TO anon, authenticated, service_role;

COMMIT;
