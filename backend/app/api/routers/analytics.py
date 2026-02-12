from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from app.core.supabase import supabase
from app.core.auth import verify_admin, get_optional_user

router = APIRouter()

class AnalyticsEvent(BaseModel):
    event_type: str
    data: Dict[str, Any] = Field(default_factory=dict)
    user_id: Optional[str] = None

# Async task to log without blocking response
def log_event_task(event: AnalyticsEvent, user_id: Optional[str]):
    try:
        payload = {
            "event_type": event.event_type,
            "data": event.data,
            "user_id": user_id or event.user_id
        }
        supabase.table("analytics_logs").insert(payload).execute()
    except Exception as e:
        print(f"Analytics logging failed: {e}")

@router.post("/log")
async def log_event(
    event: AnalyticsEvent,
    background_tasks: BackgroundTasks,
    user: Optional[dict] = Depends(get_optional_user)
):
    """
    Log an analytics event (fire and forget).
    """
    user_id = getattr(user, "id", None) if user else None
    background_tasks.add_task(log_event_task, event, user_id)
    return {"success": True}

@router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(verify_admin)):
    """
    Get aggregated stats for Admin Dashboard.
    """
    try:
        # Example stats - in real app, use optimized SQL queries or materialized views
        count_users = supabase.table("profiles").select("id", count="exact").execute().count
        count_shops = supabase.table("shops").select("id", count="exact").execute().count
        count_reviews = supabase.table("reviews").select("id", count="exact").execute().count

        return {
            "success": True,
            "stats": {
                "total_users": count_users,
                "total_shops": count_shops,
                "total_reviews": count_reviews
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
