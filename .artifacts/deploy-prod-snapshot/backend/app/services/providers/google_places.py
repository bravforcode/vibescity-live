from __future__ import annotations

from datetime import datetime

import httpx

from app.core.config import get_settings


def _iso_now() -> str:
    return datetime.now(datetime.UTC).isoformat()


class GooglePlacesProvider:
    provider_name = "google"

    async def search_nearby(
        self,
        lat: float,
        lng: float,
        radius: int,
        limit: int = 50,
    ) -> list[dict]:
        settings = get_settings()
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError("GOOGLE_API_KEY not set")

        params = {
            "key": settings.GOOGLE_API_KEY,
            "location": f"{lat},{lng}",
            "radius": radius,
        }

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, read=20.0),
            limits=httpx.Limits(max_connections=10),
        ) as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params=params,
            )
            response.raise_for_status()
            raw_data = response.json()

        out: list[dict] = []
        for item in raw_data.get("results", [])[:limit]:
            place_id = item.get("place_id")
            location = (item.get("geometry") or {}).get("location") or {}
            place_lat = location.get("lat")
            place_lng = location.get("lng")
            if not place_id or place_lat is None or place_lng is None:
                continue
            out.append(
                {
                    "id": f"g-{place_id}",
                    "name": item.get("name"),
                    "category": "Other",
                    "lat": float(place_lat),
                    "lng": float(place_lng),
                    "address": item.get("vicinity"),
                    "open_now": (item.get("opening_hours") or {}).get("open_now"),
                    "source": "google",
                    "updated_at": _iso_now(),
                }
            )
        return out
