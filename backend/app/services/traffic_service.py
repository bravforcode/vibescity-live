"""
Traffic Service - Main entry point for real-time traffic density and incidents.
Integrates multiple providers via TrafficFusionService and handles merchant webhooks.
"""
import logging
from typing import Any

from .traffic.fusion import traffic_fusion_service
from .webhook_service import webhook_service

logger = logging.getLogger(__name__)

class TrafficService:
    """
    Traffic aggregation and estimation service.
    Refactored to use Provider/Adapter and Data Fusion architecture.
    """

    async def get_nearby_traffic(self, lat: float, lng: float, radius_m: int = 1000) -> list[dict[str, Any]]:
        """
        Fetch fused traffic segments from multiple sources (Google, TomTom, OSM).
        """
        return await traffic_fusion_service.get_fused_traffic(lat, lng, radius_m)

    async def subscribe_merchant_webhook(self, merchant_id: str, url: str, conditions: list[dict[str, Any]]):
        """
        Registers a merchant for real-time traffic webhooks.
        """
        return await webhook_service.subscribe(merchant_id, url, conditions)

    async def process_traffic_incident(self, event_type: str, payload: dict[str, Any]):
        """
        Internal handler for processing new traffic incidents and dispatching webhooks.
        """
        await webhook_service.dispatch_event(event_type, payload)

traffic_service = TrafficService()
