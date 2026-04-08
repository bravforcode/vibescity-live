"""
User Router - User profile and settings management
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import verify_user
from app.core.rate_limit import limiter
from app.services.user_service import user_service

router = APIRouter()


class UserProfileUpdate(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None

class UserSettingsUpdate(BaseModel):
    notifications_enabled: bool | None = None
    language: str | None = None
    theme: str | None = None


@router.get("/me")
@limiter.limit("30/minute")
async def get_my_profile(request: Request, user: dict = Depends(verify_user)):
    """
    Fetch current user's profile and basic info.
    """
    user_id = user.get("id")
    profile = await user_service.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"success": True, "profile": profile}


@router.patch("/me")
async def update_my_profile(
    request: Request, 
    body: UserProfileUpdate, 
    user: dict = Depends(verify_user)
):
    """
    Update current user's profile info.
    """
    user_id = user.get("id")
    updates = body.model_dump(exclude_unset=True)
    profile = await user_service.update_profile(user_id, updates)
    return {"success": True, "profile": profile}


@router.get("/me/settings")
async def get_my_settings(request: Request, user: dict = Depends(verify_user)):
    """
    Fetch current user's preferences and settings.
    """
    user_id = user.get("id")
    settings = await user_service.get_settings(user_id)
    return {"success": True, "settings": settings}


@router.patch("/me/settings")
async def update_my_settings(
    request: Request, 
    body: UserSettingsUpdate, 
    user: dict = Depends(verify_user)
):
    """
    Update current user's preferences and settings.
    """
    user_id = user.get("id")
    updates = body.model_dump(exclude_unset=True)
    settings = await user_service.update_settings(user_id, updates)
    return {"success": True, "settings": settings}
