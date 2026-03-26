from __future__ import annotations

from pydantic import BaseModel


class Place(BaseModel):
    id: str
    name: str | None = None
    category: str
    lat: float
    lng: float
    address: str | None = None
    open_now: bool | None = None
    source: str
    updated_at: str
