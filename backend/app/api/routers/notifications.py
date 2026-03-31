"""
Notification Router - Push and in-app notifications
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import verify_admin, verify_user
from app.core.rate_limit import limiter
from app.services.notifications import send_push_notification

router = APIRouter()
logger = logging.getLogger("app.notifications")

class PushNotificationRequest(BaseModel):
    user_ids: list[str]
    title: str
    message: str
    data: dict[str, Any] | None = None

@router.post("/send")
async def send_notification(
    request: Request, 
    body: PushNotificationRequest, 
    user: dict = Depends(verify_admin)
):
    """
    Send a push notification to specific users (Admin only).
    """
    success = await send_push_notification(
        user_ids=body.user_ids,
        title=body.title,
        message=body.message,
        data=body.data
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send notification")
    return {"success": True}


@router.get("/inbox")
@limiter.limit("20/minute")
async def get_notification_inbox(request: Request, user: dict = Depends(verify_user)):
    """
    Fetch current user's in-app notification history.
    """
    from app.core.supabase import supabase_admin as supabase
    import asyncio
    
    user_id = user.get("id")
    response = await asyncio.to_thread(
        lambda: supabase.table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"success": True, "notifications": response.data or []}
