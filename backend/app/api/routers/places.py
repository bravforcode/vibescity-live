from __future__ import annotations

import hashlib
import json
import math

import anyio
from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.place import Place
from app.core.rate_limit import limiter
from app.db.session import get_core_db, get_vector_client
from app.services.cache import redis_client
from app.services.places.provider_manager import nearby_by_provider
from app.services.vector import places_vector_service as vector_service

router = APIRouter()


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * earth_radius_m * math.asin(math.sqrt(a))


def _nearby_cache_key(provider: str, lat: float, lng: float, radius: int, limit: int) -> str:
    return f"places:nearby:{provider}:{round(lat, 3)}:{round(lng, 3)}:{radius}:{limit}"


def _search_cache_key(
    q: str,
    lat: float,
    lng: float,
    radius: int,
    limit: int,
    province: str | None,
    category: str | None,
) -> str:
    q_hash = hashlib.sha1(q.encode()).hexdigest()[:10]
    filter_hash = hashlib.sha1(f"{province}|{category}".encode()).hexdigest()[:10]
    return (
        f"places:search:{round(lat, 3)}:{round(lng, 3)}:{radius}:"
        f"{q_hash}:{filter_hash}:{limit}"
    )


def _serialize_cache(provider: str, data: list[dict]) -> str:
    return json.dumps({"provider": provider, "data": data}, ensure_ascii=False)


def _deserialize_cache(raw: str) -> tuple[str, list[dict]]:
    parsed = json.loads(raw)
    return parsed.get("provider", ""), parsed.get("data", [])


@router.get("/nearby", response_model=list[Place])
@limiter.limit("10/minute")
async def nearby(
    request: Request,
    response: Response,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(1000, ge=50, le=5000),
    limit: int = Query(50, ge=1, le=100),
    provider: str = Query("auto", pattern="^(osm|google|auto)$"),
) -> list[dict]:
    redis_conn = redis_client.get_redis()
    cache_key = _nearby_cache_key(provider, lat, lng, radius, limit)

    cached_raw = await anyio.to_thread.run_sync(lambda: redis_conn.get(cache_key))
    if cached_raw:
        cached_provider, cached_data = _deserialize_cache(cached_raw)
        response.headers["X-Provider"] = cached_provider or provider
        response.headers["X-Cache"] = "HIT"
        return cached_data

    try:
        provider_used, data = await nearby_by_provider(lat, lng, radius, limit, provider)
        await anyio.to_thread.run_sync(
            lambda: redis_conn.setex(cache_key, 3600, _serialize_cache(provider_used, data))
        )
        response.headers["X-Provider"] = provider_used
        response.headers["X-Cache"] = "MISS"
        return data
    except Exception:
        stale_raw = await anyio.to_thread.run_sync(lambda: redis_conn.get(cache_key))
        if stale_raw:
            stale_provider, stale_data = _deserialize_cache(stale_raw)
            response.headers["X-Provider"] = stale_provider or provider
            response.headers["X-Cache"] = "STALE"
            return stale_data
        response.headers["X-Provider"] = provider
        response.headers["X-Cache"] = "MISS"
        return []


@router.get("/authority", response_model=list[Place])
@limiter.limit("30/minute")
async def authority(
    request: Request,
    response: Response,
    province: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_core_db),
) -> list[dict]:
    where_parts: list[str] = []
    params: dict[str, object] = {"limit": limit}

    if province:
        where_parts.append("province = :province")
        params["province"] = province
    if q:
        where_parts.append("name ILIKE :q")
        params["q"] = f"%{q}%"

    sql = """
    SELECT authority_id, name, category, lat, lng, address, updated_at
    FROM authority_places
    """
    if where_parts:
        sql += " WHERE " + " AND ".join(where_parts)
    sql += " ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT :limit"

    result = await db.execute(text(sql), params)
    rows = result.mappings().all()

    out: list[dict] = []
    for row in rows:
        updated_at = row.get("updated_at")
        out.append(
            {
                "id": row["authority_id"],
                "name": row["name"],
                "category": row["category"],
                "lat": float(row["lat"]),
                "lng": float(row["lng"]),
                "address": row.get("address"),
                "open_now": None,
                "source": "authority",
                "updated_at": updated_at.isoformat() if updated_at else "",
            }
        )

    response.headers["X-Provider"] = "authority"
    response.headers["X-Cache"] = "MISS"
    return out


@router.get("/search", response_model=list[Place])
@limiter.limit("10/minute")
async def search_places(
    request: Request,
    response: Response,
    q: str = Query(..., min_length=2),
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(1000, ge=50, le=5000),
    limit: int = Query(20, ge=1, le=50),
    province: str | None = Query(default=None),
    category: str | None = Query(default=None),
    vector_client=Depends(get_vector_client),
) -> list[dict]:
    redis_conn = redis_client.get_redis()
    cache_key = _search_cache_key(q, lat, lng, radius, limit, province, category)

    cached_raw = await anyio.to_thread.run_sync(lambda: redis_conn.get(cache_key))
    if cached_raw:
        cached_provider, cached_data = _deserialize_cache(cached_raw)
        response.headers["X-Provider"] = cached_provider or "qdrant"
        response.headers["X-Cache"] = "HIT"
        return cached_data

    # C5: Circuit breaker — if Qdrant is down, return empty rather than hanging
    try:
        await vector_service.ensure_collection_once(vector_client)
        hits = await vector_service.qdrant_search(
            vector_client,
            q=q,
            limit=limit,
            province=province,
            category=category,
        )
    except RuntimeError:
        response.headers["X-Provider"] = "fallback"
        response.headers["X-Cache"] = "MISS"
        return []

    out: list[dict] = []
    for hit in hits:
        payload = getattr(hit, "payload", {}) or {}
        try:
            place_lat = float(payload.get("lat"))
            place_lng = float(payload.get("lng"))
        except (TypeError, ValueError):
            continue

        if _haversine_m(lat, lng, place_lat, place_lng) > radius:
            continue

        out.append(
            {
                "id": payload.get("authority_id") or str(getattr(hit, "id", "")),
                "name": payload.get("name"),
                "category": payload.get("category") or "Other",
                "lat": place_lat,
                "lng": place_lng,
                "address": payload.get("address"),
                "open_now": None,
                "source": "authority",
                "updated_at": payload.get("updated_at") or "",
            }
        )
        if len(out) >= limit:
            break

    await anyio.to_thread.run_sync(
        lambda: redis_conn.setex(cache_key, 900, _serialize_cache("qdrant", out))
    )
    response.headers["X-Provider"] = "qdrant"
    response.headers["X-Cache"] = "MISS"
    return out
