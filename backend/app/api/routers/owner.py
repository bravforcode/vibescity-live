from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
import random
from app.api.routers.vibes import manager
from app.core.rate_limit import limiter
from app.core.auth import verify_admin, verify_user
from app.core.supabase import supabase, supabase_admin

router = APIRouter()

class OwnerStats(BaseModel):
    shop_id: str
    live_visitors: int
    total_views: int
    rating: float
    is_promoted: bool

@router.get("/stats/{shop_id}", response_model=OwnerStats)
@limiter.limit("60/minute")
async def get_shop_stats(
    request: Request,
    shop_id: str,
    user: dict = Depends(verify_user),
):
    # 1. Get Real-time Count from ConnectionManager
    # manager.room_connections is { shop_id: [ws1, ws2] }
    # shop_id in room_connections is usually string (from URL)

    # Ownership check (or admin)
    await _ensure_owner_or_admin(shop_id, user)

    live_count = 0
    if shop_id in manager.room_connections:
        live_count = len(manager.room_connections[shop_id])

    # 2. Mock Persistent Stats
    # In a real app, these would come from DB
    return {
        "shop_id": shop_id,
        "live_visitors": live_count,
        "total_views": 1543 + (live_count * 12), # Mock dynamicism
        "rating": 4.8,
        "is_promoted": False # Mock default
    }

@router.post("/promote/{shop_id}")
@limiter.limit("10/minute")
async def toggle_promote(
    request: Request,
    shop_id: str,
    user: dict = Depends(verify_user),
):
    await _ensure_owner_or_admin(shop_id, user)
    # In real app, check payment/credits
    return {"status": "success", "is_promoted": True, "message": "Shop boosted! Giant Pin activated."}


async def _ensure_owner_or_admin(shop_id: str, user: dict):
    # Allow admin
    try:
        await verify_admin(user)
        return
    except Exception:
        pass

    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    client = supabase_admin or supabase
    try:
        res = client.table("shops").select("owner_id").eq("id", shop_id).single().execute()
        owner_id = res.data.get("owner_id") if res and res.data else None
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to verify ownership")

    if not owner_id or str(owner_id) != str(user_id):
        raise HTTPException(status_code=403, detail="Owner privileges required")
