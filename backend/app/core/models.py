from typing import Literal
from pydantic import BaseModel, Field


class RideEstimateRequest(BaseModel):
    start_lat: float = Field(ge=-90, le=90, description="Starting latitude [-90, 90]")
    start_lng: float = Field(ge=-180, le=180, description="Starting longitude [-180, 180]")
    end_lat: float = Field(ge=-90, le=90, description="Ending latitude [-90, 90]")
    end_lng: float = Field(ge=-180, le=180, description="Ending longitude [-180, 180]")


class VibePayload(BaseModel):
    action: Literal["vibe", "subscribe", "checkin", "redeem"] = Field(default="vibe", description="Action type")
    content: str = Field(default="✨", max_length=500)
    shopId: str | int | None = None
    lat: float | None = Field(default=None, ge=-90, le=90, description="Latitude [-90, 90]")
    lng: float | None = Field(default=None, ge=-180, le=180, description="Longitude [-180, 180]")
