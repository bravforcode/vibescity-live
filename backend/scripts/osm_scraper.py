#!/usr/bin/env python3
"""
OSM Thailand Entertainment Scraper - Full 77 Province Coverage
Fetches all entertainment venues from OpenStreetMap
Designed for cloud deployment with scheduled runs
"""
import asyncio
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import httpx

# Overpass API endpoints (multiple for load balancing)
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# ═══════════════════════════════════════════════════════════════════════════════
# ALL 77 THAI PROVINCES WITH BOUNDING BOXES (south, west, north, east)
# ═══════════════════════════════════════════════════════════════════════════════
THAILAND_PROVINCES = {
    # ภาคเหนือ (Northern)
    "เชียงใหม่": {"bbox": (18.2, 98.0, 19.9, 99.5), "en": "Chiang Mai", "region": "north"},
    "เชียงราย": {"bbox": (19.4, 99.3, 20.5, 100.5), "en": "Chiang Rai", "region": "north"},
    "ลำปาง": {"bbox": (17.7, 99.0, 19.4, 100.0), "en": "Lampang", "region": "north"},
    "ลำพูน": {"bbox": (18.3, 98.7, 18.9, 99.2), "en": "Lamphun", "region": "north"},
    "แม่ฮ่องสอน": {"bbox": (17.8, 97.4, 19.8, 98.6), "en": "Mae Hong Son", "region": "north"},
    "น่าน": {"bbox": (18.2, 100.4, 19.8, 101.4), "en": "Nan", "region": "north"},
    "พะเยา": {"bbox": (18.8, 99.6, 19.9, 100.6), "en": "Phayao", "region": "north"},
    "แพร่": {"bbox": (17.8, 99.5, 18.6, 100.3), "en": "Phrae", "region": "north"},
    "อุตรดิตถ์": {"bbox": (17.1, 99.7, 18.4, 101.0), "en": "Uttaradit", "region": "north"},

    # ภาคตะวันออกเฉียงเหนือ (Northeastern / Isan)
    "กาฬสินธุ์": {"bbox": (16.1, 103.2, 17.2, 104.3), "en": "Kalasin", "region": "northeast"},
    "ขอนแก่น": {"bbox": (15.6, 102.0, 17.2, 103.5), "en": "Khon Kaen", "region": "northeast"},
    "ชัยภูมิ": {"bbox": (15.3, 101.3, 16.5, 102.5), "en": "Chaiyaphum", "region": "northeast"},
    "นครพนม": {"bbox": (16.8, 103.9, 18.1, 104.9), "en": "Nakhon Phanom", "region": "northeast"},
    "นครราชสีมา": {"bbox": (14.1, 101.5, 15.8, 103.0), "en": "Nakhon Ratchasima", "region": "northeast"},
    "บึงกาฬ": {"bbox": (17.7, 103.3, 18.5, 104.2), "en": "Bueng Kan", "region": "northeast"},
    "บุรีรัมย์": {"bbox": (14.3, 102.5, 15.5, 103.6), "en": "Buriram", "region": "northeast"},
    "มหาสารคาม": {"bbox": (15.6, 102.7, 16.4, 103.5), "en": "Maha Sarakham", "region": "northeast"},
    "มุกดาหาร": {"bbox": (16.0, 104.2, 16.9, 105.0), "en": "Mukdahan", "region": "northeast"},
    "ยโสธร": {"bbox": (15.4, 103.9, 16.1, 104.6), "en": "Yasothon", "region": "northeast"},
    "ร้อยเอ็ด": {"bbox": (15.5, 103.3, 16.4, 104.3), "en": "Roi Et", "region": "northeast"},
    "เลย": {"bbox": (16.7, 101.0, 18.0, 102.2), "en": "Loei", "region": "northeast"},
    "ศรีสะเกษ": {"bbox": (14.4, 103.8, 15.5, 105.0), "en": "Si Sa Ket", "region": "northeast"},
    "สกลนคร": {"bbox": (16.7, 103.4, 18.0, 104.5), "en": "Sakon Nakhon", "region": "northeast"},
    "สุรินทร์": {"bbox": (14.4, 103.1, 15.4, 104.2), "en": "Surin", "region": "northeast"},
    "หนองคาย": {"bbox": (17.5, 102.2, 18.5, 103.3), "en": "Nong Khai", "region": "northeast"},
    "หนองบัวลำภู": {"bbox": (16.8, 102.0, 17.5, 102.7), "en": "Nong Bua Lam Phu", "region": "northeast"},
    "อำนาจเจริญ": {"bbox": (15.4, 104.4, 16.1, 105.2), "en": "Amnat Charoen", "region": "northeast"},
    "อุดรธานี": {"bbox": (16.8, 102.3, 18.0, 103.5), "en": "Udon Thani", "region": "northeast"},
    "อุบลราชธานี": {"bbox": (14.5, 104.3, 16.0, 105.7), "en": "Ubon Ratchathani", "region": "northeast"},

    # ภาคกลาง (Central)
    "กรุงเทพมหานคร": {"bbox": (13.5, 100.3, 14.0, 100.9), "en": "Bangkok", "region": "central"},
    "กาญจนบุรี": {"bbox": (13.8, 98.7, 15.6, 99.9), "en": "Kanchanaburi", "region": "central"},
    "ชัยนาท": {"bbox": (14.9, 99.7, 15.5, 100.4), "en": "Chai Nat", "region": "central"},
    "นครนายก": {"bbox": (14.0, 100.9, 14.5, 101.5), "en": "Nakhon Nayok", "region": "central"},
    "นครปฐม": {"bbox": (13.7, 99.8, 14.2, 100.3), "en": "Nakhon Pathom", "region": "central"},
    "นครสวรรค์": {"bbox": (15.3, 99.5, 16.2, 100.6), "en": "Nakhon Sawan", "region": "central"},
    "นนทบุรี": {"bbox": (13.8, 100.3, 14.0, 100.6), "en": "Nonthaburi", "region": "central"},
    "ปทุมธานี": {"bbox": (13.9, 100.4, 14.3, 100.8), "en": "Pathum Thani", "region": "central"},
    "พระนครศรีอยุธยา": {"bbox": (14.1, 100.2, 14.6, 100.7), "en": "Ayutthaya", "region": "central"},
    "พิจิตร": {"bbox": (15.8, 99.9, 16.5, 100.7), "en": "Phichit", "region": "central"},
    "พิษณุโลก": {"bbox": (16.3, 99.7, 17.5, 101.0), "en": "Phitsanulok", "region": "central"},
    "เพชรบูรณ์": {"bbox": (15.5, 100.7, 17.0, 101.7), "en": "Phetchabun", "region": "central"},
    "ลพบุรี": {"bbox": (14.6, 100.3, 15.5, 101.2), "en": "Lopburi", "region": "central"},
    "สมุทรปราการ": {"bbox": (13.4, 100.5, 13.7, 100.9), "en": "Samut Prakan", "region": "central"},
    "สมุทรสงคราม": {"bbox": (13.3, 99.9, 13.5, 100.1), "en": "Samut Songkhram", "region": "central"},
    "สมุทรสาคร": {"bbox": (13.4, 100.0, 13.7, 100.4), "en": "Samut Sakhon", "region": "central"},
    "สระบุรี": {"bbox": (14.2, 100.7, 14.9, 101.3), "en": "Saraburi", "region": "central"},
    "สิงห์บุรี": {"bbox": (14.7, 100.2, 15.1, 100.5), "en": "Sing Buri", "region": "central"},
    "สุโขทัย": {"bbox": (16.7, 99.4, 17.6, 100.1), "en": "Sukhothai", "region": "central"},
    "สุพรรณบุรี": {"bbox": (14.2, 99.5, 15.0, 100.3), "en": "Suphan Buri", "region": "central"},
    "อ่างทอง": {"bbox": (14.4, 100.2, 14.7, 100.5), "en": "Ang Thong", "region": "central"},
    "อุทัยธานี": {"bbox": (15.0, 99.4, 15.8, 100.1), "en": "Uthai Thani", "region": "central"},
    "กำแพงเพชร": {"bbox": (15.9, 99.2, 16.8, 99.9), "en": "Kamphaeng Phet", "region": "central"},
    "ตาก": {"bbox": (15.8, 98.5, 17.6, 99.5), "en": "Tak", "region": "central"},

    # ภาคตะวันออก (Eastern)
    "จันทบุรี": {"bbox": (12.4, 101.6, 13.2, 102.6), "en": "Chanthaburi", "region": "east"},
    "ฉะเชิงเทรา": {"bbox": (13.4, 100.8, 13.9, 101.7), "en": "Chachoengsao", "region": "east"},
    "ชลบุรี": {"bbox": (12.8, 100.8, 13.6, 101.6), "en": "Chonburi", "region": "east"},
    "ตราด": {"bbox": (11.7, 102.2, 12.6, 102.9), "en": "Trat", "region": "east"},
    "ปราจีนบุรี": {"bbox": (13.7, 101.2, 14.4, 102.1), "en": "Prachin Buri", "region": "east"},
    "ระยอง": {"bbox": (12.5, 101.0, 13.0, 101.8), "en": "Rayong", "region": "east"},
    "สระแก้ว": {"bbox": (13.4, 102.0, 14.2, 102.8), "en": "Sa Kaeo", "region": "east"},

    # ภาคตะวันตก (Western)
    "ประจวบคีรีขันธ์": {"bbox": (11.0, 99.3, 12.5, 100.0), "en": "Prachuap Khiri Khan", "region": "west"},
    "เพชรบุรี": {"bbox": (12.4, 99.4, 13.3, 100.1), "en": "Phetchaburi", "region": "west"},
    "ราชบุรี": {"bbox": (13.2, 99.3, 13.8, 100.0), "en": "Ratchaburi", "region": "west"},

    # ภาคใต้ (Southern)
    "กระบี่": {"bbox": (7.7, 98.6, 8.5, 99.3), "en": "Krabi", "region": "south"},
    "ชุมพร": {"bbox": (9.5, 98.8, 10.8, 99.5), "en": "Chumphon", "region": "south"},
    "ตรัง": {"bbox": (7.1, 99.3, 7.8, 100.0), "en": "Trang", "region": "south"},
    "นครศรีธรรมราช": {"bbox": (7.8, 99.4, 9.0, 100.2), "en": "Nakhon Si Thammarat", "region": "south"},
    "นราธิวาส": {"bbox": (5.8, 101.4, 6.5, 102.1), "en": "Narathiwat", "region": "south"},
    "ปัตตานี": {"bbox": (6.5, 101.0, 7.0, 101.6), "en": "Pattani", "region": "south"},
    "พังงา": {"bbox": (8.2, 98.2, 9.0, 98.7), "en": "Phang Nga", "region": "south"},
    "พัทลุง": {"bbox": (7.2, 99.6, 7.8, 100.2), "en": "Phatthalung", "region": "south"},
    "ภูเก็ต": {"bbox": (7.7, 98.2, 8.2, 98.5), "en": "Phuket", "region": "south"},
    "ยะลา": {"bbox": (5.8, 100.8, 6.5, 101.4), "en": "Yala", "region": "south"},
    "ระนอง": {"bbox": (9.4, 98.4, 10.0, 99.0), "en": "Ranong", "region": "south"},
    "สงขลา": {"bbox": (6.5, 100.0, 7.5, 101.0), "en": "Songkhla", "region": "south"},
    "สตูล": {"bbox": (6.4, 99.5, 7.1, 100.1), "en": "Satun", "region": "south"},
    "สุราษฎร์ธานี": {"bbox": (8.4, 98.8, 9.7, 99.8), "en": "Surat Thani", "region": "south"},
}

# ═══════════════════════════════════════════════════════════════════════════════
# ALL VENUE TYPES — Maximum Thailand coverage
# ═══════════════════════════════════════════════════════════════════════════════
VENUE_TYPES = {
    "amenity": [
        # Food & Drink
        "bar", "pub", "nightclub", "biergarten", "brewery",
        "restaurant", "cafe", "fast_food", "food_court",
        "ice_cream", "juice_bar", "bubble_tea",
        # Entertainment
        "cinema", "theatre", "arts_centre", "community_centre",
        "casino", "gambling", "events_venue",
        "karaoke_box", "music_venue", "concert_hall",
        # Wellness
        "spa", "sauna", "massage",
        # Health
        "pharmacy", "clinic", "dentist", "veterinary", "hospital",
        # Finance
        "bank", "post_office",
        # Market
        "marketplace",
        # Culture
        "library", "place_of_worship",
        # Automotive
        "car_rental", "car_wash",
        # Other
        "fuel",
    ],
    "leisure": [
        "dance", "nightclub", "amusement_arcade", "bowling_alley",
        "escape_game", "beach_resort",
        "water_park", "theme_park", "miniature_golf",
        "sports_centre", "fitness_centre", "stadium",
        "swimming_pool", "golf_course",
        "park", "garden", "nature_reserve",
        "sauna", "turkish_bath",
    ],
    "tourism": [
        "attraction", "viewpoint", "museum", "gallery",
        "zoo", "aquarium", "theme_park",
        "hotel", "hostel", "guest_house", "motel",
        "apartment", "chalet", "camp_site",
        "information", "picnic_site",
    ],
    "shop": [
        # Department & Grocery
        "mall", "department_store", "supermarket",
        "convenience", "alcohol", "wine", "wholesale",
        # Food specialty
        "bakery", "butcher", "seafood", "greengrocer",
        "deli", "confectionery", "tea", "coffee", "frozen_food",
        # Fashion
        "clothes", "shoes", "accessories", "jewelry",
        "watches", "bag", "boutique", "second_hand", "tailor",
        # Beauty & Health
        "hairdresser", "beauty", "cosmetics", "perfumery",
        "optician", "massage", "tattoo",
        # Electronics
        "electronics", "mobile_phone", "computer", "camera",
        "video_games",
        # Home
        "furniture", "interior_decoration", "bed",
        "carpet", "kitchen", "hardware", "paint", "garden",
        "doityourself",
        # Books & Stationery
        "books", "stationery", "art", "music",
        "musical_instrument",
        # Sports & Outdoor
        "sports", "outdoor", "bicycle",
        # Auto
        "car", "car_repair", "car_parts", "motorcycle", "tyres",
        # Gifts & Leisure
        "gift", "souvenir", "antiques", "toys",
        "florist", "pet",
        # Services
        "laundry", "dry_cleaning", "travel_agency",
        "pharmacy", "medical_supply",
        "tobacco", "newsagent", "copyshop", "photo",
    ],
    "craft": [
        "tailor", "shoemaker", "jeweller", "watchmaker",
        "bakery", "brewery", "winery",
        "pottery", "photographer", "florist",
    ],
}

# Category mapping for Thai names
CATEGORY_MAP = {
    # Food & Drink
    "bar": "บาร์", "pub": "ผับ", "nightclub": "ไนท์คลับ",
    "restaurant": "ร้านอาหาร", "cafe": "คาเฟ่", "fast_food": "ฟาสต์ฟู้ด",
    "food_court": "ฟู้ดคอร์ท", "ice_cream": "ไอศกรีม", "bubble_tea": "ชานมไข่มุก",
    "juice_bar": "น้ำผลไม้", "bakery": "เบเกอรี่", "seafood": "อาหารทะเล",
    "butcher": "ร้านเนื้อ", "greengrocer": "ผักผลไม้", "confectionery": "ขนม",
    "deli": "เดลิ", "tea": "ร้านชา", "coffee": "ร้านกาแฟ",
    # Entertainment
    "cinema": "โรงหนัง", "theatre": "โรงละคร", "music_venue": "สถานที่แสดงดนตรี",
    "karaoke_box": "คาราโอเกะ", "events_venue": "สถานที่จัดงาน",
    "concert_hall": "คอนเสิร์ตฮอลล์", "casino": "คาสิโน",
    "amusement_arcade": "เกมส์", "escape_game": "เกมหนีห้อง",
    "bowling_alley": "โบว์ลิ่ง",
    # Wellness
    "spa": "สปา", "massage": "นวด", "sauna": "ซาวน่า",
    "fitness_centre": "ฟิตเนส", "sports_centre": "ศูนย์กีฬา",
    "swimming_pool": "สระว่ายน้ำ", "golf_course": "สนามกอล์ฟ",
    # Hotels & Accommodation
    "hotel": "โรงแรม", "hostel": "โฮสเทล", "guest_house": "เกสต์เฮาส์",
    "motel": "โมเทล", "apartment": "อพาร์ทเมนต์", "camp_site": "แคมป์ปิ้ง",
    # Tourism
    "attraction": "สถานที่ท่องเที่ยว", "museum": "พิพิธภัณฑ์",
    "gallery": "แกลเลอรี่", "zoo": "สวนสัตว์", "aquarium": "พิพิธภัณฑ์สัตว์น้ำ",
    "viewpoint": "จุดชมวิว", "theme_park": "สวนสนุก",
    "water_park": "สวนน้ำ", "beach_resort": "รีสอร์ทชายหาด",
    # Health & Services
    "pharmacy": "ร้านขายยา", "clinic": "คลินิก", "dentist": "ทันตแพทย์",
    "veterinary": "สัตวแพทย์", "hospital": "โรงพยาบาล",
    "optician": "ร้านแว่นตา",
    # Shopping
    "mall": "ห้างสรรพสินค้า", "department_store": "ห้างสรรพสินค้า",
    "supermarket": "ซูเปอร์มาร์เก็ต", "convenience": "ร้านสะดวกซื้อ",
    "marketplace": "ตลาด", "wholesale": "ค้าส่ง",
    "clothes": "ร้านเสื้อผ้า", "shoes": "ร้านรองเท้า",
    "accessories": "เครื่องประดับ", "jewelry": "ร้านทอง",
    "bag": "กระเป๋า", "tailor": "ร้านตัดเสื้อ", "second_hand": "มือสอง",
    "hairdresser": "ร้านตัดผม", "beauty": "ร้านเสริมสวย",
    "cosmetics": "เครื่องสำอาง", "tattoo": "สักลาย",
    "electronics": "อิเล็กทรอนิกส์", "mobile_phone": "มือถือ",
    "computer": "คอมพิวเตอร์", "camera": "กล้อง",
    "furniture": "เฟอร์นิเจอร์", "hardware": "วัสดุก่อสร้าง",
    "sports": "อุปกรณ์กีฬา", "outdoor": "อุปกรณ์กลางแจ้ง",
    "bicycle": "จักรยาน",
    "books": "ร้านหนังสือ", "stationery": "เครื่องเขียน",
    "music": "ดนตรี", "musical_instrument": "เครื่องดนตรี",
    "gift": "ของขวัญ", "souvenir": "ของที่ระลึก",
    "antiques": "ของเก่า", "toys": "ของเล่น",
    "florist": "ร้านดอกไม้", "pet": "สัตว์เลี้ยง",
    "laundry": "ร้านซักรีด", "travel_agency": "บริษัทนำเที่ยว",
    "car": "รถยนต์", "car_repair": "ซ่อมรถ", "motorcycle": "มอเตอร์ไซค์",
    "bank": "ธนาคาร", "post_office": "ไปรษณีย์",
    "park": "สวนสาธารณะ", "garden": "สวน", "nature_reserve": "เขตอนุรักษ์",
    "library": "ห้องสมุด", "place_of_worship": "ศาสนสถาน",
    "fuel": "ปั๊มน้ำมัน",
}

logger = logging.getLogger("osm_scraper")


def build_province_query(bbox: tuple) -> str:
    """Build comprehensive Overpass query for all venue types"""
    south, west, north, east = bbox

    queries = []
    for tag_key, tag_values in VENUE_TYPES.items():
        for v in tag_values:
            queries.append(f'node["{tag_key}"="{v}"]({south},{west},{north},{east});')
            queries.append(f'way["{tag_key}"="{v}"]({south},{west},{north},{east});')

    return f"""
    [out:json][timeout:120];
    (
      {chr(10).join(queries)}
    );
    out center body;
    """


async def fetch_with_retry(query: str, max_retries: int = 3) -> list[dict]:
    """Fetch from Overpass with retry and endpoint rotation"""
    for attempt in range(max_retries):
        endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(
                    endpoint,
                    data={"data": query},
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                response.raise_for_status()
                return response.json().get("elements", [])
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning(
                "Attempt %s failed for %s: %s",
                attempt + 1,
                endpoint,
                exc,
            )
            await asyncio.sleep(5 * (attempt + 1))
    return []


def parse_element(element: dict, province: str, province_en: str, region: str) -> dict | None:
    """Parse OSM element into venue dict"""
    tags = element.get("tags", {})

    # Get name
    name = tags.get("name") or tags.get("name:th") or tags.get("name:en")
    if not name:
        return None

    # Get coordinates
    if element.get("type") == "node":
        lat, lng = element.get("lat"), element.get("lon")
    else:
        center = element.get("center", {})
        lat, lng = center.get("lat"), center.get("lon")

    if not lat or not lng:
        return None

    # Determine category
    category_raw = (
        tags.get("amenity") or tags.get("leisure") or
        tags.get("tourism") or tags.get("shop") or "other"
    )

    return {
        "osm_id": str(element.get("id", "")),
        "osm_type": element.get("type"),
        "name": name,
        "name_en": tags.get("name:en", ""),
        "name_th": tags.get("name:th", name),
        "category": CATEGORY_MAP.get(category_raw, category_raw),
        "category_raw": category_raw,
        "latitude": lat,
        "longitude": lng,
        "province": province,
        "province_en": province_en,
        "region": region,
        "address": tags.get("addr:full") or tags.get("addr:street", ""),
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "opening_hours": tags.get("opening_hours"),
        "cuisine": tags.get("cuisine"),
        "facebook": tags.get("contact:facebook"),
        "instagram": tags.get("contact:instagram"),
        "tiktok": tags.get("contact:tiktok"),
        "rating": tags.get("stars"),
        "source": "openstreetmap",
        "fetched_at": datetime.now(UTC).isoformat(),
    }


async def scrape_province(province_name: str, province_data: dict) -> list[dict]:
    """Scrape all entertainment venues from a province"""
    query = build_province_query(province_data["bbox"])
    elements = await fetch_with_retry(query)

    venues = []
    for el in elements:
        venue = parse_element(
            el,
            province_name,
            province_data["en"],
            province_data["region"]
        )
        if venue:
            venues.append(venue)

    return venues


async def scrape_all_thailand(batch_size: int = 5) -> dict:
    """Scrape all 77 provinces in batches to avoid rate limiting"""
    all_venues = []
    provinces = list(THAILAND_PROVINCES.items())
    total = len(provinces)

    logger.info("🇹🇭 Starting Thailand-wide scrape: %s provinces", total)
    logger.info("🏷️  Categories: %s", len([v for vl in VENUE_TYPES.values() for v in vl]))
    logger.info("%s", "-" * 60)

    for i in range(0, total, batch_size):
        batch = provinces[i:i + batch_size]
        batch_names = [p[0] for p in batch]
        logger.info(
            "📍 Batch %s/%s: %s",
            i // batch_size + 1,
            (total + batch_size - 1) // batch_size,
            ", ".join(batch_names),
        )

        # Parallel fetch within batch
        tasks = [scrape_province(name, data) for name, data in batch]
        results = await asyncio.gather(*tasks)

        for name, venues in zip(batch_names, results, strict=False):
            logger.info("   ✅ %s: %s venues", name, len(venues))
            all_venues.extend(venues)

        # Rate limit between batches
        if i + batch_size < total:
            logger.info("   ⏳ Waiting 10s before next batch...")
            await asyncio.sleep(10)

    # Summary by region
    region_counts = {}
    for v in all_venues:
        r = v.get("region", "unknown")
        region_counts[r] = region_counts.get(r, 0) + 1

    logger.info("%s", "=" * 60)
    logger.info("📊 TOTAL: %s venues across %s provinces", len(all_venues), total)
    logger.info("📊 By Region:")
    for region, count in sorted(region_counts.items(), key=lambda x: -x[1]):
        logger.info("   %s: %s", region, count)

    return {
        "meta": {
            "source": "OpenStreetMap via Overpass API",
            "license": "ODbL - Open Database License",
            "attribution": "© OpenStreetMap contributors",
            "scraped_at": datetime.now(UTC).isoformat(),
            "total_venues": len(all_venues),
            "provinces_scraped": total,
            "regions": region_counts,
        },
        "venues": all_venues
    }


def save_results(data: dict, filename: str = "thailand_venues.json"):
    """Save results to JSON file"""
    output_path = Path(__file__).parent / filename
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info("💾 Saved to %s", output_path)
    return output_path


async def main():
    """Main entry point"""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logger.info("🚀 OSM Thailand Entertainment Scraper")
    logger.info("📅 Started at: %s", datetime.now(UTC).isoformat())

    data = await scrape_all_thailand()
    save_results(data)

    logger.info("✅ Scraping complete!")
    return data


if __name__ == "__main__":
    asyncio.run(main())
