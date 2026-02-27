"""
UGC Router - User Generated Content & Gamification
"""
from datetime import UTC, datetime
from typing import Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.core.auth import verify_user
from app.core.cache import user_profile_cache
from app.core.rate_limit import limiter
from app.core.supabase import supabase

router = APIRouter()
VenueIdInput = Union[str, int, UUID]


class ShopSubmission(BaseModel):
    name: str
    category: str
    latitude: float
    longitude: float
    province: str | None = "Unknown"
    images: list[str] = Field(default_factory=list)
    description: str | None = ""


class CheckInRequest(BaseModel):
    venue_id: VenueIdInput
    note: str | None = ""


class PhotoUploadRequest(BaseModel):
    venue_id: VenueIdInput
    image_url: str
    caption: str | None = ""


REWARDS = {
    "submit_shop": {"coins": 10, "xp": 50},
    "approve_shop": {"coins": 100, "xp": 500},
    "check_in": {"coins": 5, "xp": 25},
    "upload_photo": {"coins": 20, "xp": 100},
    "first_review": {"coins": 15, "xp": 75},
    "daily_login": {"coins": 3, "xp": 15},
}


def grant_rewards(user_id: str, action: str) -> dict | None:
    reward = REWARDS.get(action, {"coins": 0, "xp": 0})
    # S5: invalidate cached profile so next read reflects new coin/xp balance
    user_profile_cache.pop(user_id, None)
    try:
        result = supabase.rpc(
            "grant_rewards",
            {
                "target_user_id": user_id,
                "reward_coins": reward["coins"],
                "reward_xp": reward["xp"],
                "action_name": action,
            },
        ).execute()
        data = getattr(result, "data", None)
        if isinstance(data, dict) and data.get("success"):
            return data
        return None
    except Exception:
        # Reward failures should not block the user action.
        return None


def _normalize_venue_id(venue_id: VenueIdInput) -> tuple[str, str | None]:
    venue_text = str(venue_id).strip()
    if not venue_text:
        raise HTTPException(status_code=422, detail="venue_id is required")
    try:
        venue_uuid = str(UUID(venue_text))
    except ValueError:
        venue_uuid = None
    return venue_text, venue_uuid


@router.post("/shops")
@limiter.limit("5/minute")
def submit_shop(
    request: Request,
    submission: ShopSubmission,
    user=Depends(verify_user),
):
    try:
        payload = {
            "user_id": user.id,
            "name": submission.name,
            "category": submission.category,
            "latitude": submission.latitude,
            "longitude": submission.longitude,
            "province": submission.province,
            "images": submission.images,
            "description": submission.description,
            "status": "pending",
        }
        result = supabase.table("user_submissions").insert(payload).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to submit shop")

        reward_result = grant_rewards(user.id, "submit_shop")
        rewarded = reward_result is not None
        return {
            "success": True,
            "message": (
                "Shop submitted successfully! +10 Coins, +50 XP earned."
                if rewarded
                else "Shop submitted successfully, but daily reward limit reached."
            ),
            "data": result.data[0],
            "rewards": REWARDS["submit_shop"] if rewarded else {"coins": 0, "xp": 0},
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-in")
@limiter.limit("10/minute")
def check_in(
    request: Request,
    check_in_data: CheckInRequest,
    user=Depends(verify_user),
):
    try:
        venue_text, venue_uuid = _normalize_venue_id(check_in_data.venue_id)
        today_start = datetime.now(UTC).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        existing_query = supabase.table("check_ins").select("id").eq("user_id", user.id)
        if venue_uuid:
            try:
                existing = (
                    existing_query
                    .or_(f"venue_id_uuid.eq.{venue_uuid},venue_id.eq.{venue_text}")
                    .gte("created_at", today_start.isoformat())
                    .execute()
                )
            except Exception:
                existing = (
                    supabase.table("check_ins")
                    .select("id")
                    .eq("user_id", user.id)
                    .eq("venue_id", venue_text)
                    .gte("created_at", today_start.isoformat())
                    .execute()
                )
        else:
            existing = (
                existing_query
                .eq("venue_id", venue_text)
                .gte("created_at", today_start.isoformat())
                .execute()
            )
        if existing.data:
            raise HTTPException(status_code=429, detail="Check-in already recorded today")

        payload = {
            "user_id": user.id,
            "venue_id": venue_text,
            "note": check_in_data.note,
        }
        if venue_uuid:
            payload["venue_id_uuid"] = venue_uuid
        try:
            result = supabase.table("check_ins").insert(payload).execute()
        except Exception:
            payload.pop("venue_id_uuid", None)
            result = supabase.table("check_ins").insert(payload).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Check-in failed")

        reward_result = grant_rewards(user.id, "check_in")
        rewarded = reward_result is not None
        return {
            "success": True,
            "message": (
                "Check-in successful! +5 Coins, +25 XP earned."
                if rewarded
                else "Check-in successful, but daily reward limit reached."
            ),
            "data": result.data[0],
            "rewards": REWARDS["check_in"] if rewarded else {"coins": 0, "xp": 0},
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/photos")
@limiter.limit("5/minute")
def upload_photo(
    request: Request,
    photo_data: PhotoUploadRequest,
    user=Depends(verify_user),
):
    try:
        venue_text, venue_uuid = _normalize_venue_id(photo_data.venue_id)
        payload = {
            "user_id": user.id,
            "venue_id": venue_uuid or venue_text,
            "image_url": photo_data.image_url,
            "caption": photo_data.caption,
            "status": "pending",
        }
        if venue_uuid:
            payload["venue_id_uuid"] = venue_uuid
        try:
            result = supabase.table("venue_photos").insert(payload).execute()
        except Exception:
            payload.pop("venue_id_uuid", None)
            if venue_uuid:
                payload["venue_id"] = venue_text
            result = supabase.table("venue_photos").insert(payload).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Photo upload failed")

        reward_result = grant_rewards(user.id, "upload_photo")
        rewarded = reward_result is not None
        return {
            "success": True,
            "message": (
                "Photo uploaded! +20 Coins, +100 XP earned."
                if rewarded
                else "Photo uploaded, but daily reward limit reached."
            ),
            "data": result.data[0],
            "rewards": REWARDS["upload_photo"] if rewarded else {"coins": 0, "xp": 0},
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-stats")
def get_user_stats(user=Depends(verify_user)):
    user_id = user.id
    try:
        result = (
            supabase.table("user_stats")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if result.data:
            data = result.data
            level = data.get("level", (data.get("xp", 0) // 100) + 1)
            return {
                "success": True,
                "stats": {
                    "user_id": user_id,
                    "coins": data.get("coins", 0),
                    "xp": data.get("xp", 0),
                    "level": level,
                    "submissions_count": data.get("submissions_count", 0),
                    "check_ins_count": data.get("check_ins_count", 0),
                    "photos_count": data.get("photos_count", 0),
                },
            }
        return {
            "success": True,
            "stats": {
                "user_id": user_id,
                "coins": 0,
                "xp": 0,
                "level": 1,
                "submissions_count": 0,
                "check_ins_count": 0,
                "photos_count": 0,
            },
        }
    except Exception:
        return {
            "success": True,
            "stats": {"user_id": user_id, "coins": 0, "xp": 0, "level": 1},
        }


@router.get("/leaderboard")
def get_leaderboard(limit: int = Query(10, le=50, description="Max results")):
    try:
        response = (
            supabase.table("user_stats")
            .select("user_id, xp, level, coins")
            .order("xp", desc=True)
            .limit(limit)
            .execute()
        )
        return {"success": True, "leaderboard": response.data or []}
    except Exception:
        return {"success": True, "leaderboard": []}


@router.get("/achievements")
def get_achievements(user=Depends(verify_user)):
    user_id = user.id
    try:
        result = (
            supabase.table("user_achievements")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return {"success": True, "achievements": result.data or []}
    except Exception:
        return {"success": True, "achievements": []}


@router.get("/my-submissions")
def get_user_submissions(user=Depends(verify_user)):
    user_id = user.id
    try:
        result = (
            supabase.table("user_submissions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"success": True, "submissions": result.data or []}
    except Exception:
        return {"success": True, "submissions": []}
