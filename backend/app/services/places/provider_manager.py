from __future__ import annotations

import math

from app.core.config import get_settings
from app.services.providers.google_places import GooglePlacesProvider
from app.services.providers.osm_overpass import OSMOverpassProvider


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * earth_radius_m * math.asin(math.sqrt(a))


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _name_similar(a: str, b: str) -> bool:
    if not a or not b:
        return False
    return a == b or a in b or b in a


def merge_dedup(primary: list[dict], secondary: list[dict]) -> list[dict]:
    merged = list(primary)
    for second in secondary:
        second_name = _norm(second.get("name"))
        keep = True
        for first in merged:
            first_name = _norm(first.get("name"))
            close_enough = _haversine_m(
                float(first["lat"]),
                float(first["lng"]),
                float(second["lat"]),
                float(second["lng"]),
            ) <= 30
            if close_enough and _name_similar(first_name, second_name):
                if not first.get("address") and second.get("address"):
                    first["address"] = second["address"]
                if first.get("open_now") is None and second.get("open_now") is not None:
                    first["open_now"] = second["open_now"]
                if first.get("category") in (None, "Other") and second.get("category") not in (
                    None,
                    "Other",
                ):
                    first["category"] = second["category"]
                keep = False
                break
        if keep:
            merged.append(second)
    return merged


async def nearby_by_provider(
    lat: float,
    lng: float,
    radius: int,
    limit: int,
    provider: str,
) -> tuple[str, list[dict]]:
    settings = get_settings()
    osm_provider = OSMOverpassProvider()
    google_provider = GooglePlacesProvider()

    if provider == "osm":
        return "osm", await osm_provider.search_nearby(lat, lng, radius, limit)

    if provider == "google":
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError("GOOGLE_API_KEY not set")
        return "google", await google_provider.search_nearby(lat, lng, radius, limit)

    if not settings.GOOGLE_API_KEY:
        return "osm", await osm_provider.search_nearby(lat, lng, radius, limit)

    try:
        google_places = await google_provider.search_nearby(lat, lng, radius, limit)
        osm_places = await osm_provider.search_nearby(lat, lng, radius, limit)
        return "google", merge_dedup(google_places, osm_places)[:limit]
    except Exception:
        return "osm", await osm_provider.search_nearby(lat, lng, radius, limit)
