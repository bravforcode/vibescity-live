from pydantic import BaseModel


class RideEstimateRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float



class VibePayload(BaseModel):
    action: str = "vibe" # "vibe" or "subscribe"
    content: str = "✨"
    shopId: str | int | None = None
    lat: float | None = None
    lng: float | None = None
