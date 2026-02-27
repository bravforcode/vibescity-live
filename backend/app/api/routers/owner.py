import asyncio
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel

from app.api.routers.vibes import manager
from app.core.auth import verify_admin, verify_user
from app.core.rate_limit import limiter
from app.core.supabase import supabase, supabase_admin
from app.core.visitor_auth import require_valid_visitor
from app.services.venue_repository import VenueRepository

router = APIRouter()


class OwnerStats(BaseModel):
    shop_id: str
    live_visitors: int
    total_views: int
    rating: float
    is_promoted: bool


def _now_utc() -> datetime:
    return datetime.now(tz=UTC)


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        return datetime.fromisoformat(text).astimezone(UTC)
    except Exception:
        return None


def _is_live_status(status: str | None) -> bool:
    return str(status or "").strip().lower() in {"live", "active"}


def _is_promoted(row: dict, now: datetime) -> bool:
    pin_type = str(row.get("pin_type") or "").strip().lower()
    if pin_type in {"giant", "boost", "boosted"}:
        return True
    for key in ("giant_until", "boost_until", "glow_until"):
        dt = _parse_dt(row.get(key))
        if dt and dt > now:
            return True
    return False


def _image_present(row: dict) -> bool:
    image_urls = row.get("image_urls")
    if isinstance(image_urls, list) and len([x for x in image_urls if x]):
        return True
    return bool(row.get("Image_URL1"))


def _compute_completeness(row: dict) -> dict:
    checks = {
        "category": bool(row.get("category")),
        "open_time": bool(row.get("open_time")),
        "image": _image_present(row),
        "social": isinstance(row.get("social_links"), dict)
        and len([k for k, v in row.get("social_links", {}).items() if v]) > 0,
        "pin": bool(str(row.get("pin_type") or "").strip()),
    }
    earned = sum(1 for ok in checks.values() if ok)
    score = round((earned / len(checks)) * 100) if checks else 0
    missing = [key for key, ok in checks.items() if not ok]
    return {"score": score, "missing": missing}


async def _fetch_owned_venues(visitor_id: str, limit: int = 200) -> list[dict]:
    client = supabase_admin or supabase
    if client is None:
        return []

    query = (
        client.table("venues")
        .select(
            'id,name,category,status,total_views,view_count,rating,pin_type,image_urls,"Image_URL1",open_time,social_links,updated_at,created_at,verified_until,glow_until,boost_until,giant_until,owner_visitor_id'
        )
        .eq("owner_visitor_id", visitor_id)
        .order("updated_at", desc=True)
        .limit(limit)
    )
    response = await asyncio.to_thread(query.execute)
    return list(response.data or [])


async def _fetch_events_for_venues(
    venue_ids: list[str],
    since_iso: str,
    limit_per_chunk: int = 3000,
) -> list[dict]:
    client = supabase_admin or supabase
    if client is None or not venue_ids:
        return []

    out: list[dict] = []
    chunk_size = 25
    for i in range(0, len(venue_ids), chunk_size):
        chunk = venue_ids[i : i + chunk_size]
        query = (
            client.table("analytics_events")
            .select("created_at,venue_id,event_type,session_id,visitor_id,user_id")
            .in_("venue_id", chunk)
            .gte("created_at", since_iso)
            .order("created_at", desc=False)
            .limit(limit_per_chunk)
        )
        try:
            response = await asyncio.to_thread(query.execute)
            out.extend(list(response.data or []))
        except Exception:
            continue
    return out


@router.get("/stats/{shop_id}", response_model=OwnerStats)
@limiter.limit("60/minute")
async def get_shop_stats(
    request: Request,
    shop_id: str,
    user: dict = Depends(verify_user),
):
    await _ensure_owner_or_admin(shop_id, user)

    live_count = 0
    if shop_id in manager.room_connections:
        live_count = len(manager.room_connections[shop_id])

    client = supabase_admin or supabase
    venue_data = {}
    try:
        response = (
            client.table("venues")
            .select("rating,total_views,view_count,pin_type")
            .eq("id", shop_id)
            .single()
            .execute()
        )
        venue_data = response.data or {}
    except Exception:
        try:
            response = (
                client.table("shops")
                .select("rating,total_views,view_count,pin_type")
                .eq("id", shop_id)
                .single()
                .execute()
            )
            venue_data = response.data or {}
        except Exception:
            venue_data = {}

    total_views = venue_data.get("total_views")
    if total_views is None:
        total_views = venue_data.get("view_count")

    pin_type = str(venue_data.get("pin_type") or "").lower()
    is_promoted = pin_type in {"giant", "boost", "boosted"}

    return {
        "shop_id": shop_id,
        "live_visitors": live_count,
        "total_views": int(total_views or 0),
        "rating": float(venue_data.get("rating") or 0),
        "is_promoted": is_promoted,
    }


@router.post("/promote/{shop_id}")
@limiter.limit("10/minute")
async def toggle_promote(
    request: Request,
    shop_id: str,
    user: dict = Depends(verify_user),
):
    await _ensure_owner_or_admin(shop_id, user)
    return {
        "status": "success",
        "is_promoted": True,
        "message": "Shop boosted! Giant Pin activated.",
    }


@router.get("/portfolio")
async def get_owner_portfolio(
    visitor_id: str = Query(...),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    normalized_visitor_id = require_valid_visitor(visitor_id, x_visitor_token)
    now = _now_utc()
    venues = await _fetch_owned_venues(normalized_visitor_id, limit=400)

    venue_count = len(venues)
    live_count = sum(1 for row in venues if _is_live_status(row.get("status")))
    promoted_count = sum(1 for row in venues if _is_promoted(row, now))

    total_views = sum(
        _safe_int(row.get("total_views"), _safe_int(row.get("view_count"), 0))
        for row in venues
    )
    ratings = [_safe_float(row.get("rating"), 0.0) for row in venues if row.get("rating")]
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0

    expiring_keys = ["verified_until", "glow_until", "boost_until", "giant_until"]
    expiring_7d = defaultdict(int)
    for row in venues:
        for key in expiring_keys:
            dt = _parse_dt(row.get(key))
            if dt and now <= dt <= now + timedelta(days=7):
                expiring_7d[key] += 1

    return {
        "visitor_id": normalized_visitor_id,
        "kpis": {
            "venues_total": venue_count,
            "venues_live": live_count,
            "total_views": total_views,
            "avg_rating": avg_rating,
            "promoted": promoted_count,
        },
        "expiring_7d": dict(expiring_7d),
        "updated_at": now.isoformat(),
    }


@router.get("/venues")
async def get_owner_venues(
    visitor_id: str = Query(...),
    limit: int = Query(60, ge=1, le=200),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    normalized_visitor_id = require_valid_visitor(visitor_id, x_visitor_token)
    now = _now_utc()
    venues = await _fetch_owned_venues(normalized_visitor_id, limit=limit)

    payload = []
    for row in venues:
        completeness = _compute_completeness(row)
        payload.append(
            {
                "id": row.get("id"),
                "name": row.get("name"),
                "category": row.get("category"),
                "status": row.get("status"),
                "rating": _safe_float(row.get("rating"), 0.0),
                "total_views": _safe_int(
                    row.get("total_views"), _safe_int(row.get("view_count"), 0)
                ),
                "pin_type": row.get("pin_type"),
                "image": row.get("Image_URL1")
                or ((row.get("image_urls") or [None])[0]),
                "updated_at": row.get("updated_at"),
                "created_at": row.get("created_at"),
                "verified_until": row.get("verified_until"),
                "glow_until": row.get("glow_until"),
                "boost_until": row.get("boost_until"),
                "giant_until": row.get("giant_until"),
                "is_live": _is_live_status(row.get("status")),
                "is_promoted": _is_promoted(row, now),
                "completeness": completeness,
            }
        )

    return {"total": len(payload), "venues": payload}


@router.get("/insights")
async def get_owner_insights(
    visitor_id: str = Query(...),
    days: int = Query(30),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    normalized_visitor_id = require_valid_visitor(visitor_id, x_visitor_token)
    if days not in {7, 30}:
        raise HTTPException(status_code=400, detail="days must be 7 or 30")

    now = _now_utc()
    since = now - timedelta(days=days)
    venues = await _fetch_owned_venues(normalized_visitor_id, limit=300)
    venue_ids = [str(row.get("id")) for row in venues if row.get("id")]

    trend_map: dict[str, dict] = {}
    for offset in range(days + 1):
        d = (since + timedelta(days=offset)).date().isoformat()
        trend_map[d] = {
            "date": d,
            "events": 0,
            "active_venues": 0,
            "unique_visitors": 0,
        }

    events = await _fetch_events_for_venues(venue_ids, since.isoformat())
    visitors_by_day = defaultdict(set)
    venues_by_day = defaultdict(set)

    for event in events:
        dt = _parse_dt(event.get("created_at"))
        if not dt:
            continue
        key = dt.date().isoformat()
        if key not in trend_map:
            continue
        trend_map[key]["events"] += 1
        venue_id = str(event.get("venue_id") or "").strip()
        if venue_id:
            venues_by_day[key].add(venue_id)

        visitor_key = (
            event.get("visitor_id")
            or event.get("user_id")
            or event.get("session_id")
        )
        if visitor_key:
            visitors_by_day[key].add(str(visitor_key))

    for key, row in trend_map.items():
        row["active_venues"] = len(venues_by_day.get(key, set()))
        row["unique_visitors"] = len(visitors_by_day.get(key, set()))

    completeness_low = [
        row for row in venues if _compute_completeness(row).get("score", 0) < 60
    ]
    expiring_soon = []
    for row in venues:
        for key in ("verified_until", "glow_until", "boost_until", "giant_until"):
            dt = _parse_dt(row.get(key))
            if dt and now <= dt <= now + timedelta(days=7):
                expiring_soon.append({"venue_id": row.get("id"), "feature": key, "at": dt.isoformat()})

    actions = []
    if not venues:
        actions.append(
            {
                "type": "onboarding",
                "priority": "high",
                "label": "Add your first venue",
                "description": "Create or claim a venue to unlock owner analytics and promotion tools.",
            }
        )
    if completeness_low:
        actions.append(
            {
                "type": "content",
                "priority": "high",
                "label": "Improve venue completeness",
                "description": f"{len(completeness_low)} venues are missing core profile fields.",
            }
        )
    if expiring_soon:
        actions.append(
            {
                "type": "renewal",
                "priority": "medium",
                "label": "Renew expiring boosts",
                "description": f"{len(expiring_soon)} promotion/verification slots expire in 7 days.",
            }
        )
    promoted_count = sum(1 for row in venues if _is_promoted(row, now))
    if venues and promoted_count == 0:
        actions.append(
            {
                "type": "growth",
                "priority": "medium",
                "label": "Run your first promotion",
                "description": "No boosted venues detected. Promote a top venue to improve map visibility.",
            }
        )

    trend = [trend_map[key] for key in sorted(trend_map.keys())]
    return {
        "days": days,
        "summary": {
            "events_total": sum(item["events"] for item in trend),
            "unique_visitors_total": len(
                set().union(*[visitors_by_day.get(key, set()) for key in trend_map.keys()])
            )
            if trend_map
            else 0,
            "active_venues_total": len(venues),
        },
        "trend": trend,
        "actions": actions,
        "expiring": expiring_soon,
    }


async def _ensure_owner_or_admin(shop_id: str, user: dict):
    try:
        await verify_admin(user)
        return
    except Exception:
        pass

    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    client = supabase_admin or supabase
    repository = VenueRepository(client)
    try:
        owner_id = repository.get_owner(shop_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to verify ownership")

    if not owner_id or str(owner_id) != str(user_id):
        raise HTTPException(status_code=403, detail="Owner privileges required")
