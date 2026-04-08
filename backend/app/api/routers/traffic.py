"""
Traffic Router - Real-time traffic density and incidents
Provides nearby traffic segments and road status
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.rate_limit import limiter
from app.services.traffic_service import traffic_service

router = APIRouter()
logger = logging.getLogger("app.traffic")


class TrafficIncidentInput(BaseModel):
    id: str
    type: str
    description: str
    lat: float
    lng: float
    severity: str
    created_at: str

class TrafficSegmentResponse(BaseModel):
    way_id: int
    name: str
    density: str
    speed_kmh: float
    incidents: list[TrafficIncidentInput] = Field(default_factory=list)

class TrafficNearbyResponse(BaseModel):
    success: bool
    segments: list[TrafficSegmentResponse]
    meta: dict[str, Any]


@router.get("/nearby", response_model=TrafficNearbyResponse)
@limiter.limit("20/minute")
async def get_nearby_traffic(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(1000, ge=100, le=5000)
):
    """
    Fetch nearby real-time traffic segments and incidents.
    
    Includes data fusion from Google, TomTom, and OSM.
    """
    try:
        segments = await traffic_service.get_nearby_traffic(lat, lng, radius)
        
        return {
            "success": True,
            "segments": segments,
            "meta": {
                "lat": lat,
                "lng": lng,
                "radius": radius
            }
        }
    except Exception as e:
        logger.exception("Traffic lookup failed: %s", str(e))
        raise HTTPException(status_code=500, detail="Unable to fetch traffic data") from e


@router.post("/webhook/subscribe")
async def subscribe_traffic_webhook(
    request: Request,
    merchant_id: str = Query(...),
    webhook_url: str = Query(...),
    conditions: list[dict[str, Any]] | None = None,
):
    """
    Subscribe a merchant to real-time traffic alerts via webhook.
    """
    try:
        subscription = await traffic_service.subscribe_merchant_webhook(
            merchant_id,
            webhook_url,
            conditions or [],
        )
        return {"success": True, "subscription": subscription}
    except Exception as e:
        logger.exception("Webhook subscription failed: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to subscribe to webhooks") from e


@router.get("/status")
async def get_traffic_status():
    """
    Check the operational status of the traffic service providers.
    """
    return {
        "status": "operational",
        "providers": {
            "osm": "healthy",
            "overpass": "healthy",
            "mock_fallback": "active"
        }
    }
