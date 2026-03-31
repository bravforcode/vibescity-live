"""
Emergency Service - Find nearby hospitals, police stations, and fire stations
from the seeded Thailand-wide emergency_locations dataset.
"""

import asyncio
import math
from dataclasses import dataclass

from app.core.supabase import supabase, supabase_admin


@dataclass
class EmergencyLocation:
    id: str
    name: str
    lat: float
    lng: float
    type: str  # hospital, police, fire_station
    phone: str | None = None
    distance_km: float | None = None
    opening_hours: str | None = None
    emergency: bool = True


EMERGENCY_CONTACTS = {
    "police": {"name": "ตำรวจ", "number": "191", "icon": "🚔"},
    "tourist_police": {"name": "ตำรวจท่องเที่ยว", "number": "1155", "icon": "👮"},
    "ambulance": {"name": "รถพยาบาล", "number": "1669", "icon": "🚑"},
    "fire": {"name": "ดับเพลิง", "number": "199", "icon": "🚒"},
    "highway_police": {"name": "ตำรวจทางหลวง", "number": "1193", "icon": "🛣️"},
    "rescue": {"name": "กู้ชีพ/กู้ภัย", "number": "1554", "icon": "⛑️"},
}


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine formula for distance in km."""
    radius = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))
    return radius * c


class EmergencyService:
    """Service to find nearby emergency facilities from seeded DB data."""

    def __init__(self):
        self._client = supabase_admin or supabase

    def _fetch_seed_rows(self, location_type: str | None = None) -> list[dict]:
        if not self._client:
            return []

        try:
            query = self._client.table("emergency_locations").select(
                "id,name,type,latitude,longitude,phone,address,province,is_24h"
            )
            if location_type:
                query = query.eq("type", location_type)
            response = query.execute()
            return getattr(response, "data", None) or []
        except Exception:
            return []

    async def _get_seed_rows(self, location_type: str | None = None) -> list[dict]:
        return await asyncio.to_thread(self._fetch_seed_rows, location_type)

    def _parse_seed_row(
        self,
        row: dict,
        user_lat: float,
        user_lng: float,
    ) -> EmergencyLocation | None:
        try:
            lat = float(row.get("latitude"))
            lng = float(row.get("longitude"))
        except (TypeError, ValueError):
            return None

        distance = calculate_distance(user_lat, user_lng, lat, lng)
        location_type = str(row.get("type") or "").strip().lower() or "unknown"

        return EmergencyLocation(
            id=str(row.get("id", "")),
            name=str(row.get("name") or f"Unknown {location_type}").strip(),
            lat=lat,
            lng=lng,
            type=location_type,
            phone=str(row.get("phone") or "").strip() or None,
            distance_km=round(distance, 2),
            opening_hours="24/7" if row.get("is_24h") else None,
            emergency=True,
        )

    async def _get_nearby_by_type(
        self,
        lat: float,
        lng: float,
        location_type: str,
        radius_m: int,
        limit: int,
    ) -> list[EmergencyLocation]:
        rows = await self._get_seed_rows(location_type)
        radius_km = max(radius_m / 1000, 1)
        locations = []

        for row in rows:
            parsed = self._parse_seed_row(row, lat, lng)
            if not parsed or parsed.distance_km is None:
                continue
            if parsed.distance_km <= radius_km:
                locations.append(parsed)

        locations.sort(key=lambda item: item.distance_km or 999)
        return locations[:limit]

    async def get_nearby_hospitals(
        self,
        lat: float,
        lng: float,
        radius_m: int = 10000,
        limit: int = 5,
    ) -> list[EmergencyLocation]:
        return await self._get_nearby_by_type(lat, lng, "hospital", radius_m, limit)

    async def get_nearby_police(
        self,
        lat: float,
        lng: float,
        radius_m: int = 10000,
        limit: int = 5,
    ) -> list[EmergencyLocation]:
        return await self._get_nearby_by_type(lat, lng, "police", radius_m, limit)

    async def get_nearby_fire_stations(
        self,
        lat: float,
        lng: float,
        radius_m: int = 15000,
        limit: int = 3,
    ) -> list[EmergencyLocation]:
        return await self._get_nearby_by_type(lat, lng, "fire", radius_m, limit)

    async def get_all_nearby(
        self,
        lat: float,
        lng: float,
        radius_m: int = 10000,
    ) -> dict[str, list[EmergencyLocation]]:
        hospitals, police, fire = await asyncio.gather(
            self.get_nearby_hospitals(lat, lng, radius_m),
            self.get_nearby_police(lat, lng, radius_m),
            self.get_nearby_fire_stations(lat, lng, radius_m),
        )

        return {
            "hospitals": hospitals,
            "police": police,
            "fire_stations": fire,
            "emergency_contacts": list(EMERGENCY_CONTACTS.values()),
        }

    def get_emergency_contacts(self) -> list[dict]:
        return [{**value, "type": key} for key, value in EMERGENCY_CONTACTS.items()]


emergency_service = EmergencyService()
