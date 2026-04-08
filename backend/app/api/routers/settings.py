"""
Settings Router - Application and User Configuration
"""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import verify_admin
from app.core.config import get_settings as get_app_settings

router = APIRouter()
logger = logging.getLogger("app.settings")


class AppSettingsUpdate(BaseModel):
    maintenance_mode: bool | None = None
    featured_categories: list[str] | None = None
    global_announcement: str | None = None

@router.get("/public")
async def get_public_settings():
    """
    Fetch public-facing system configuration.
    """
    settings = get_app_settings()
    return {
        "success": True,
        "settings": {
            "project_name": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "env": settings.ENV,
            "maintenance_mode": False # Placeholder for DB-driven config
        }
    }


@router.get("/admin")
async def get_admin_settings(user: dict = Depends(verify_admin)):
    """
    Fetch full system configuration (Admin only).
    """
    settings = get_app_settings()
    # Filter sensitive keys
    safe_settings = {
        k: v
        for k, v in settings.model_dump().items()
        if "SECRET" not in k and "KEY" not in k
    }
    return {"success": True, "settings": safe_settings}


@router.patch("/admin")
async def update_admin_settings(body: AppSettingsUpdate, user: dict = Depends(verify_admin)):
    """
    Update system configuration (Admin only).
    """
    # In a real app, this would persist to a 'system_settings' table in DB
    logger.info("system_settings_updated", extra={"updates": body.model_dump(exclude_unset=True)})
    return {"success": True, "message": "Settings updated successfully"}
