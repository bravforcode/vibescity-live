import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Header, Query

from app.api.routers.owner import _fetch_owned_venues, _is_live_status, _safe_float, _safe_int
from app.api.routers.partner import (
    _fetch_partner_orders_90d,
    _fetch_partner_profile,
    _resolve_partner_status,
)
from app.core.visitor_auth import require_valid_visitor

router = APIRouter()


@router.get("/dashboard/owner-summary")
async def get_owner_dashboard_summary(
    visitor_id: str = Query(...),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    normalized_visitor_id = require_valid_visitor(visitor_id, x_visitor_token)
    venues = await _fetch_owned_venues(normalized_visitor_id, limit=300)

    ratings = [_safe_float(v.get("rating"), 0.0) for v in venues if v.get("rating") is not None]
    response = {
        "visitor_id": normalized_visitor_id,
        "kpi": {
            "venues_total": len(venues),
            "venues_live": sum(1 for v in venues if _is_live_status(v.get("status"))),
            "total_views": sum(
                _safe_int(v.get("total_views"), _safe_int(v.get("view_count"), 0))
                for v in venues
            ),
            "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else 0.0,
        },
        "generated_at": datetime.now(tz=UTC).isoformat(),
    }
    return response


@router.get("/dashboard/partner-summary")
async def get_partner_dashboard_summary(
    visitor_id: str = Query(...),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    normalized_visitor_id = require_valid_visitor(visitor_id, x_visitor_token)
    status = await _resolve_partner_status(normalized_visitor_id)
    profile_task = asyncio.create_task(_fetch_partner_profile(normalized_visitor_id))
    orders_task = asyncio.create_task(_fetch_partner_orders_90d(normalized_visitor_id))
    profile, orders = await asyncio.gather(profile_task, orders_task)

    verified_orders = [
        row for row in orders if str(row.get("status") or "").lower() in {"verified", "paid"}
    ]
    response = {
        "visitor_id": normalized_visitor_id,
        "status": status,
        "summary": {
            "total_orders": len(orders),
            "verified_orders": len(verified_orders),
            "total_paid_thb": round(
                sum(float(row.get("amount") or 0) for row in verified_orders),
                2,
            ),
        },
        "profile": profile,
        "generated_at": datetime.now(tz=UTC).isoformat(),
    }
    return response

