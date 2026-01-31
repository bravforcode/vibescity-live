from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional
from app.core.supabase import supabase
from app.core.rate_limit import limiter

router = APIRouter()

# --- Pydantic Models ---
class ShopSubmission(BaseModel):
    user_id: str
    name: str
    category: str
    latitude: float
    longitude: float
    province: Optional[str] = "Unknown"
    images: Optional[List[str]] = []

class GamificationAction(BaseModel):
    user_id: str
    action_type: str # 'add_shop', 'add_photo', 'review', 'check_in'

# --- API Endpoints ---

@router.post("/shops")
@limiter.limit("5/minute")
async def submit_shop(request: Request, submission: ShopSubmission):
    """
    Submit a new shop for review (UGC).
    Awards coins and XP immediately upon submission (or approval, depending on policy).
    Here we award small points for submission, big points for approval.
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
            "status": "pending"
        }

        result = supabase.table("user_submissions").insert(data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to submit shop")

        # 2. Award Gamification Rewards (Optimistic: +10 XP for submitting)
        # Calling the SQL function we created in loki_mode_schema.sql
        reward_payload = {
            "target_user_id": submission.user_id,
            "reward_coins": 10,
            "reward_xp": 50,
            "action_name": "submit_shop_pending"
        }

        supabase.rpc("grant_rewards", reward_payload).execute()

        return {"status": "success", "message": "Shop submitted successfully! +10 Coins earned.", "data": result.data[0]}

    except Exception as e:
        print(f"Error submitting shop: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/leaderboard")
async def get_leaderboard(limit: int = 10):
    """
    Get top users by XP.
    """
    try:
        # Fetch user_stats ordered by XP
        response = supabase.table("user_stats")\
            .select("user_id, xp, level, coins, auth:users(email)")\
            .order("xp", desc=True)\
            .limit(limit)\
            .execute()

        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
