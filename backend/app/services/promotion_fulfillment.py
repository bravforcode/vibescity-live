from __future__ import annotations

import asyncio
import copy
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.supabase import supabase_admin
from app.services.slip_verification import get_feature_from_sku

logger = logging.getLogger("app.promotion_fulfillment")

_DEFAULT_SIGN_TEMPLATE = "default-neon-v1"


def _now_utc() -> datetime:
    return datetime.now(tz=UTC)


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        return datetime.fromisoformat(text).astimezone(UTC)
    except Exception:
        return None


def _to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat()


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _safe_dict(value: Any) -> dict[str, Any]:
    return copy.deepcopy(value) if isinstance(value, dict) else {}


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = _safe_dict(base)
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def _max_iso(existing: Any, candidate: datetime | None) -> str | None:
    if candidate is None:
        return _to_iso(_parse_dt(existing))
    existing_dt = _parse_dt(existing)
    if existing_dt and existing_dt > candidate:
        return _to_iso(existing_dt)
    return _to_iso(candidate)


def normalize_pin_metadata(value: Any) -> dict[str, Any]:
    metadata = _safe_dict(value)
    metadata["schema_version"] = 2
    brand = metadata.get("brand")
    metadata["brand"] = brand if isinstance(brand, dict) else {}
    slot = metadata.get("slot")
    metadata["slot"] = slot if isinstance(slot, dict) else {}
    sign = metadata.get("sign")
    sign = sign if isinstance(sign, dict) else {}
    sign.setdefault("mode", "metadata")
    sign.setdefault("template", _DEFAULT_SIGN_TEMPLATE)
    metadata["sign"] = sign
    return metadata


def _metadata_patch_for_sku(
    sku: str,
    purchase_mode: str,
    *,
    sign_status: str,
) -> dict[str, Any]:
    lower = str(sku or "").strip().lower()
    patch: dict[str, Any] = {
        "schema_version": 2,
        "sign": {
            "mode": "metadata",
            "template": _DEFAULT_SIGN_TEMPLATE,
            "status": sign_status,
            "last_order_sku": lower,
            "purchase_mode": purchase_mode or "one_time",
            "updated_at": _to_iso(_now_utc()),
        },
    }
    if lower.startswith("video"):
        patch["products"] = {"video_enabled": True}
    elif lower.startswith("showcase"):
        patch["products"] = {"photo_showcase": True}
    elif lower.startswith("badge"):
        patch["products"] = {"category_badge": True}
    return patch


def _resolve_feature_specs(sku: str, purchase_mode: str) -> list[dict[str, Any]]:
    lower = str(sku or "").strip().lower()
    one_time = purchase_mode != "subscription"
    now = _now_utc()

    def feature(feature_name: str, *, days: int | None = None, hours: int | None = None):
        if days is not None:
            ends_at = now + timedelta(days=days)
        elif hours is not None:
            ends_at = now + timedelta(hours=hours)
        else:
            ends_at = None
        return {
            "kind": "entitlement",
            "feature": feature_name,
            "starts_at": now,
            "ends_at": ends_at,
        }

    if lower in {"verified", "verified_1y"}:
        return [feature("verified", days=365)]
    if lower in {"verified_life", "verified_lifetime", "verified_lifetime_1"}:
        return [feature("verified", days=365 * 99)]
    if lower == "glow_24h":
        return [feature("glow", hours=24)]
    if lower == "glow_7d":
        return [feature("glow", days=7)]
    if lower == "glow_30d":
        return [feature("glow", days=30)]
    if lower in {"boost", "boost_7d"}:
        return [feature("boost", days=7)]
    if lower == "boost_30d":
        return [feature("boost", days=30)]
    if lower in {"giant_feature", "giant_monthly"}:
        return [feature("giant", days=30)]
    if lower == "giant_weekly":
        return [feature("giant", days=7)]
    if lower == "vip_bundle":
        duration_days = 30 if one_time else 30
        return [
            feature("verified", days=duration_days),
            feature("glow", days=duration_days),
            feature("boost", days=duration_days),
            feature("giant", days=duration_days),
        ]
    inferred = get_feature_from_sku(lower)
    if inferred == "verified":
        return [feature("verified", days=365)]
    if inferred == "glow":
        return [feature("glow", days=7)]
    if inferred == "boost":
        return [feature("boost", days=7)]
    if inferred == "giant":
        return [feature("giant", days=30)]
    return []


async def _rpc_apply_entitlement(
    *,
    user_id: str | None,
    venue_id: str,
    order_id: str,
    feature: str,
    starts_at: datetime,
    ends_at: datetime | None,
) -> dict[str, Any]:
    if supabase_admin is None:
        raise RuntimeError("supabase admin unavailable")
    payload = {
        "p_user_id": user_id,
        "p_venue_id": venue_id,
        "p_order_id": order_id,
        "p_feature": feature,
        "p_starts_at": _to_iso(starts_at),
        "p_ends_at": _to_iso(ends_at),
    }
    response = await asyncio.to_thread(
        lambda: supabase_admin.rpc("apply_entitlement", payload).execute()
    )
    return response.data if isinstance(response.data, dict) else {"data": response.data}


async def _fetch_order(order_id: str) -> dict[str, Any]:
    if supabase_admin is None:
        raise RuntimeError("supabase admin unavailable")
    response = await asyncio.to_thread(
        lambda: supabase_admin.table("orders")
        .select(
            "id,user_id,visitor_id,venue_id,sku,status,amount,purchase_mode,metadata,created_at,updated_at"
        )
        .eq("id", order_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise RuntimeError(f"order not found: {order_id}")
    return rows[0]


async def _fetch_venue(venue_id: str) -> dict[str, Any]:
    if supabase_admin is None:
        raise RuntimeError("supabase admin unavailable")
    response = await asyncio.to_thread(
        lambda: supabase_admin.table("venues")
        .select(
            'id,pin_type,visibility_score,pin_metadata,verified_until,glow_until,boost_until,giant_until,image_urls,"Image_URL1",latitude,longitude,location'
        )
        .eq("id", venue_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise RuntimeError(f"venue not found: {venue_id}")
    return rows[0]


async def _update_venue_metadata(
    venue_id: str,
    existing: dict[str, Any],
    *,
    sku: str,
    purchase_mode: str,
    sign_status: str,
) -> dict[str, Any]:
    if supabase_admin is None:
        raise RuntimeError("supabase admin unavailable")
    metadata = normalize_pin_metadata(existing.get("pin_metadata"))
    patch = _metadata_patch_for_sku(sku, purchase_mode, sign_status=sign_status)
    merged = _deep_merge(metadata, patch)
    update_payload = {"pin_metadata": merged}
    response = await asyncio.to_thread(
        lambda: supabase_admin.table("venues")
        .update(update_payload)
        .eq("id", venue_id)
        .select("id,pin_metadata")
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else {"id": venue_id, "pin_metadata": merged}


async def _direct_feature_fallback(
    venue_id: str,
    venue: dict[str, Any],
    spec: dict[str, Any],
) -> dict[str, Any]:
    if supabase_admin is None:
        raise RuntimeError("supabase admin unavailable")
    feature = str(spec.get("feature") or "").strip().lower()
    ends_at = spec.get("ends_at")
    payload: dict[str, Any] = {}
    if feature == "verified":
        payload["verified_until"] = _max_iso(venue.get("verified_until"), ends_at)
    elif feature == "glow":
        payload["glow_until"] = _max_iso(venue.get("glow_until"), ends_at)
    elif feature == "boost":
        payload["boost_until"] = _max_iso(venue.get("boost_until"), ends_at)
        payload["visibility_score"] = max(_safe_int(venue.get("visibility_score"), 0), 100)
    elif feature == "giant":
        payload["giant_until"] = _max_iso(venue.get("giant_until"), ends_at)
        payload["pin_type"] = "giant"
        payload["visibility_score"] = max(_safe_int(venue.get("visibility_score"), 0), 120)
    if not payload:
        return {}
    response = await asyncio.to_thread(
        lambda: supabase_admin.table("venues")
        .update(payload)
        .eq("id", venue_id)
        .select("id,pin_type,visibility_score,verified_until,glow_until,boost_until,giant_until")
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else payload


async def apply_order_entitlements(order_id: str) -> dict[str, Any]:
    order = await _fetch_order(order_id)
    metadata = _safe_dict(order.get("metadata"))
    if metadata.get("entitlement_applied_at"):
        return {
            "status": "noop",
            "order_id": order_id,
            "reason": "already_applied",
            "features": metadata.get("entitlement_features") or [],
        }

    venue_id = str(order.get("venue_id") or "").strip()
    if not venue_id:
        return {
            "status": "noop",
            "order_id": order_id,
            "reason": "missing_venue_id",
            "features": [],
        }

    sku = str(order.get("sku") or "").strip().lower()
    purchase_mode = str(order.get("purchase_mode") or "one_time").strip().lower()
    specs = _resolve_feature_specs(sku, purchase_mode)
    venue = await _fetch_venue(venue_id)
    applied_features: list[str] = []
    rpc_failures: list[str] = []

    for spec in specs:
        feature = str(spec.get("feature") or "").strip().lower()
        if not feature:
            continue
        try:
            await _rpc_apply_entitlement(
                user_id=str(order.get("user_id") or "").strip() or None,
                venue_id=venue_id,
                order_id=order_id,
                feature=feature,
                starts_at=spec["starts_at"],
                ends_at=spec.get("ends_at"),
            )
        except Exception as exc:
            logger.warning(
                "apply_entitlement_rpc_failed",
                extra={"order_id": order_id, "venue_id": venue_id, "feature": feature, "err": str(exc)},
            )
            rpc_failures.append(feature)
            venue_update = await _direct_feature_fallback(venue_id, venue, spec)
            if venue_update:
                venue.update(venue_update)
        applied_features.append(feature)

    sign_status = "pending" if "giant" in applied_features else "ready"
    branding_result = await _update_venue_metadata(
        venue_id,
        venue,
        sku=sku,
        purchase_mode=purchase_mode,
        sign_status=sign_status,
    )

    order_metadata = _deep_merge(
        metadata,
        {
            "entitlement_applied_at": _to_iso(_now_utc()),
            "entitlement_features": applied_features,
            "entitlement_rpc_fallbacks": rpc_failures,
            "promotion_sync": {
                "order_id": order_id,
                "venue_id": venue_id,
                "sku": sku,
                "purchase_mode": purchase_mode,
                "sign_status": sign_status,
            },
        },
    )
    await asyncio.to_thread(
        lambda: supabase_admin.table("orders")
        .update({"metadata": order_metadata})
        .eq("id", order_id)
        .execute()
    )

    return {
        "status": "applied",
        "order_id": order_id,
        "venue_id": venue_id,
        "features": applied_features,
        "sign_status": sign_status,
        "metadata": branding_result.get("pin_metadata") if isinstance(branding_result, dict) else {},
    }
