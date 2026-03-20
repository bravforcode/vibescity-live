from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field

from app.core.metrics import record_rum_beacon

logger = logging.getLogger("app.rum")

router = APIRouter(prefix="/rum", tags=["rum"])


class RumBeacon(BaseModel):
    session_id_hash: str = Field(min_length=6, max_length=256)
    region_code: str = Field(default="unknown", max_length=16)
    carrier: str = Field(default="unknown", max_length=64)
    device_tier: str = Field(default="unknown", max_length=16)
    display_refresh_hz: int | None = Field(default=None, ge=1, le=300)
    inp_ms: float | None = Field(default=None, ge=0)
    fcp_ms: float | None = Field(default=None, ge=0)
    lcp_ms: float | None = Field(default=None, ge=0)
    cls: float | None = Field(default=None, ge=0)
    fps_p50: float | None = Field(default=None, ge=0)
    fps_p95: float | None = Field(default=None, ge=0)
    touch_to_scroll_start_ms: float | None = Field(default=None, ge=0)
    bfcache_hit: bool | None = None
    prefetch_hit: bool | None = None
    loaf_ms_sampled: float | None = Field(default=None, ge=0)
    coalesced_pointer_events_per_frame: float | None = Field(default=None, ge=0)
    thermal_fps_drop_percent: float | None = Field(default=None, ge=0)
    battery_mode_active: bool | None = None
    connection_type: str | None = Field(default=None, max_length=32)
    route: str | None = Field(default=None, max_length=160)
    sign_first_paint_ms: float | None = Field(default=None, ge=0)
    neon_sprite_hit_ratio_v2: float | None = Field(default=None, ge=0, le=1)
    neon_fallback_rate_v2: float | None = Field(default=None, ge=0, le=1)
    neon_visible_count: int | None = Field(default=None, ge=0, le=5000)
    mini_dot_visible_count: int | None = Field(default=None, ge=0, le=5000)
    neon_event: str | None = Field(default=None, max_length=64)
    shop_id_hash: str | None = Field(default=None, max_length=128)
    zoom: float | None = Field(default=None, ge=0, le=24)
    lod: str | None = Field(default=None, max_length=24)
    viewport_bucket: str | None = Field(default=None, max_length=32)
    flag_version: str | None = Field(default=None, max_length=48)
    render_stage: str | None = Field(default=None, max_length=32)
    error_code: str | None = Field(default=None, max_length=48)
    reason: str | None = Field(default=None, max_length=48)
    zoom_expression_error_count: int | None = Field(default=None, ge=0, le=100)


class RumBeaconBatch(BaseModel):
    beacons: list[RumBeacon] = Field(default_factory=list, min_length=1, max_length=128)


def _serialize_beacon(beacon: RumBeacon) -> dict[str, Any]:
    return beacon.model_dump(mode="json", exclude_none=True)


@router.post("/beacon", status_code=status.HTTP_202_ACCEPTED)
async def ingest_rum_beacon(payload: RumBeaconBatch, request: Request):
    accepted = 0
    request_id = getattr(getattr(request, "state", None), "request_id", "")
    for beacon in payload.beacons:
        data = _serialize_beacon(beacon)
        record_rum_beacon(data)
        accepted += 1
        logger.info(
            "rum_beacon",
            extra={
                "request_id": request_id,
                "region_code": data.get("region_code", "unknown"),
                "carrier": data.get("carrier", "unknown"),
                "device_tier": data.get("device_tier", "unknown"),
                "has_inp": "inp_ms" in data,
                "has_lcp": "lcp_ms" in data,
                "has_touch_latency": "touch_to_scroll_start_ms" in data,
                "neon_event": data.get("neon_event"),
                "render_stage": data.get("render_stage"),
                "error_code": data.get("error_code"),
                "flag_version": data.get("flag_version"),
            },
        )
    return {"accepted": accepted}
