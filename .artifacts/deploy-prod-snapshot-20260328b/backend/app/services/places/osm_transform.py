from __future__ import annotations

OSM_CATEGORY_MAP: dict[str, dict[str, str]] = {
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


def _match_category(tags: dict[str, str]) -> str:
    default_category = "Other"
    for osm_tag, info in OSM_CATEGORY_MAP.items():
        key, value = osm_tag.split("=")
        if tags.get(key) == value:
            return info["category"]
    return default_category


def transform_osm_element(element: dict) -> dict | None:
    tags = element.get("tags") or {}
    osm_id = element.get("id")

    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        center = element.get("center") or {}
        lat = center.get("lat")
        lon = center.get("lon")
    if lat is None or lon is None:
        return None

    name = tags.get("name") or tags.get("name:th") or tags.get("name:en")
    if not name:
        return None

    address = (
        tags.get("addr:full")
        or f"{tags.get('addr:street', '')} {tags.get('addr:city', '')}".strip()
        or None
    )

    return {
        "id": f"osm-{osm_id}",
        "name": name,
        "category": _match_category(tags),
        "lat": float(lat),
        "lng": float(lon),
        "address": address,
        "open_now": None,
        "source": "osm",
        "updated_at": "",
    }
