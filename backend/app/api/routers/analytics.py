from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_optional_user, verify_admin
from app.core.supabase import supabase

router = APIRouter()


def _count_estimated(table: str, columns: tuple[str, ...] = ("id", "*")) -> int:
    last_exc: Exception | None = None
    for column in columns:
        try:
            result = supabase.table(table).select(column, count="estimated").execute().count
            return int(result or 0)
        except Exception as exc:  # pragma: no cover - fallback path
            last_exc = exc

    if last_exc:
        raise last_exc
    return 0


class AnalyticsEvent(BaseModel):
    event_type: str
    data: dict[str, Any] = Field(default_factory=dict)
    user_id: str | None = None

from app.services.analytics_service import analytics_buffer

@router.post("/log")
async def log_event(
    event: AnalyticsEvent,
    user: dict | None = Depends(get_optional_user)
):
    """
    Log an analytics event (buffered internally).
    """
    user_id = getattr(user, "id", None) if user else None
    # We await the buffer.log, which is fast (in-memory append) unless it triggers a flush (backgroundable?)
    # Ideally log() puts it in queue and returns immediately. Our .log() implementation acquires lock,
    # appends, and if full, awaits flush(). This might block briefly.
    # Given it's a log endpoint, maybe we should fire-and-forget this too?
    # But `analytics_buffer.log` is async, so `await` handles it nicely.
    await analytics_buffer.log(event.event_type, event.data, user_id)
    return {"success": True}


@router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(verify_admin)):
    """
    Get aggregated estimated stats for Admin Dashboard.
    """
    try:
        # Use 'estimated' or 'planned' count for speed
        count_users = _count_estimated("user_profiles", ("id", "user_id", "*"))
        count_venues = _count_estimated("venues")
        count_osm_venues = (
            supabase.table("venues")
            .select("id", count="estimated")
            .eq("source", "osm")
            .execute()
            .count
        )
        count_reviews = _count_estimated("reviews")
        latest_osm_sync_rows = (
            supabase.table("venues")
            .select("last_osm_sync")
            .eq("source", "osm")
            .order("last_osm_sync", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        latest_osm_sync = latest_osm_sync_rows[0].get("last_osm_sync") if latest_osm_sync_rows else None
        supabase_url = getattr(supabase, "supabase_url", "")
        supabase_host = (urlsplit(str(supabase_url)).hostname or "").strip()
        supabase_project_ref = (
            supabase_host.split(".")[0] if ".supabase." in supabase_host else supabase_host
        )

        return {
            "success": True,
            "stats": {
                "total_users": count_users,
                "total_venues": count_venues,
                "total_shops": count_venues,  # Compat
                "total_reviews": count_reviews,
                "total_osm_venues": count_osm_venues,
                "latest_osm_sync": latest_osm_sync,
                "supabase_project_ref": supabase_project_ref,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dashboard stats: {e}") from e
