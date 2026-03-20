from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/vibe", tags=["vibe-system"])

class VibeClaimRequest(BaseModel):
    place_id: str | None = None
    zone_id: str | None = None
    user_id: str
    vibe_type: str  # "place" or "zone"

class VibeClaimResponse(BaseModel):
    success: bool
    message: str
    vibe_points: int
    streak_count: int
    next_claim_time: datetime

class ZoneInfo(BaseModel):
    zone_id: str
    name: str
    description: str
    current_vibe: float
    max_vibe: float
    active_users: int
    claimable: bool

class PlaceVibeInfo(BaseModel):
    place_id: str
    name: str
    current_vibe: float
    user_vibes: int
    trend: str  # "rising", "stable", "falling"
    last_claim: datetime | None = None

# In-memory storage for demo (replace with database in production)
vibe_claims = {}
zone_vibes = {}
place_vibes = {}

@router.post("/claim", response_model=VibeClaimResponse)
async def claim_vibe(request: VibeClaimRequest):
    """Claim vibe for a place or zone"""
    current_time = datetime.now()
    user_id = request.user_id
    
    # Check cooldown (15 minutes)
    last_claim = vibe_claims.get(user_id)
    if last_claim and (current_time - last_claim).total_seconds() < 900:
        cooldown_remaining = 900 - (current_time - last_claim).total_seconds()
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {int(cooldown_remaining // 60)} minutes {int(cooldown_remaining % 60)} seconds before claiming again"
        )
    
    # Process vibe claim
    vibe_points = 0
    message = ""
    
    if request.vibe_type == "place" and request.place_id:
        # Place vibe claiming logic
        vibe_points = 10
        message = f"Successfully claimed vibe at {request.place_id}!"
        
        # Update place vibes
        if request.place_id not in place_vibes:
            place_vibes[request.place_id] = {"vibes": 0, "last_claim": None}
        
        place_vibes[request.place_id]["vibes"] += 1
        place_vibes[request.place_id]["last_claim"] = current_time
        
    elif request.vibe_type == "zone" and request.zone_id:
        # Zone vibe claiming logic
        vibe_points = 25
        message = f"Successfully claimed {request.zone_id} zone vibe!"
        
        # Update zone vibes
        if request.zone_id not in zone_vibes:
            zone_vibes[request.zone_id] = {"vibes": 0, "users": set()}
        
        zone_vibes[request.zone_id]["vibes"] += 1
        zone_vibes[request.zone_id]["users"].add(user_id)
    
    else:
        raise HTTPException(status_code=400, detail="Invalid vibe claim request")
    
    # Record claim
    vibe_claims[user_id] = current_time
    
    return VibeClaimResponse(
        success=True,
        message=message,
        vibe_points=vibe_points,
        streak_count=1,  # Calculate from database in production
        next_claim_time=current_time + timedelta(minutes=15)
    )

@router.get("/zones", response_model=list[ZoneInfo])
async def get_zone_vibes():
    """Get current vibe status for all zones"""
    zones = [
        {
            "zone_id": "nimman-chill-zone",
            "name": "Nimman Chill Zone",
            "description": "Simulated Beach Area",
            "current_vibe": zone_vibes.get("nimman-chill-zone", {}).get("vibes", 0) * 0.1,
            "max_vibe": 1.0,
            "active_users": len(zone_vibes.get("nimman-chill-zone", {}).get("users", set())),
            "claimable": True
        },
        {
            "zone_id": "ping-river",
            "name": "Ping River", 
            "description": "Conceptual River Area",
            "current_vibe": zone_vibes.get("ping-river", {}).get("vibes", 0) * 0.08,
            "max_vibe": 1.0,
            "active_users": len(zone_vibes.get("ping-river", {}).get("users", set())),
            "claimable": True
        }
    ]
    
    return [ZoneInfo(**zone) for zone in zones]

@router.get("/places/{place_id}", response_model=PlaceVibeInfo)
async def get_place_vibe(place_id: str):
    """Get current vibe status for a specific place"""
    place_data = place_vibes.get(place_id, {"vibes": 0, "last_claim": None})
    
    # Calculate trend based on recent activity
    total_vibes = place_data.get("vibes", 0)
    if total_vibes > 50:
        trend = "rising"
    elif total_vibes > 20:
        trend = "stable"
    else:
        trend = "falling"
    
    return PlaceVibeInfo(
        place_id=place_id,
        name=f"Place {place_id}",  # Get from database in production
        current_vibe=min(total_vibes * 0.02, 1.0),
        user_vibes=total_vibes,
        trend=trend,
        last_claim=place_data.get("last_claim")
    )

@router.get("/leaderboard")
async def get_vibe_leaderboard():
    """Get top vibe contributors"""
    # Aggregate user contributions
    user_stats = {}
    
    for zone_data in zone_vibes.values():
        for user_id in zone_data.get("users", set()):
            user_stats[user_id] = user_stats.get(user_id, 0) + 1
    
    for place_id, place_data in place_vibes.items():
        vibes = place_data.get("vibes", 0)
        # In production, track which user claimed each place
    
    # Sort by total contributions
    top_users = sorted(user_stats.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return {
        "leaderboard": [
            {"user_id": user_id, "contributions": score}
            for user_id, score in top_users
        ],
        "total_zones": len(zone_vibes),
        "total_places": len(place_vibes),
        "timestamp": datetime.now().isoformat()
    }

@router.get("/status")
async def get_vibe_system_status():
    """Get overall vibe system status"""
    return {
        "active_zones": len([z for z in zone_vibes.values() if z.get("vibes", 0) > 0]),
        "active_places": len([p for p in place_vibes.values() if p.get("vibes", 0) > 0]),
        "total_claims_today": len(vibe_claims),  # Filter by today in production
        "system_health": "operational",
        "peak_vibe_time": "22:00",  # Based on usage patterns
        "average_vibe_intensity": 0.7  # Calculate from real data
    }
