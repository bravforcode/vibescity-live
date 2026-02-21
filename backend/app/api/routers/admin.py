from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List, Optional
from pydantic import BaseModel
from app.core.supabase import supabase_admin
from app.core.auth import verify_admin
from app.core.rate_limit import limiter
from app.services.notifications import notify_shop_approved
from app.services.venue_repository import VenueRepository

router = APIRouter()

# --- Schemas ---
class ReviewAction(BaseModel):
    reason: Optional[str] = None

# --- Endpoints ---

@router.get("/pending/shops")
async def list_pending_shops(user: dict = Depends(verify_admin)):
    """
    List all shops with status 'pending'.
    """
    if not supabase_admin:
        raise HTTPException(500, "Admin client not configured")

    try:
        repository = VenueRepository(supabase_admin)
        response = repository.list_pending()

        return {"success": True, "data": response.data}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/shops/{shop_id}/approve")
async def approve_shop(shop_id: str, user: dict = Depends(verify_admin)):
    """
    Approve a shop and award the submitter.
    """
    if not supabase_admin:
        raise HTTPException(500, "Admin client not configured")

    try:
        repository = VenueRepository(supabase_admin)
        # 1. Get the shop to find the submitter (owner_id)
        # Note: In our schema, `owner_id` is the submitter
        owner_id = repository.get_owner(shop_id)
        if not owner_id:
            raise HTTPException(404, "Shop not found")

        # 2. Update status to active
        update_res = repository.approve(shop_id)

        if not update_res.data:
             raise HTTPException(500, "Failed to update shop status")

        # 3. Grant Rewards (Coins/XP) via RPC
        # Action: 'approve_shop'

        if owner_id:
            try:
                supabase_admin.rpc("grant_rewards", {
                    "target_user_id": owner_id,
                    "reward_coins": 100,
                    "reward_xp": 500,
                    "action_name": "approve_shop"
                }).execute()

                # 4. Send Notification
                from app.services.notifications import notify_shop_approved
                await notify_shop_approved(owner_id, shop_name="Your Shop", coins=100)

            except Exception as e:
                print(f"Failed to award/notify: {e}")
                # Don't fail the approval if reward fails, but log it

        return {"success": True, "message": "Shop approved and rewards granted"}

    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/shops/{shop_id}/reject")
async def reject_shop(shop_id: str, action: ReviewAction, user: dict = Depends(verify_admin)):
    """
    Reject a shop.
    """
    if not supabase_admin:
        raise HTTPException(500, "Admin client not configured")

    try:
        repository = VenueRepository(supabase_admin)
        # Update status to rejected
        # Optionally delete or just mark rejected
        update_res = repository.reject(shop_id, action.reason)
        if not update_res.data:
            raise HTTPException(500, "Failed to reject shop")

        return {"success": True, "message": "Shop rejected"}

    except Exception as e:
        raise HTTPException(500, str(e))
