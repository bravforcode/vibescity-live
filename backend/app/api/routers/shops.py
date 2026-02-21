from fastapi import APIRouter, HTTPException, Request
from typing import List, Optional
from app.services.shop_service import shop_service
from app.core.rate_limit import limiter

router = APIRouter()

@router.get("/", response_model=List[dict])
@limiter.limit("60/minute")
async def read_shops(request: Request):
    """
    Retrieve all shops.
    """
    return shop_service.get_all_shops()

@router.get("/{shop_id}", response_model=dict)
@limiter.limit("120/minute")
async def read_shop(request: Request, shop_id: int):
    """
    Retrieve a specific shop by ID.
    """
    shop = shop_service.get_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    return shop
