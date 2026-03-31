from __future__ import annotations

from typing import Any


def _to_str(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _to_float(value: Any) -> float:
    return float(value)


def _to_updated_at(value: Any) -> str | None:
    cleaned = _to_str(value)
    return cleaned or None


def normalize_record(obj: dict) -> dict:
    record = {
        "authority_id": _to_str(obj.get("authority_id")),
        "name": _to_str(obj.get("name")),
        "lat": _to_float(obj.get("lat")),
        "lng": _to_float(obj.get("lng")),
        "province": _to_str(obj.get("province")),
        "category": _to_str(obj.get("category")),
        "district": _to_str(obj.get("district")),
        "address": _to_str(obj.get("address")),
        "status": _to_str(obj.get("status")) or "active",
        "source": _to_str(obj.get("source")) or "manual",
        "source_ref": _to_str(obj.get("source_ref")),
        "updated_at": _to_updated_at(obj.get("updated_at")),
        "raw_payload": obj,
    }

    for field in ("authority_id", "name", "province", "category"):
        if not record[field]:
            raise ValueError(f"Missing required field: {field}")

    if not (-90 <= record["lat"] <= 90 and -180 <= record["lng"] <= 180):
        raise ValueError("Invalid lat/lng")

    return record
