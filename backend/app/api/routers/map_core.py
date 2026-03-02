from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import hashlib, json

router = APIRouter(tags=["map-core"])

# ── bbox parser ───────────────────────────────────────────────────


def _parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(400, "bbox must be minLng,minLat,maxLng,maxLat")
    try:
        mn_lng, mn_lat, mx_lng, mx_lat = map(float, parts)
    except ValueError:
        raise HTTPException(400, "bbox values must be numeric")
    if not (-180 <= mn_lng < mx_lng <= 180):
        raise HTTPException(400, "longitude range invalid: minLng must be < maxLng within [-180,180]")
    if not (-90 <= mn_lat < mx_lat <= 90):
        raise HTTPException(400, "latitude range invalid: minLat must be < maxLat within [-90,90]")
    return mn_lng, mn_lat, mx_lng, mx_lat


# ── DTOs ─────────────────────────────────────────────────────────


class VenuePin(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    category: str
    rating: Optional[float] = None
    is_live: bool = False


class VenuesResponse(BaseModel):
    schema_version: int = Field(1, description="Bump on breaking schema change")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total: int = Field(..., description="Total venues in bbox before limit clamp")
    venues: list[VenuePin]


class HotRoadSegment(BaseModel):
    id: str
    path: list[tuple[float, float]] = Field(..., min_length=2, description="[[lng,lat],...] min 2 points")
    intensity: float = Field(..., ge=0.0, le=1.0)
    changed: bool = True


class HotRoadsResponse(BaseModel):
    schema_version: int = Field(1)
    snapshot_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    unchanged: bool = Field(False, description="True when since= matches current snapshot_id")
    segments: list[HotRoadSegment]


# ── Supabase accessor ─────────────────────────────────────────────


def _get_supabase():
    from app.core.supabase import supabase
    return supabase


# ── Endpoints ─────────────────────────────────────────────────────


@router.get("/venues", response_model=VenuesResponse)
async def get_venues(
    bbox: str = Query(..., examples=["100.5,13.5,101.0,14.0"], description="minLng,minLat,maxLng,maxLat"),
    zoom: float = Query(12.0, ge=3, le=22),
    limit: int = Query(200, ge=1, le=500),
):
    mn_lng, mn_lat, mx_lng, mx_lat = _parse_bbox(bbox)
    limit = min(limit, 500)

    try:
        sb = _get_supabase()
        resp = (
            sb.rpc(
                "get_map_pins",
                {
                    "min_lng": mn_lng, "min_lat": mn_lat,
                    "max_lng": mx_lng, "max_lat": mx_lat,
                    "zoom_level": zoom,
                    "max_results": limit,
                },
            )
            .execute()
        )
        rows = resp.data or []
    except Exception:
        rows = []

    venues = [
        VenuePin(
            id=str(r.get("id", "")),
            name=r.get("name", ""),
            lat=float(r.get("lat", 0)),
            lng=float(r.get("lng", 0)),
            category=r.get("category", ""),
            rating=r.get("rating"),
            is_live=bool(r.get("is_live", False)),
        )
        for r in rows
    ]
    return VenuesResponse(total=len(venues), venues=venues)


@router.get("/hot-roads", response_model=HotRoadsResponse)
async def get_hot_roads(
    bbox: str = Query(..., description="minLng,minLat,maxLng,maxLat"),
    since: Optional[str] = Query(None, description="snapshot_id from previous response"),
):
    mn_lng, mn_lat, mx_lng, mx_lat = _parse_bbox(bbox)

    try:
        sb = _get_supabase()
        resp = (
            sb.rpc(
                "get_hotspot_segments",
                {
                    "min_lng": mn_lng, "min_lat": mn_lat,
                    "max_lng": mx_lng, "max_lat": mx_lat,
                },
            )
            .execute()
        )
        rows = resp.data or []
    except Exception:
        rows = []

    snapshot_id = hashlib.sha1(
        json.dumps(sorted(r.get("id", "") for r in rows)).encode()
    ).hexdigest()[:16]

    if since and since == snapshot_id:
        return HotRoadsResponse(
            snapshot_id=snapshot_id,
            unchanged=True,
            segments=[],
        )

    segments = [
        HotRoadSegment(
            id=str(r.get("id", "")),
            path=r.get("path", [[0, 0], [0, 0]]),
            intensity=max(0.0, min(1.0, float(r.get("intensity", 0.5)))),
            changed=True,
        )
        for r in rows
        if len(r.get("path", [])) >= 2
    ]
    return HotRoadsResponse(snapshot_id=snapshot_id, segments=segments)
