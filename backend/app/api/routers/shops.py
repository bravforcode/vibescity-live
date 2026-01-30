from fastapi import APIRouter, HTTPException
from typing import List, Optional
from app.services.shop_service import shop_service

router = APIRouter()

@router.get("/", response_model=List[dict])
async def read_shops():
    """
    Retrieve all shops.
    """
    return shop_service.get_all_shops()

@router.get("/{shop_id}", response_model=dict)
async def read_shop(shop_id: int):
    """
    Retrieve a specific shop by ID.
    """
    shop = shop_service.get_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    return shop
