"""Server-side proxy for external geo APIs (Overpass / OSM).

Caches results in-memory with TTL so the client never calls
third-party geo services directly.
"""

import logging
from urllib.parse import urlparse

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, Header, HTTPException, Query

from app.core.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/proxy", tags=["proxy"])
settings = get_settings()

# S8: SSRF allowlist — reject any outbound host not explicitly listed
ALLOWED_HOSTS: frozenset[str] = frozenset({
    "overpass-api.de",
    "maps.googleapis.com",
    "api.mapbox.com",
})

# 30-min TTL, up to 64 distinct bound-keys
_osm_roads_cache: TTLCache = TTLCache(maxsize=64, ttl=1800)
_mapbox_directions_cache: TTLCache = TTLCache(maxsize=256, ttl=90)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 30  # seconds
MAPBOX_DIRECTIONS_BASE_URL = "https://api.mapbox.com/directions/v5/mapbox"
MAPBOX_DIRECTIONS_TIMEOUT = 10  # seconds


def _assert_allowed_url(url: str) -> None:
    """Raise 400 if the URL resolves to a host not in ALLOWED_HOSTS."""
    host = urlparse(url).hostname or ""
    if host not in ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail=f"Proxy target not allowed: {host}")


def _validate_lat_lng(lat: float, lng: float) -> None:
    if abs(lat) > 90 or abs(lng) > 180:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid coordinates: lat={lat}, lng={lng}",
        )


def _normalize_profile(profile: str) -> str:
    normalized = (profile or "").strip().lower()
    allowed_profiles = {"walking", "driving", "cycling", "driving-traffic"}
    if normalized not in allowed_profiles:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported route profile: {profile}",
        )
    return normalized


@router.get("/osm-roads")
async def osm_roads(
    south: float = Query(...),
    west: float = Query(...),
    north: float = Query(...),
    east: float = Query(...),
):
    key = f"{south:.3f},{west:.3f},{north:.3f},{east:.3f}"
    cached = _osm_roads_cache.get(key)
    if cached is not None:
        return cached

    query = (
        f"[out:json][timeout:25];"
        f"(way[\"highway\"~\"primary|secondary|tertiary|residential\"]"
        f"({south},{west},{north},{east}););out geom;"
    )

    _assert_allowed_url(OVERPASS_URL)
    async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT) as client:
        resp = await client.get(OVERPASS_URL, params={"data": query})
        resp.raise_for_status()

    routes = []
    for el in resp.json().get("elements", []):
        if el.get("type") == "way" and el.get("geometry"):
            routes.append([[pt["lat"], pt["lon"]] for pt in el["geometry"]])

    result = {"routes": routes}
    _osm_roads_cache[key] = result
    return result


@router.get("/mapbox-directions")
async def mapbox_directions(
    start_lat: float = Query(...),
    start_lng: float = Query(...),
    end_lat: float = Query(...),
    end_lng: float = Query(...),
    profile: str = Query("walking"),
    geometries: str = Query("geojson"),
    token: str | None = Query(None),
    x_mapbox_token: str | None = Header(None, alias="X-Mapbox-Token"),
):
    _validate_lat_lng(start_lat, start_lng)
    _validate_lat_lng(end_lat, end_lng)
    normalized_profile = _normalize_profile(profile)

    normalized_geometries = (geometries or "").strip().lower()
    if normalized_geometries != "geojson":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported geometries format: {geometries}",
        )

    access_token = (
        settings.MAPBOX_ACCESS_TOKEN or x_mapbox_token or token or ""
    ).strip()
    if not access_token:
        raise HTTPException(
            status_code=503,
            detail="Mapbox token not configured on backend and no fallback token provided.",
        )

    cache_key = (
        f"{normalized_profile}:{start_lat:.6f},{start_lng:.6f};"
        f"{end_lat:.6f},{end_lng:.6f}:{normalized_geometries}"
    )
    cached = _mapbox_directions_cache.get(cache_key)
    if cached is not None:
        return cached

    directions_url = (
        f"{MAPBOX_DIRECTIONS_BASE_URL}/{normalized_profile}/"
        f"{start_lng},{start_lat};{end_lng},{end_lat}"
    )
    _assert_allowed_url(directions_url)

    try:
        async with httpx.AsyncClient(timeout=MAPBOX_DIRECTIONS_TIMEOUT) as client:
            resp = await client.get(
                directions_url,
                params={
                    "geometries": normalized_geometries,
                    "access_token": access_token,
                },
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Mapbox directions timeout") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Mapbox directions request failed",
        ) from exc

    if resp.status_code >= 400:
        detail = "Mapbox directions request failed"
        try:
            payload = resp.json()
            detail = payload.get("message") or payload.get("error") or detail
        except ValueError:
            pass
        raise HTTPException(status_code=resp.status_code, detail=detail)

    payload = resp.json()
    _mapbox_directions_cache[cache_key] = payload
    return payload
