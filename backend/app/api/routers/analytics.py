import asyncio
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_optional_user, verify_admin
from app.core.supabase import supabase
from app.services.sheets_logger import sheets_logger

router = APIRouter()

class AnalyticsEvent(BaseModel):
    event_type: str
    data: dict[str, Any] = Field(default_factory=dict)
    user_id: str | None = None
    visitor_id: str | None = None

from app.services.analytics_service import analytics_buffer


@router.post("/log")
async def log_event(
    event: AnalyticsEvent,
    user: dict | None = Depends(get_optional_user)
):
    """
    Log an analytics event (buffered internally).
    """
    user_id = None
    if user:
        if isinstance(user, dict):
            user_id = user.get("id")
        else:
            user_id = getattr(user, "id", None)
    actor_id = user_id or event.user_id
    # We await the buffer.log, which is fast (in-memory append) unless it triggers a flush (backgroundable?)
    # Ideally log() puts it in queue and returns immediately. Our .log() implementation acquires lock,
    # appends, and if full, awaits flush(). This might block briefly.
    # Given it's a log endpoint, maybe we should fire-and-forget this too?
    # But `analytics_buffer.log` is async, so `await` handles it nicely.
    await analytics_buffer.log(event.event_type, event.data, actor_id)

    try:
        asyncio.create_task(
            sheets_logger.log_event(
                event.event_type,
                event.data,
                actor_id=actor_id,
                visitor_id=event.visitor_id,
                channel="events",
            )
        )
    except Exception:
        # fail-open for analytics logging
        pass
    return {"success": True}


@router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(verify_admin)):
    """
    Get aggregated estimated stats for Admin Dashboard.
    """
    try:
        # Use 'estimated' or 'planned' count for speed
        count_users = supabase.table("user_profiles").select("id", count="estimated").execute().count
        count_venues = supabase.table("venues").select("id", count="estimated").execute().count
        count_osm_venues = (
            supabase.table("venues")
            .select("id", count="estimated")
            .eq("source", "osm")
            .execute()
            .count
        )
        count_reviews = supabase.table("reviews").select("id", count="estimated").execute().count
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
