"""
Rides Router - Ride-hailing price comparison and booking
Provides estimates from multiple providers with deep links
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from starlette.requests import Request

from app.core.rate_limit import limiter
from app.services.ride_service import ride_service, Location

router = APIRouter()


class LocationInput(BaseModel):
    lat: float
    lng: float


class RideEstimateRequest(BaseModel):
    origin: LocationInput
    destination: LocationInput
    province: Optional[str] = "กรุงเทพมหานคร"


class RideEstimateResponse(BaseModel):
    name: str
    service: str
    price: int
    currency: str
    eta_mins: int
    deep_link: str
    icon: str
    available: bool


@router.post("/estimate")
@limiter.limit("30/minute")
async def estimate_ride(request: Request, body: RideEstimateRequest):
    """
    Get ride estimates from multiple providers.

    Returns sorted list of available rides with:
    - Price estimates based on distance
    - ETA estimates
    - Deep links to open provider apps
    - Availability status by province
    """
    try:
        origin = Location(lat=body.origin.lat, lng=body.origin.lng)
        destination = Location(lat=body.destination.lat, lng=body.destination.lng)

        estimates = ride_service.get_estimates(
            origin=origin,
            destination=destination,
            province=body.province or "กรุงเทพมหานคร"
        )

        return {
            "success": True,
            "providers": [
                {
                    "name": e.name,
                    "service": e.service,
                    "price": e.price,
                    "currency": e.currency,
                    "eta_mins": e.eta_mins,
                    "deep_link": e.deep_link,
                    "icon": e.icon,
                    "available": e.available
                }
                for e in estimates
            ],
            "meta": {
                "origin": {"lat": origin.lat, "lng": origin.lng},
                "destination": {"lat": destination.lat, "lng": destination.lng},
                "province": body.province
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/providers")
async def list_providers():
    """
    List all supported ride providers and their coverage areas.
    """
    return {
        "providers": [
            {
                "id": "grab",
                "name": "Grab",
                "icon": "🚗",
                "coverage": ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต", "ขอนแก่น", "หาดใหญ่", "พัทยา"]
            },
            {
                "id": "bolt",
                "name": "Bolt",
                "icon": "⚡",
                "coverage": ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต"]
            },
            {
                "id": "lineman",
                "name": "Lineman",
                "icon": "🏍️",
                "coverage": ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต", "ขอนแก่น"]
            },
            {
                "id": "maxim",
                "name": "Maxim",
                "icon": "🚕",
                "coverage": ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต", "ขอนแก่น", "อุดรธานี"]
            },
            {
                "id": "indriver",
                "name": "InDriver",
                "icon": "💬",
                "coverage": ["กรุงเทพมหานคร", "เชียงใหม่"]
            }
        ]
    }
