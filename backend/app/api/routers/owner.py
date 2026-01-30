from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import random
from app.api.routers.vibes import manager

router = APIRouter()

class OwnerStats(BaseModel):
    shop_id: str
    live_visitors: int
    total_views: int
    rating: float
    is_promoted: bool

@router.get("/stats/{shop_id}", response_model=OwnerStats)
async def get_shop_stats(shop_id: str):
    # 1. Get Real-time Count from ConnectionManager
    # manager.room_connections is { shop_id: [ws1, ws2] }
    # shop_id in room_connections is usually string (from URL)

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
async def toggle_promote(shop_id: str):
    # In real app, check payment/credits
    return {"status": "success", "is_promoted": True, "message": "Shop boosted! Giant Pin activated."}
