from pydantic import BaseModel

class RideEstimateRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float

from typing import Optional

class VibePayload(BaseModel):
    action: str = "vibe" # "vibe" or "subscribe"
    content: str = "✨"
    shopId: Optional[str | int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
