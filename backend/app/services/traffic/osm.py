"""
OSM/Overpass Traffic Adapter
Uses OpenStreetMap data with fallback logic.
"""

import random

import httpx

from .base import StandardIncident, StandardTrafficSegment, TrafficProvider


class OSMTrafficProvider(TrafficProvider):
    """
    Adapter for OSM/Overpass Traffic data.
    """
    
    def __init__(self):
        super().__init__("osm")
        self._client = httpx.AsyncClient(timeout=15.0)

    async def get_traffic_nearby(self, lat: float, lng: float, radius_m: int = 1000) -> list[StandardTrafficSegment]:
        """
        Implementation using Overpass QL for road metadata.
        """
        # Simulated segments for now as OSM doesn't give real-time speeds directly.
        # Typically merged with a 3rd party or floating car data (FCD).
        random.seed(f"osm:{lat}:{lng}")
        
        segments = []
        for i in range(random.randint(2, 5)):
            free_flow = 50.0
            speed = random.uniform(5.0, 55.0)
            density = self.calculate_density(speed, free_flow)
            
            segments.append(StandardTrafficSegment(
                way_id=str(random.randint(1000000, 9999999)),
                name=f"OSM Street {i+1}",
                density=density,
                speed_kmh=speed,
                free_flow_speed_kmh=free_flow,
                current_travel_time_sec=120,
                free_flow_travel_time_sec=100,
                provider="osm",
                confidence_score=0.7
            ))
            
        return segments

    async def get_incidents_nearby(self, lat: float, lng: float, radius_m: int = 5000) -> list[StandardIncident]:
        """
        OSM incidents are usually fetched from community sources (e.g. Waze/WME).
        """
        return []
