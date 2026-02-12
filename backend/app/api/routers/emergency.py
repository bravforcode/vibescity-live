"""
Emergency Router - API endpoints for emergency services
Find nearby hospitals, police, fire stations using OpenStreetMap
"""
from fastapi import APIRouter, Query
from typing import Optional
from starlette.requests import Request

from app.core.rate_limit import limiter
from app.services.emergency_service import emergency_service

router = APIRouter()


@router.get("/nearby")
@limiter.limit("20/minute")
async def get_all_nearby_emergency(
    request: Request,
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    radius: int = Query(10000, description="Search radius in meters")
):
    """
    Get all nearby emergency services (hospitals, police, fire stations).
    Data sourced from OpenStreetMap via Overpass API.
    """
    result = await emergency_service.get_all_nearby(lat, lng, radius)

    return {
        "success": True,
        "data": {
            "hospitals": [
                {
                    "id": h.id,
                    "name": h.name,
                    "lat": h.lat,
                    "lng": h.lng,
                    "phone": h.phone,
                    "distance_km": h.distance_km,
                    "directions_url": f"https://www.google.com/maps/dir/?api=1&destination={h.lat},{h.lng}"
                }
                for h in result["hospitals"]
            ],
            "police": [
                {
                    "id": p.id,
                    "name": p.name,
                    "lat": p.lat,
                    "lng": p.lng,
                    "phone": p.phone,
                    "distance_km": p.distance_km,
                    "directions_url": f"https://www.google.com/maps/dir/?api=1&destination={p.lat},{p.lng}"
                }
                for p in result["police"]
            ],
            "fire_stations": [
                {
                    "id": f.id,
                    "name": f.name,
                    "lat": f.lat,
                    "lng": f.lng,
                    "distance_km": f.distance_km,
                    "directions_url": f"https://www.google.com/maps/dir/?api=1&destination={f.lat},{f.lng}"
                }
                for f in result["fire_stations"]
            ],
            "emergency_contacts": result["emergency_contacts"]
        },
        "meta": {
            "user_location": {"lat": lat, "lng": lng},
            "search_radius_m": radius,
            "data_source": "OpenStreetMap"
        }
    }


@router.get("/hospitals")
@limiter.limit("30/minute")
async def get_nearby_hospitals(
    request: Request,
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    radius: int = Query(10000, description="Search radius in meters"),
    limit: int = Query(5, description="Max results")
):
    """Get nearby hospitals only."""
    hospitals = await emergency_service.get_nearby_hospitals(lat, lng, radius, limit)

    return {
        "success": True,
        "hospitals": [
            {
                "id": h.id,
                "name": h.name,
                "lat": h.lat,
                "lng": h.lng,
                "phone": h.phone,
                "distance_km": h.distance_km,
                "opening_hours": h.opening_hours,
                "directions_url": f"https://www.google.com/maps/dir/?api=1&destination={h.lat},{h.lng}",
                "call_url": f"tel:{h.phone}" if h.phone else None
            }
            for h in hospitals
        ]
    }


@router.get("/police")
@limiter.limit("30/minute")
async def get_nearby_police(
    request: Request,
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    radius: int = Query(10000, description="Search radius in meters"),
    limit: int = Query(5, description="Max results")
):
    """Get nearby police stations only."""
    stations = await emergency_service.get_nearby_police(lat, lng, radius, limit)

    return {
        "success": True,
        "police_stations": [
            {
                "id": s.id,
                "name": s.name,
                "lat": s.lat,
                "lng": s.lng,
                "phone": s.phone,
                "distance_km": s.distance_km,
                "directions_url": f"https://www.google.com/maps/dir/?api=1&destination={s.lat},{s.lng}",
                "call_url": f"tel:{s.phone}" if s.phone else None
            }
            for s in stations
        ]
    }


@router.get("/contacts")
async def get_emergency_contacts():
    """
    Get Thailand emergency phone numbers.
    No location required.
    """
    contacts = emergency_service.get_emergency_contacts()

    return {
        "success": True,
        "contacts": [
            {
                "type": c["type"],
                "name": c["name"],
                "number": c["number"],
                "icon": c["icon"],
                "call_url": f"tel:{c['number']}"
            }
            for c in contacts
        ]
    }
