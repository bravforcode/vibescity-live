"""Neon sign V2 watchdog.

Watches rolling RUM-derived health signals and flips `kill_switch=true`
for `neon_sign_v2_enabled` when thresholds are violated.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from app.core.metrics import get_neon_watchdog_snapshot

logger = logging.getLogger(__name__)

FLAG_KEY = "neon_sign_v2_enabled"
INTERVAL_SECONDS = 60
WINDOW_SECONDS = 300
MIN_SAMPLE_COUNT = 20
MIN_SLI_SAMPLES = 20
WARNING_SLI_THRESHOLD = 0.9995  # 99.95%
CRITICAL_SLI_THRESHOLD = 0.999  # 99.9%
AUTO_KILL_SLI_THRESHOLD = 0.997  # 99.7%
FALLBACK_RATE_THRESHOLD = 0.05
SPRITE_FAIL_EVENT_THRESHOLD = 5


async def _load_flag():
    from app.core.supabase import supabase_admin

    if supabase_admin is None:
        return None
    try:
        response = await asyncio.to_thread(
            lambda: supabase_admin.table("feature_flags_public")
            .select("key,enabled,kill_switch,config")
            .eq("key", FLAG_KEY)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:
        logger.warning("neon_sign_watchdog: failed to load feature flag: %s", exc)
        return None


async def _set_kill_switch(reason: str, snapshot: dict[str, float]) -> None:
    from app.core.supabase import supabase_admin

    if supabase_admin is None:
        return

    flag = await _load_flag()
    if not flag:
        logger.warning("neon_sign_watchdog: feature flag row not found: %s", FLAG_KEY)
        return
    if bool(flag.get("kill_switch")):
        return

    now_iso = datetime.now(tz=UTC).isoformat()
    config = flag.get("config") if isinstance(flag.get("config"), dict) else {}
    next_config = {
        **config,
        "auto_kill_reason": reason,
        "auto_kill_at": now_iso,
        "auto_kill_window_seconds": int(snapshot.get("window_seconds", WINDOW_SECONDS)),
        "auto_kill_snapshot": {
            "sample_count": round(float(snapshot.get("sample_count", 0.0)), 4),
            "sli_value": round(float(snapshot.get("sli_value", 1.0)), 6),
            "sli_total": round(float(snapshot.get("sli_total", 0.0)), 4),
            "avg_hit_ratio": round(float(snapshot.get("avg_hit_ratio", 1.0)), 6),
            "avg_fallback_rate": round(float(snapshot.get("avg_fallback_rate", 0.0)), 6),
            "expression_error_count": round(
                float(snapshot.get("expression_error_count", 0.0)),
                4,
            ),
            "sprite_fail_events": round(
                float(snapshot.get("sprite_fail_events", 0.0)),
                4,
            ),
        },
    }

    try:
        await asyncio.to_thread(
            lambda: supabase_admin.table("feature_flags_public")
            .update({"kill_switch": True, "config": next_config})
            .eq("key", FLAG_KEY)
            .execute()
        )
        logger.error(
            "neon_sign_watchdog: kill switch enabled (reason=%s, sample_count=%s, sli=%s)",
            reason,
            snapshot.get("sample_count"),
            snapshot.get("sli_value"),
        )
    except Exception as exc:
        logger.warning("neon_sign_watchdog: failed to flip kill switch: %s", exc)


def _derive_kill_reason(snapshot: dict[str, float]) -> str | None:
    expression_errors = float(snapshot.get("expression_error_count", 0.0))
    if expression_errors > 0:
        return "zoom_expression_error"

    sample_count = float(snapshot.get("sample_count", 0.0))
    if sample_count < MIN_SAMPLE_COUNT:
        return None

    sli_total = float(snapshot.get("sli_total", 0.0))
    sli_value = float(snapshot.get("sli_value", 1.0))
    if sli_total >= MIN_SLI_SAMPLES and sli_value < AUTO_KILL_SLI_THRESHOLD:
        return "slo_breach"

    avg_fallback_rate = float(snapshot.get("avg_fallback_rate", 0.0))
    if avg_fallback_rate > FALLBACK_RATE_THRESHOLD:
        return "fallback_rate_spike"

    sprite_fail_events = float(snapshot.get("sprite_fail_events", 0.0))
    if sprite_fail_events >= SPRITE_FAIL_EVENT_THRESHOLD:
        return "render_fail_spike"

    return None


async def run_once() -> None:
    snapshot = get_neon_watchdog_snapshot(window_seconds=WINDOW_SECONDS)
    sample_count = float(snapshot.get("sample_count", 0.0))
    sli_total = float(snapshot.get("sli_total", 0.0))
    sli_value = float(snapshot.get("sli_value", 1.0))
    if sample_count >= MIN_SAMPLE_COUNT and sli_total >= MIN_SLI_SAMPLES:
        if sli_value < CRITICAL_SLI_THRESHOLD:
            logger.error(
                "neon_sign_watchdog: critical SLI drop detected (sli=%.6f, samples=%.0f)",
                sli_value,
                sli_total,
            )
        elif sli_value < WARNING_SLI_THRESHOLD:
            logger.warning(
                "neon_sign_watchdog: warning SLI drop detected (sli=%.6f, samples=%.0f)",
                sli_value,
                sli_total,
            )
    reason = _derive_kill_reason(snapshot)
    if not reason:
        return
    await _set_kill_switch(reason, snapshot)


async def run_forever() -> None:
    while True:
        try:
            await run_once()
        except Exception as exc:
            logger.warning("neon_sign_watchdog: unexpected error: %s", exc)
        await asyncio.sleep(INTERVAL_SECONDS)
