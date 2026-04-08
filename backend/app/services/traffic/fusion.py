"""
Traffic Fusion Service - Merges traffic data from multiple sources.
Uses confidence scores and historical weighting for accuracy.
"""
import json
import logging
from datetime import UTC, datetime
from typing import Any

import anyio

from app.core.config import get_settings as get_app_settings
from app.services.cache import redis_client

from .base import StandardTrafficSegment, TrafficProvider
from .google import GoogleTrafficProvider
from .osm import OSMTrafficProvider
from .thai_gov import ThaiGovTrafficProvider
from .tomtom import TomTomTrafficProvider

logger = logging.getLogger("app.traffic.fusion")

class TrafficFusionService:
    """
    Service for merging and fusing traffic data from multiple providers.
    """
    
    def __init__(self):
        settings = get_app_settings()
        self.providers: list[TrafficProvider] = []
        
        # Configuration-based provider registration
        if settings.GOOGLE_MAPS_API_KEY:
            self.providers.append(GoogleTrafficProvider(settings.GOOGLE_MAPS_API_KEY))
        if settings.TOMTOM_API_KEY:
            self.providers.append(TomTomTrafficProvider(settings.TOMTOM_API_KEY))
            
        self.providers.append(OSMTrafficProvider()) # Community source (always active)
        self.providers.append(ThaiGovTrafficProvider()) # Public source (always active)
        
        self._cache_ttl = 180 # 3 minutes

    async def get_fused_traffic(self, lat: float, lng: float, radius_m: int = 1000) -> list[dict[str, Any]]:
        """
        Fetch, merge, and fuse traffic data from all active providers.
        """
        cache_key = f"traffic:fused:{round(lat, 4)}:{round(lng, 4)}:{radius_m}"
        redis_conn = redis_client.get_redis()
        
        cached = await anyio.to_thread.run_sync(lambda: redis_conn.get(cache_key))
        if cached:
            return json.loads(cached)

        # 1. Fetch from all providers in parallel
        async with anyio.create_task_group() as tg:
            results = []
            for provider in self.providers:
                tg.start_soon(self._fetch_and_append, provider, lat, lng, radius_m, results)
        
        # 2. Fuse the data
        fused_segments = self._fuse_segments(results)
        
        # 3. Store historical snapshot (asynchronously)
        anyio.from_thread.run_sync(self._store_historical, lat, lng, fused_segments)
        
        # 4. Convert to dict for API
        serialized = self._serialize_segments(fused_segments)
        
        # 5. Cache results
        await anyio.to_thread.run_sync(
            lambda: redis_conn.setex(cache_key, self._cache_ttl, json.dumps(serialized))
        )
        
        return serialized

    async def _fetch_and_append(self, provider: TrafficProvider, lat: float, lng: float, radius_m: int, results: list):
        try:
            segments = await provider.get_traffic_nearby(lat, lng, radius_m)
            results.extend(segments)
        except Exception as e:
            logger.error(f"Provider {provider.name} failed: {e}")

    def _fuse_segments(self, segments: list[StandardTrafficSegment]) -> list[StandardTrafficSegment]:
        """
        Simple fusion algorithm:
        - Group by way_id (if possible) or road name.
        - Calculate weighted average of speed based on provider confidence.
        """
        if not segments:
            return []
            
        grouped: dict[str, list[StandardTrafficSegment]] = {}
        for s in segments:
            key = s.way_id or s.name
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(s)
            
        fused = []
        for _key, group in grouped.items():
            if len(group) == 1:
                fused.append(group[0])
                continue
            
            # Weighted average speed
            total_weight = sum(s.confidence_score for s in group)
            weighted_speed = sum(s.speed_kmh * s.confidence_score for s in group) / total_weight
            
            # Use data from provider with highest confidence for other fields
            primary = max(group, key=lambda x: x.confidence_score)
            
            primary.speed_kmh = weighted_speed
            primary.density = primary.calculate_density(weighted_speed, primary.free_flow_speed_kmh)
            
            # Merge incidents
            all_incidents = []
            seen_incident_ids = set()
            for s in group:
                for inc in s.incidents:
                    if inc.id not in seen_incident_ids:
                        all_incidents.append(inc)
                        seen_incident_ids.add(inc.id)
            primary.incidents = all_incidents
            
            fused.append(primary)
            
        return fused

    def _store_historical(self, lat: float, lng: float, segments: list[StandardTrafficSegment]):
        """
        Stores historical traffic snapshots for trend analysis.
        Writes to 'traffic_history' table in Supabase.
        """
        import asyncio

        from app.core.supabase import supabase_admin as supabase

        if not segments:
            return

        try:
            records = [
                {
                    "way_id": s.way_id,
                    "name": s.name,
                    "lat": lat,
                    "lng": lng,
                    "speed_kmh": s.speed_kmh,
                    "density": s.density.value,
                    "confidence": s.confidence_score,
                    "provider": s.provider,
                    "created_at": datetime.now(UTC).isoformat()
                } for s in segments
            ]
            
            # Non-blocking fire-and-forget insertion
            asyncio.create_task(
                asyncio.to_thread(lambda: supabase.table("traffic_history").insert(records).execute())
            )
            
        except Exception as e:
            logger.error(f"Failed to store historical traffic: {e}")

    def _serialize_segments(self, segments: list[StandardTrafficSegment]) -> list[dict[str, Any]]:
        """Converts dataclass objects to dictionaries for JSON response."""
        return [
            {
                "way_id": s.way_id,
                "name": s.name,
                "density": s.density.value,
                "speed_kmh": round(s.speed_kmh, 2),
                "free_flow_speed_kmh": s.free_flow_speed_kmh,
                "travel_time_sec": s.current_travel_time_sec,
                "incidents": [
                    {
                        "id": inc.id,
                        "type": inc.type,
                        "description": inc.description,
                        "lat": inc.lat,
                        "lng": inc.lng,
                        "severity": inc.severity,
                        "provider": inc.provider,
                        "created_at": inc.created_at
                    } for inc in s.incidents
                ],
                "provider": s.provider,
                "confidence": round(s.confidence_score, 2)
            } for s in segments
        ]

traffic_fusion_service = TrafficFusionService()
