import logging

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException

router = APIRouter()
logger = logging.getLogger(__name__)

# Cache: 100 items, 1 hour TTL (3600 seconds)
# Key: province_name
places_cache = TTLCache(maxsize=100, ttl=3600)

# Province center coordinates (Copied from frontend constants)
PROVINCE_CENTERS = {
    # Northern
    "เชียงใหม่": {"lat": 18.7883, "lng": 98.9853},
    "เชียงราย": {"lat": 19.9105, "lng": 99.8406},
    "ลำปาง": {"lat": 18.2888, "lng": 99.4908},
    "ลำพูน": {"lat": 18.5748, "lng": 99.0087},
    "แม่ฮ่องสอน": {"lat": 19.302, "lng": 97.9654},
    "น่าน": {"lat": 18.7756, "lng": 100.773},
    "พะเยา": {"lat": 19.1662, "lng": 99.9022},
    "แพร่": {"lat": 18.1446, "lng": 100.1403},
    "อุตรดิตถ์": {"lat": 17.6201, "lng": 100.0993},

    # Northeastern
    "อำนาจเจริญ": {"lat": 15.8617, "lng": 104.6225},
    "บึงกาฬ": {"lat": 18.3619, "lng": 103.6464},
    "บุรีรัมย์": {"lat": 14.993, "lng": 103.1029},
    "ชัยภูมิ": {"lat": 15.8105, "lng": 102.0289},
    "กาฬสินธุ์": {"lat": 16.4293, "lng": 103.5065},
    "ขอนแก่น": {"lat": 16.4322, "lng": 102.8236},
    "เลย": {"lat": 17.486, "lng": 101.7223},
    "มหาสารคาม": {"lat": 16.185, "lng": 103.3006},
    "มุกดาหาร": {"lat": 16.5436, "lng": 104.7046},
    "นครพนม": {"lat": 17.4069, "lng": 104.7818},
    "นครราชสีมา": {"lat": 14.9799, "lng": 102.0978},
    "หนองบัวลำภู": {"lat": 17.2029, "lng": 102.434},
    "หนองคาย": {"lat": 17.8785, "lng": 102.742},
    "ร้อยเอ็ด": {"lat": 16.0537, "lng": 103.652},
    "สกลนคร": {"lat": 17.1546, "lng": 104.1487},
    "ศรีสะเกษ": {"lat": 15.1186, "lng": 104.322},
    "สุรินทร์": {"lat": 14.8818, "lng": 103.4936},
    "อุบลราชธานี": {"lat": 15.2448, "lng": 104.8473},
    "อุดรธานี": {"lat": 17.4156, "lng": 102.7872},
    "ยโสธร": {"lat": 15.7924, "lng": 104.145},

    # Central
    "อ่างทอง": {"lat": 14.5896, "lng": 100.4551},
    "พระนครศรีอยุธยา": {"lat": 14.3532, "lng": 100.5684},
    "กรุงเทพฯ": {"lat": 13.7563, "lng": 100.5018},
    "ชัยนาท": {"lat": 15.1848, "lng": 100.1253},
    "กำแพงเพชร": {"lat": 16.4828, "lng": 99.5227},
    "ลพบุรี": {"lat": 14.7995, "lng": 100.6533},
    "นครนายก": {"lat": 14.2069, "lng": 101.2131},
    "นครปฐม": {"lat": 13.8198, "lng": 100.0602},
    "นครสวรรค์": {"lat": 15.7042, "lng": 100.1372},
    "นนทบุรี": {"lat": 13.8621, "lng": 100.514},
    "ปทุมธานี": {"lat": 14.0208, "lng": 100.525},
    "เพชรบูรณ์": {"lat": 16.419, "lng": 101.1567},
    "พิจิตร": {"lat": 16.4419, "lng": 100.3488},
    "พิษณุโลก": {"lat": 16.8211, "lng": 100.2659},
    "สมุทรปราการ": {"lat": 13.5991, "lng": 100.5968},
    "สมุทรสาคร": {"lat": 13.5475, "lng": 100.2836},
    "สมุทรสงคราม": {"lat": 13.4098, "lng": 100.0023},
    "สระบุรี": {"lat": 14.5289, "lng": 100.9108},
    "สิงห์บุรี": {"lat": 14.891, "lng": 100.3957},
    "สุโขทัย": {"lat": 17.0044, "lng": 99.8264},
    "สุพรรณบุรี": {"lat": 14.4745, "lng": 100.1177},
    "อุทัยธานี": {"lat": 15.3831, "lng": 100.0247},

    # Eastern
    "ฉะเชิงเทรา": {"lat": 13.6961, "lng": 101.0743},
    "จันทบุรี": {"lat": 12.6114, "lng": 102.1039},
    "ชลบุรี": {"lat": 13.3611, "lng": 100.9847},
    "พัทยา": {"lat": 12.9236, "lng": 100.8825},
    "ปราจีนบุรี": {"lat": 14.0509, "lng": 101.3716},
    "ระยอง": {"lat": 12.6815, "lng": 101.2816},
    "สระแก้ว": {"lat": 13.805, "lng": 102.0543},
    "ตราด": {"lat": 12.2378, "lng": 102.5171},

    # Western
    "กาญจนบุรี": {"lat": 14.0226, "lng": 99.5327},
    "เพชรบุรี": {"lat": 13.109, "lng": 99.9398},
    "ประจวบคีรีขันธ์": {"lat": 11.8253, "lng": 99.7899},
    "หัวหิน": {"lat": 12.5684, "lng": 99.9577},
    "ราชบุรี": {"lat": 13.5358, "lng": 99.8164},
    "ตาก": {"lat": 16.8901, "lng": 99.117},

    # Southern
    "ชุมพร": {"lat": 10.493, "lng": 99.1717},
    "กระบี่": {"lat": 8.0863, "lng": 98.9063},
    "นครศรีธรรมราช": {"lat": 8.431, "lng": 99.9631},
    "นราธิวาส": {"lat": 6.4255, "lng": 101.8253},
    "ปัตตานี": {"lat": 6.8696, "lng": 101.2501},
    "พังงา": {"lat": 8.4506, "lng": 98.5267},
    "พัทลุง": {"lat": 7.6166, "lng": 100.074},
    "ภูเก็ต": {"lat": 7.8804, "lng": 98.3923},
    "ระนอง": {"lat": 9.9658, "lng": 98.6348},
    "สตูล": {"lat": 6.611, "lng": 100.0674},
    "สงขลา": {"lat": 7.1756, "lng": 100.6142},
    "สุราษฎร์ธานี": {"lat": 9.1382, "lng": 99.3217},
    "ตรัง": {"lat": 7.5574, "lng": 99.6106},
    "ยะลา": {"lat": 6.5401, "lng": 101.2804},
}

OSM_CATEGORY_MAP = {
    "amenity=bar": {"category": "Bar", "color": "#9B59B6"},
    "amenity=pub": {"category": "Bar", "color": "#9B59B6"},
    "amenity=nightclub": {"category": "Nightclub", "color": "#9B59B6"},
    "amenity=cafe": {"category": "Cafe", "color": "#8B4513"},
    "amenity=restaurant": {"category": "Restaurant", "color": "#E74C3C"},
    "amenity=fast_food": {"category": "Restaurant", "color": "#E74C3C"},
    "tourism=attraction": {"category": "Attraction", "color": "#F39C12"},
    "tourism=museum": {"category": "Attraction", "color": "#F39C12"},
    "tourism=viewpoint": {"category": "Viewpoint", "color": "#27AE60"},
    "shop=mall": {"category": "Shopping Mall", "color": "#3498DB"},
    "shop=department_store": {"category": "Shopping Mall", "color": "#3498DB"},
    "amenity=marketplace": {"category": "Market", "color": "#F39C12"},
    "natural=beach": {"category": "Beach", "color": "#2ECC71"},
    "amenity=place_of_worship": {"category": "Temple", "color": "#F39C12"},
    "leisure=park": {"category": "Park", "color": "#27AE60"},
    "leisure=water_park": {"category": "Attraction", "color": "#27AE60"},
}

def transform_osm_place(osm_place: dict) -> dict | None:
    tags = osm_place.get("tags", {})
    osm_id = osm_place.get("id")
    lat = osm_place.get("lat")
    lon = osm_place.get("lon")

    # Find matching category
    category_info = {"category": "Other", "color": "#95A5A6"}
    for osm_tag, info in OSM_CATEGORY_MAP.items():
        key, value = osm_tag.split("=")
        if tags.get(key) == value:
            category_info = info
            break

    name = tags.get("name") or tags.get("name:th") or tags.get("name:en")
    if not name:
        return None

    return {
        "id": f"osm-{osm_id}",
        "name": name,
        "name_en": tags.get("name:en") or name,
        "category": category_info["category"],
        "category_color": category_info["color"],
        "latitude": lat,
        "longitude": lon,
        "open_time": tags.get("opening_hours", "").split("-")[0] or None,
        "close_time": tags.get("opening_hours", "").split("-")[1] or None if "-" in tags.get("opening_hours", "") else None,
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "address": tags.get("addr:full") or f"{tags.get('addr:street', '')} {tags.get('addr:city', '')}".strip() or None,
        "source": "openstreetmap",
        "fetched_at": None, # Should be added by caller or ignored
    }


@router.get("/places/osm/{province}")
async def get_osm_places(province: str, radius: int = 10000):
    if province not in PROVINCE_CENTERS:
        raise HTTPException(status_code=404, detail="Province not found")

    cache_key = f"{province}-{radius}"
    if cache_key in places_cache:
        logger.info(f"OSM Cache hit for {province}")
        return places_cache[cache_key]

    center = PROVINCE_CENTERS[province]
    query = f"""
      [out:json][timeout:25];
      (
        node["amenity"~"bar|pub|nightclub|cafe|restaurant"](around:{radius},{center['lat']},{center['lng']});
        node["tourism"~"attraction|museum|viewpoint"](around:{radius},{center['lat']},{center['lng']});
        node["shop"~"mall|department_store"](around:{radius},{center['lat']},{center['lng']});
        node["amenity"="marketplace"](around:{radius},{center['lat']},{center['lng']});
        node["natural"="beach"](around:{radius},{center['lat']},{center['lng']});
        node["amenity"="place_of_worship"]["religion"="buddhist"](around:{radius},{center['lat']},{center['lng']});
      );
      out body;
    """

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30.0
            )
            resp.raise_for_status()
            data = resp.json()

            places = []
            for el in data.get("elements", []):
                p = transform_osm_place(el)
                if p:
                    places.append(p)

            # Update cache
            places_cache[cache_key] = places
            return places

    except httpx.RequestError as e:
        logger.error(f"Overpass request failed: {e}")
        raise HTTPException(status_code=502, detail="Overpass API failed")
    except Exception as e:
        logger.error(f"Error processing OSM data: {e}")
        raise HTTPException(status_code=500, detail=str(e))
