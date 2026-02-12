"""
UGC Router - User Generated Content & Gamification
Allows users to submit shops, check-in, upload photos, earn rewards
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional
from starlette.requests import Request
from datetime import datetime, timezone

from app.core.supabase import supabase
from app.core.rate_limit import limiter
from app.core.auth import verify_user

router = APIRouter()


# --- Pydantic Models ---
class ShopSubmission(BaseModel):
    name: str
    category: str
    latitude: float
    longitude: float
    province: Optional[str] = "Unknown"
    images: Optional[List[str]] = []
    description: Optional[str] = ""


class CheckInRequest(BaseModel):
    venue_id: int
    note: Optional[str] = ""


class PhotoUploadRequest(BaseModel):
    venue_id: int
    image_url: str
    caption: Optional[str] = ""


# --- Reward Constants ---
REWARDS = {
    "submit_shop": {"coins": 10, "xp": 50},
    "approve_shop": {"coins": 100, "xp": 500},
    "check_in": {"coins": 5, "xp": 25},
    "upload_photo": {"coins": 20, "xp": 100},
    "first_review": {"coins": 15, "xp": 75},
    "daily_login": {"coins": 3, "xp": 15},
}


# --- Helper Functions ---
def grant_rewards(user_id: str, action: str):
    """Grant coins and XP to user for an action"""
    reward = REWARDS.get(action, {"coins": 0, "xp": 0})

    try:
        # Call Supabase RPC function if exists, otherwise update directly
        supabase.rpc(
            "grant_rewards",
            {
                "target_user_id": user_id,
                "reward_coins": reward["coins"],
                "reward_xp": reward["xp"],
                "action_name": action,
            },
        ).execute()
    except Exception as e:
        # Fallback: direct update
        print(f"RPC failed, attempting direct update: {e}")
        try:
            # Upsert user_stats
            existing = (
                supabase.table("user_stats")
                .select("coins,xp")
                .eq("user_id", user_id)
                .single()
                .execute()
            )

            current_coins = existing.data.get("coins", 0) if existing.data else 0
            current_xp = existing.data.get("xp", 0) if existing.data else 0

            supabase.table("user_stats").upsert(
                {
                    "user_id": user_id,
                    "coins": current_coins + reward["coins"],
                    "xp": current_xp + reward["xp"],
                },
                on_conflict="user_id",
            ).execute()
        except Exception as inner_e:
            print(f"Reward grant failed: {inner_e}")


# --- API Endpoints ---

@router.post("/shops")
@limiter.limit("5/minute")
def submit_shop(
    request: Request,
    submission: ShopSubmission,
    user: dict = Depends(verify_user)
):
    """
    Submit a new shop for review (UGC).
    Awards +10 coins and +50 XP immediately.
    """
    try:
        # 1. Insert into user_submissions
        data = {
            "user_id": user.id,
            "name": submission.name,
            "category": submission.category,
            "latitude": submission.latitude,
            "longitude": submission.longitude,
            "province": submission.province,
            "images": submission.images,
            "description": submission.description,
            "status": "pending"
        }

        result = supabase.table("user_submissions").insert(data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to submit shop")

        # 2. Award Gamification Rewards
        grant_rewards(user.id, "submit_shop")

        return {
            "success": True,
            "message": "Shop submitted successfully! +10 Coins, +50 XP earned.",
            "data": result.data[0],
            "rewards": REWARDS["submit_shop"]
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error submitting shop: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-in")
@limiter.limit("10/minute")
def check_in(
    request: Request,
    check_in_data: CheckInRequest,
    user: dict = Depends(verify_user)
):
    """
    User checks in to a venue.
    Awards +5 coins and +25 XP.
    Limited to 1 check-in per venue per day.
    """
    try:
        # Enforce 1 check-in per venue per day (UTC)
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        existing = supabase.table("check_ins")\
            .select("id")\
            .eq("user_id", user.id)\
            .eq("venue_id", check_in_data.venue_id)\
            .gte("created_at", today_start.isoformat())\
            .execute()

        if existing.data:
            raise HTTPException(status_code=429, detail="Check-in already recorded today")

        # Record check-in
        data = {
            "user_id": user.id,
            "venue_id": check_in_data.venue_id,
            "note": check_in_data.note
        }

        result = supabase.table("check_ins").insert(data).execute()

        if result.data:
            grant_rewards(user.id, "check_in")

            return {
                "success": True,
                "message": "Check-in successful! +5 Coins, +25 XP earned.",
                "data": result.data[0],
                "rewards": REWARDS["check_in"]
            }
        else:
            raise HTTPException(status_code=500, detail="Check-in failed")

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error checking in: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/photos")
@limiter.limit("5/minute")
def upload_photo(
    request: Request,
    photo_data: PhotoUploadRequest,
    user: dict = Depends(verify_user)
):
    """
    Upload a photo for a venue.
    Awards +20 coins and +100 XP.
    """
    try:
        data = {
            "user_id": user.id,
            "venue_id": photo_data.venue_id,
            "image_url": photo_data.image_url,
            "caption": photo_data.caption,
            "status": "pending"  # Needs moderation
        }

        result = supabase.table("venue_photos").insert(data).execute()

        if result.data:
            grant_rewards(user.id, "upload_photo")

            return {
                "success": True,
                "message": "Photo uploaded! +20 Coins, +100 XP earned.",
                "data": result.data[0],
                "rewards": REWARDS["upload_photo"]
            }
        else:
            raise HTTPException(status_code=500, detail="Photo upload failed")

    except Exception as e:
        print(f"Error uploading photo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-stats")
def get_user_stats(user: dict = Depends(verify_user)):
    """
    Get user's gamification stats (coins, XP, level).
    """
    user_id = user.id
    try:
        result = supabase.table("user_stats")\
            .select("*")\
            .eq("user_id", user_id)\
            .single()\
            .execute()

        if result.data:
            data = result.data
            # Calculate level from XP (100 XP = 1 level)
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
                    "photos_count": data.get("photos_count", 0)
                }
            }
        else:
            # New user - return default stats
            return {
                "success": True,
                "stats": {
                    "user_id": user_id,
                    "coins": 0,
                    "xp": 0,
                    "level": 1,
                    "submissions_count": 0,
                    "check_ins_count": 0,
                    "photos_count": 0
                }
            }

    except Exception as e:
        print(f"Error fetching stats: {e}")
        return {
            "success": True,
            "stats": {"user_id": user_id, "coins": 0, "xp": 0, "level": 1}
        }


@router.get("/leaderboard")
async def get_leaderboard(limit: int = Query(10, le=50, description="Max results")):
    """
    Get top users by XP.
    """
    try:
        response = supabase.table("user_stats")\
            .select("user_id, xp, level, coins")\
            .order("xp", desc=True)\
            .limit(limit)\
            .execute()

        return {
            "success": True,
            "leaderboard": response.data or []
        }
    except Exception as e:
        print(f"Error fetching leaderboard: {e}")
        return {"success": True, "leaderboard": []}


@router.get("/achievements")
def get_achievements(user: dict = Depends(verify_user)):
    """
    Get user's achievements/badges.
    """
    user_id = user.id
    try:
        result = supabase.table("user_achievements")\
            .select("*")\
            .eq("user_id", user_id)\
            .execute()

        return {
            "success": True,
            "achievements": result.data or []
        }
    except Exception as e:
        print(f"Error fetching achievements: {e}")
        return {"success": True, "achievements": []}


@router.get("/my-submissions")
def get_user_submissions(user: dict = Depends(verify_user)):
    """
    Get all submissions by a user.
    """
    user_id = user.id
    try:
        result = supabase.table("user_submissions")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .execute()

        return {
            "success": True,
            "submissions": result.data or []
        }
    except Exception as e:
        print(f"Error fetching submissions: {e}")
        return {"success": True, "submissions": []}

# --- Reward Constants ---
REWARDS = {
    "submit_shop": {"coins": 10, "xp": 50},
    "approve_shop": {"coins": 100, "xp": 500},
    "check_in": {"coins": 5, "xp": 25},
    "upload_photo": {"coins": 20, "xp": 100},
    "first_review": {"coins": 15, "xp": 75},
    "daily_login": {"coins": 3, "xp": 15},
}





# --- API Endpoints ---

@router.post("/shops")
@limiter.limit("5/minute")
async def submit_shop(request: Request, submission: ShopSubmission):
    """
    Submit a new shop for review (UGC).
    Awards +10 coins and +50 XP immediately.
    """
    try:
        # 1. Insert into user_submissions
        data = {
            "user_id": submission.user_id,
            "name": submission.name,
            "category": submission.category,
            "latitude": submission.latitude,
            "longitude": submission.longitude,
            "province": submission.province,
            "images": submission.images,
            "description": submission.description,
            "status": "pending"
        }

        result = supabase.table("user_submissions").insert(data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to submit shop")

        # 2. Award Gamification Rewards
        await grant_rewards(submission.user_id, "submit_shop")

        return {
            "success": True,
            "message": "Shop submitted successfully! +10 Coins, +50 XP earned.",
            "data": result.data[0],
            "rewards": REWARDS["submit_shop"]
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error submitting shop: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-in")
@limiter.limit("10/minute")
async def check_in(request: Request, check_in_data: CheckInRequest):
    """
    User checks in to a venue.
    Awards +5 coins and +25 XP.
    Limited to 1 check-in per venue per day.
    """
    try:
        # Record check-in
        data = {
            "user_id": check_in_data.user_id,
            "venue_id": check_in_data.venue_id,
            "note": check_in_data.note
        }

        result = supabase.table("check_ins").insert(data).execute()

        if result.data:
            await grant_rewards(check_in_data.user_id, "check_in")

            return {
                "success": True,
                "message": "Check-in successful! +5 Coins, +25 XP earned.",
                "data": result.data[0],
                "rewards": REWARDS["check_in"]
            }
        else:
            raise HTTPException(status_code=500, detail="Check-in failed")

    except Exception as e:
        print(f"Error checking in: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/photos")
@limiter.limit("5/minute")
async def upload_photo(request: Request, photo_data: PhotoUploadRequest):
    """
    Upload a photo for a venue.
    Awards +20 coins and +100 XP.
    """
    try:
        data = {
            "user_id": photo_data.user_id,
            "venue_id": photo_data.venue_id,
            "image_url": photo_data.image_url,
            "caption": photo_data.caption,
            "status": "pending"  # Needs moderation
        }

        result = supabase.table("venue_photos").insert(data).execute()

        if result.data:
            await grant_rewards(photo_data.user_id, "upload_photo")

            return {
                "success": True,
                "message": "Photo uploaded! +20 Coins, +100 XP earned.",
                "data": result.data[0],
                "rewards": REWARDS["upload_photo"]
            }
        else:
            raise HTTPException(status_code=500, detail="Photo upload failed")

    except Exception as e:
        print(f"Error uploading photo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-stats")
async def get_user_stats(user_id: str = Query(..., description="User ID")):
    """
    Get user's gamification stats (coins, XP, level).
    """
    try:
        result = supabase.table("user_stats")\
            .select("*")\
            .eq("user_id", user_id)\
            .single()\
            .execute()

        if result.data:
            data = result.data
            # Calculate level from XP (100 XP = 1 level)
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
                    "photos_count": data.get("photos_count", 0)
                }
            }
        else:
            # New user - return default stats
            return {
                "success": True,
                "stats": {
                    "user_id": user_id,
                    "coins": 0,
                    "xp": 0,
                    "level": 1,
                    "submissions_count": 0,
                    "check_ins_count": 0,
                    "photos_count": 0
                }
            }

    except Exception as e:
        print(f"Error fetching stats: {e}")
        return {
            "success": True,
            "stats": {"user_id": user_id, "coins": 0, "xp": 0, "level": 1}
        }


@router.get("/leaderboard")
async def get_leaderboard(limit: int = Query(10, le=50, description="Max results")):
    """
    Get top users by XP.
    """
    try:
        response = supabase.table("user_stats")\
            .select("user_id, xp, level, coins")\
            .order("xp", desc=True)\
            .limit(limit)\
            .execute()

        return {
            "success": True,
            "leaderboard": response.data or []
        }
    except Exception as e:
        print(f"Error fetching leaderboard: {e}")
        return {"success": True, "leaderboard": []}


@router.get("/achievements")
async def get_achievements(user_id: str = Query(..., description="User ID")):
    """
    Get user's achievements/badges.
    """
    try:
        result = supabase.table("user_achievements")\
            .select("*")\
            .eq("user_id", user_id)\
            .execute()

        return {
            "success": True,
            "achievements": result.data or []
        }
    except Exception as e:
        print(f"Error fetching achievements: {e}")
        return {"success": True, "achievements": []}


@router.get("/my-submissions")
async def get_user_submissions(user_id: str = Query(..., description="User ID")):
    """
    Get all submissions by a user.
    """
    try:
        result = supabase.table("user_submissions")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .execute()

        return {
            "success": True,
            "submissions": result.data or []
        }
    except Exception as e:
        print(f"Error fetching submissions: {e}")
        return {"success": True, "submissions": []}
