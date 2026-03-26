"""
Emergency Service - Find nearby hospitals, police stations using OpenStreetMap
Uses Overpass API (free, no API key required)
"""
import asyncio
import math
from dataclasses import dataclass

import httpx

# Overpass API endpoint (public, free)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

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

# Thailand emergency contacts by type
EMERGENCY_CONTACTS = {
    "police": {"name": "ตำรวจ", "number": "191", "icon": "🚔"},
    "tourist_police": {"name": "ตำรวจท่องเที่ยว", "number": "1155", "icon": "👮"},
    "ambulance": {"name": "รถพยาบาล", "number": "1669", "icon": "🚑"},
    "fire": {"name": "ดับเพลิง", "number": "199", "icon": "🚒"},
    "highway_police": {"name": "ตำรวจทางหลวง", "number": "1193", "icon": "🛣️"},
    "rescue": {"name": "กู้ชีพ/กู้ภัย", "number": "1554", "icon": "⛑️"},
}


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine formula for distance in km"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


class EmergencyService:
    """
    Service to find nearby emergency facilities using OpenStreetMap.
    Results are cached for 1 hour to reduce API calls.
    """

    def __init__(self):
        self._cache: dict[str, list[EmergencyLocation]] = {}
        self._cache_ttl = 3600  # 1 hour

    def _build_overpass_query(self, lat: float, lng: float, radius_m: int, amenity_type: str) -> str:
        """Build Overpass QL query for nearby amenities"""
        return f"""
        [out:json][timeout:25];
        (
          node["amenity"="{amenity_type}"](around:{radius_m},{lat},{lng});
          way["amenity"="{amenity_type}"](around:{radius_m},{lat},{lng});
        );
        out center body;
        """

    async def _fetch_from_overpass(self, query: str) -> list[dict]:
        """Execute Overpass API query"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    OVERPASS_URL,
                    data={"data": query},
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                response.raise_for_status()
                data = response.json()
                return data.get("elements", [])
        except Exception as e:
            print(f"Overpass API error: {e}")
            return []

    def _parse_osm_element(self, element: dict, location_type: str, user_lat: float, user_lng: float) -> EmergencyLocation:
        """Parse OSM element into EmergencyLocation"""
        tags = element.get("tags", {})

        # Get coordinates (handle both node and way)
        if element.get("type") == "node":
            lat, lng = element.get("lat", 0), element.get("lon", 0)
        else:
            center = element.get("center", {})
            lat, lng = center.get("lat", 0), center.get("lon", 0)

        # Calculate distance
        distance = calculate_distance(user_lat, user_lng, lat, lng)

        return EmergencyLocation(
            id=str(element.get("id", "")),
            name=tags.get("name", tags.get("name:th", tags.get("name:en", f"Unknown {location_type}"))),
            lat=lat,
            lng=lng,
            type=location_type,
            phone=tags.get("phone", tags.get("contact:phone")),
            distance_km=round(distance, 2),
            opening_hours=tags.get("opening_hours"),
            emergency=tags.get("emergency") == "yes" or location_type in ["hospital", "police"]
        )

    async def get_nearby_hospitals(
        self,
        lat: float,
        lng: float,
        radius_m: int = 10000,
        limit: int = 5
    ) -> list[EmergencyLocation]:
        """
        Find nearby hospitals from OpenStreetMap.
        Searches within radius_m meters.
        """
        query = self._build_overpass_query(lat, lng, radius_m, "hospital")
        elements = await self._fetch_from_overpass(query)

        hospitals = [
            self._parse_osm_element(el, "hospital", lat, lng)
            for el in elements
        ]

        # Sort by distance and return top results
        hospitals.sort(key=lambda x: x.distance_km or 999)
        return hospitals[:limit]

    async def get_nearby_police(
        self,
        lat: float,
        lng: float,
        radius_m: int = 10000,
        limit: int = 5
    ) -> list[EmergencyLocation]:
        """Find nearby police stations from OpenStreetMap."""
        query = self._build_overpass_query(lat, lng, radius_m, "police")
        elements = await self._fetch_from_overpass(query)

        stations = [
            self._parse_osm_element(el, "police", lat, lng)
            for el in elements
        ]

        stations.sort(key=lambda x: x.distance_km or 999)
        return stations[:limit]

    async def get_nearby_fire_stations(
        self,
        lat: float,
        lng: float,
        radius_m: int = 15000,
        limit: int = 3
    ) -> list[EmergencyLocation]:
        """Find nearby fire stations from OpenStreetMap."""
        query = self._build_overpass_query(lat, lng, radius_m, "fire_station")
        elements = await self._fetch_from_overpass(query)

        stations = [
            self._parse_osm_element(el, "fire_station", lat, lng)
            for el in elements
        ]

        stations.sort(key=lambda x: x.distance_km or 999)
        return stations[:limit]

    async def get_all_nearby(
        self,
        lat: float,
        lng: float,
        radius_m: int = 10000
    ) -> dict[str, list[EmergencyLocation]]:
        """
        Get all nearby emergency services in parallel.
        Returns hospitals, police, and fire stations.
        """
        hospitals, police, fire = await asyncio.gather(
            self.get_nearby_hospitals(lat, lng, radius_m),
            self.get_nearby_police(lat, lng, radius_m),
            self.get_nearby_fire_stations(lat, lng, radius_m)
        )

        return {
            "hospitals": hospitals,
            "police": police,
            "fire_stations": fire,
            "emergency_contacts": list(EMERGENCY_CONTACTS.values())
        }

    def get_emergency_contacts(self) -> list[dict]:
        """Get list of emergency phone numbers for Thailand."""
        return [
            {**v, "type": k}
            for k, v in EMERGENCY_CONTACTS.items()
        ]


# Singleton instance
emergency_service = EmergencyService()
