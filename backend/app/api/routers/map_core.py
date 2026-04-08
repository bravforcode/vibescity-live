import hashlib
import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(tags=["map-core"])
logger = logging.getLogger("app.map_core")

# ── bbox parser ───────────────────────────────────────────────────


def _parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(400, "bbox must be minLng,minLat,maxLng,maxLat")
    try:
        mn_lng, mn_lat, mx_lng, mx_lat = map(float, parts)
    except ValueError as exc:
        raise HTTPException(400, "bbox values must be numeric") from exc
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
    category: str = ""
    rating: float | None = None
    is_live: bool = False
    pin_type: str | None = None
    pin_state: str | None = None
    pin_metadata: dict[str, Any] | None = None
    visibility_score: int | None = None
    verified_active: bool = False
    glow_active: bool = False
    boost_active: bool = False
    giant_active: bool = False
    cover_image: str | None = None


class VenuesResponse(BaseModel):
    schema_version: int = Field(1, description="Bump on breaking schema change")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
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
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
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
    use_cache: bool = Query(True, description="Use Materialized View for faster retrieval"),
):
    mn_lng, mn_lat, mx_lng, mx_lat = _parse_bbox(bbox)
    limit = min(limit, 500)

    try:
        sb = _get_supabase()
        
        # VC-101: Use Materialized View for static tile data if use_cache is True
        if use_cache:
            # Query from materialized view directly for high-performance tile generation
            # Note: This assumes the schema matches mv_venue_geodata
            resp = (
                sb.table("mv_venue_geodata")
                .select("*")
                .filter("location", "ov", f"SRID=4326;POLYGON(({mn_lng} {mn_lat},{mn_lng} {mx_lat},{mx_lng} {mx_lat},{mx_lng} {mn_lat},{mn_lng} {mn_lat}))")
                .limit(limit)
                .execute()
            )
            rows = resp.data or []
        else:
            # Fallback to real-time RPC for dynamic data
            resp = (
                sb.rpc(
                    "get_map_pins",
                    {
                        "p_min_lng": mn_lng,
                        "p_min_lat": mn_lat,
                        "p_max_lng": mx_lng,
                        "p_max_lat": mx_lat,
                        "p_zoom": round(zoom),
                    },
                )
                .execute()
            )
            rows = (resp.data or [])[:limit]
    except Exception as exc:
        logger.error(f"Error fetching venues: {exc}")
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
            pin_type=r.get("pin_type"),
            pin_state=r.get("pin_state"),
            pin_metadata=r.get("pin_metadata"),
            visibility_score=r.get("visibility_score"),
            verified_active=bool(r.get("verified_active", False)),
            glow_active=bool(r.get("glow_active", False)),
            boost_active=bool(r.get("boost_active", False)),
            giant_active=bool(r.get("giant_active", False)),
            cover_image=r.get("cover_image"),
        )
        for r in rows
    ]
    return VenuesResponse(total=len(venues), venues=venues)


@router.get("/hot-roads", response_model=HotRoadsResponse)
async def get_hot_roads(
    bbox: str = Query(..., description="minLng,minLat,maxLng,maxLat"),
    since: str | None = Query(None, description="snapshot_id from previous response"),
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

    snapshot_id = hashlib.sha1(  # nosec B324 - used for cache key, not security
        json.dumps(sorted(r.get("id", "") for r in rows)).encode(),
        usedforsecurity=False,
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
