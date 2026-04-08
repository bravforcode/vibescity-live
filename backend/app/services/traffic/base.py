"""
Base Traffic Provider - Abstract interface for all traffic data sources.
Ensures consistency across Google Maps, TomTom, OSM, and Gov sources.
"""
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any


class TrafficDensity(Enum):
    LOW = "low"
    MODERATE = "moderate"
    HEAVY = "heavy"
    STALLED = "stalled"
    UNKNOWN = "unknown"

@dataclass
class StandardIncident:
    id: str
    type: str  # accident, construction, congestion, hazard, closure, event
    description: str
    lat: float
    lng: float
    severity: str  # minor, moderate, major, critical
    provider: str
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)

@dataclass
class StandardTrafficSegment:
    way_id: str
    name: str
    density: TrafficDensity
    speed_kmh: float
    free_flow_speed_kmh: float
    current_travel_time_sec: int
    free_flow_travel_time_sec: int
    incidents: list[StandardIncident] = field(default_factory=list)
    provider: str = "unknown"
    confidence_score: float = 1.0  # 0.0 to 1.0

class TrafficProvider(ABC):
    """
    Abstract base class for all traffic data providers.
    """
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"app.traffic.provider.{name}")

    @abstractmethod
    async def get_traffic_nearby(self, lat: float, lng: float, radius_m: int = 1000) -> list[StandardTrafficSegment]:
        """
        Fetch traffic segments and incidents near a coordinate.
        """
        pass

    @abstractmethod
    async def get_incidents_nearby(self, lat: float, lng: float, radius_m: int = 5000) -> list[StandardIncident]:
        """
        Fetch traffic incidents near a coordinate.
        """
        pass

    def calculate_density(self, speed: float, free_flow: float) -> TrafficDensity:
        """
        Calculate density based on speed ratio.
        """
        if free_flow <= 0:
            return TrafficDensity.UNKNOWN
        
        ratio = speed / free_flow
        if ratio >= 0.8:
            return TrafficDensity.LOW
        elif ratio >= 0.5:
            return TrafficDensity.MODERATE
        elif ratio >= 0.2:
            return TrafficDensity.HEAVY
        else:
            return TrafficDensity.STALLED
