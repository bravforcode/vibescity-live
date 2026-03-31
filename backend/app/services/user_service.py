"""
User Service - Manages user profiles and preferences.
"""
import logging
from typing import Any

from app.core.supabase import supabase_admin as supabase

logger = logging.getLogger(__name__)

class UserService:
    """
    Service for managing user-related data.
    """

    async def get_profile(self, user_id: str) -> dict[str, Any] | None:
        """Fetch user profile from Supabase."""
        import asyncio
        response = await asyncio.to_thread(
            lambda: supabase.table("user_profiles").select("*").eq("id", user_id).single().execute()
        )
        return response.data

    async def update_profile(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        """Update user profile in Supabase."""
        import asyncio
        response = await asyncio.to_thread(
            lambda: supabase.table("user_profiles").update(updates).eq("id", user_id).execute()
        )
        return response.data[0] if response.data else None

    async def get_settings(self, user_id: str) -> dict[str, Any]:
        """Fetch user-specific settings/preferences."""
        profile = await self.get_profile(user_id)
        return profile.get("settings", {}) if profile else {}

    async def update_settings(self, user_id: str, settings: dict[str, Any]) -> dict[str, Any]:
        """Update user-specific settings/preferences."""
        profile = await self.get_profile(user_id)
        current_settings = profile.get("settings", {}) if profile else {}
        current_settings.update(settings)
        
        await self.update_profile(user_id, {"settings": current_settings})
        return current_settings

user_service = UserService()
