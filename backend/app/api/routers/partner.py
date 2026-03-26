import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from app.core.supabase import supabase_admin
from app.core.visitor_auth import require_valid_visitor
from app.services.sheets_logger import sheets_logger

router = APIRouter()

PARTNER_PRIMARY_PLAN_CODE = "partner_program"
PARTNER_PRIMARY_SKU = "partner_program"
PARTNER_COMPAT_PLAN_CODES = {
    "partner_program",
    "partner_program_monthly",
    "partner_program_legacy",
    "partner_program_v1",
}
PARTNER_COMPAT_SKUS = {
    "partner_program",
    "partner_program_monthly",
    "partner_program_v1",
}


def _parse_dt(value: str | None) -> datetime | None:
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


def _normalize_partner_value(value: Any) -> str:
    return str(value or "").strip().lower()


def _matches_partner_value(value: Any, accepted: set[str]) -> bool:
    normalized = _normalize_partner_value(value)
    if not normalized:
        return False
    return normalized in accepted or "partner_program" in normalized


def _metadata_partner_value(row: dict[str, Any], key: str) -> Any:
    metadata = row.get("metadata")
    if isinstance(metadata, dict):
        return metadata.get(key)
    return None


def _is_partner_subscription(row: dict[str, Any]) -> bool:
    return _matches_partner_value(
        row.get("plan_code") or _metadata_partner_value(row, "plan_code"),
        PARTNER_COMPAT_PLAN_CODES,
    )


def _is_partner_order(row: dict[str, Any]) -> bool:
    candidate_values = [
        row.get("sku"),
        _metadata_partner_value(row, "sku"),
        _metadata_partner_value(row, "plan_code"),
    ]
    return any(_matches_partner_value(value, PARTNER_COMPAT_SKUS) for value in candidate_values)


async def _fetch_rows_by_visitor(
    table: str,
    select_expr: str,
    visitor_id: str,
    *,
    order_by: str,
    limit: int,
    cutoff_iso: str | None = None,
) -> list[dict[str, Any]]:
    if not supabase_admin:
        return []

    last_error: Exception | None = None
    query_succeeded = False
    for visitor_column in ("visitor_id", "visitor_id_uuid"):
        try:
            query = (
                supabase_admin.table(table)
                .select(select_expr)
                .eq(visitor_column, visitor_id)
                .order(order_by, desc=True)
                .limit(limit)
            )
            if cutoff_iso:
                query = query.gte("created_at", cutoff_iso)
            res = await asyncio.to_thread(query.execute)
            query_succeeded = True
            rows = list(res.data or [])
            if rows:
                return rows
        except Exception as exc:
            last_error = exc

    if last_error and not query_succeeded:
        raise last_error
    return []


async def _fetch_latest_subscription(visitor_id: str) -> dict[str, Any] | None:
    rows = await _fetch_rows_by_visitor(
        "subscriptions",
        "id,status,current_period_start,current_period_end,plan_code,metadata,created_at,updated_at",
        visitor_id,
        order_by="updated_at",
        limit=25,
    )
    for row in rows:
        if _is_partner_subscription(row):
            return row
    return None


async def _fetch_latest_partner_order(visitor_id: str) -> dict[str, Any] | None:
    rows = await _fetch_rows_by_visitor(
        "orders",
        "id,status,sku,metadata,created_at,updated_at",
        visitor_id,
        order_by="created_at",
        limit=25,
    )
    for row in rows:
        if _is_partner_order(row):
            return row
    return None


async def _fetch_partner_orders_90d(visitor_id: str) -> list[dict[str, Any]]:
    cutoff_iso = (datetime.now(tz=UTC) - timedelta(days=90)).isoformat()
    rows = await _fetch_rows_by_visitor(
        "orders",
        "id,status,amount,sku,metadata,created_at,updated_at",
        visitor_id,
        order_by="created_at",
        limit=80,
        cutoff_iso=cutoff_iso,
    )
    filtered = [row for row in rows if _is_partner_order(row)]
    return filtered[:12]


async def _resolve_partner_status(visitor_id: str) -> dict[str, Any]:
    now = datetime.now(tz=UTC)
    subscription = await _fetch_latest_subscription(visitor_id)

    if subscription:
        raw_status = str(subscription.get("status") or "inactive").lower()
        period_end_raw = subscription.get("current_period_end")
        period_end = _parse_dt(period_end_raw)

        has_access = raw_status in {"active", "trialing"} and (
            period_end is None or period_end > now
        )
        status = raw_status
        if raw_status == "active" and period_end and period_end <= now:
            has_access = False
            status = "expired"

        return {
            "has_access": has_access,
            "status": status,
            "current_period_end": period_end_raw,
        }

    latest_order = await _fetch_latest_partner_order(visitor_id)
    if latest_order:
        order_status = str(latest_order.get("status") or "").lower()
        if order_status in {"pending", "pending_review"}:
            return {"has_access": False, "status": "pending", "current_period_end": None}

    return {"has_access": False, "status": "inactive", "current_period_end": None}


async def _fetch_partner_profile(visitor_id: str) -> dict[str, Any] | None:
    if not supabase_admin:
        return None

    res = await asyncio.to_thread(
        lambda: supabase_admin.table("partners")
        .select("id,name,referral_code,status,metadata,created_at,updated_at,visitor_id")
        .eq("visitor_id", visitor_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = list(res.data or [])
    if rows:
        return rows[0]
    return None


def _sanitize_referral_code(value: Any) -> str | None:
    raw = str(value or "").strip().upper()
    if not raw:
        return None
    cleaned = "".join(ch for ch in raw if ch.isalnum() or ch in "_-")
    return cleaned[:24] or None


def _mask_sensitive(value: str | None) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    if len(text) <= 4:
        return "*" * len(text)
    return f"{'*' * (len(text) - 4)}{text[-4:]}"


def _clean_text(value: Any, *, upper: bool = False) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    return text.upper() if upper else text


async def _upsert_partner_bank_secret(
    partner_id: str,
    payload: dict[str, Any],
) -> None:
    if not supabase_admin:
        return

    now_iso = datetime.now(tz=UTC).isoformat()
    save_payload = {
        "partner_id": partner_id,
        "bank_code": _clean_text(payload.get("bank_code"), upper=True),
        "account_name": _clean_text(payload.get("account_name")),
        "account_number": _clean_text(payload.get("account_number")),
        "promptpay_id": _clean_text(payload.get("promptpay_id")),
        "bank_country": _clean_text(payload.get("bank_country"), upper=True),
        "currency": _clean_text(payload.get("currency"), upper=True),
        "swift_code": _clean_text(payload.get("swift_code"), upper=True),
        "iban": _clean_text(payload.get("iban"), upper=True),
        "routing_number": _clean_text(payload.get("routing_number")),
        "bank_name": _clean_text(payload.get("bank_name")),
        "branch_name": _clean_text(payload.get("branch_name")),
        "account_type": _clean_text(payload.get("account_type")),
        "updated_at": now_iso,
    }

    existing = await asyncio.to_thread(
        lambda: supabase_admin.table("partner_bank_secrets")
        .select("partner_id")
        .eq("partner_id", partner_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        await asyncio.to_thread(
            lambda: supabase_admin.table("partner_bank_secrets")
            .update(save_payload)
            .eq("partner_id", partner_id)
            .execute()
        )
        return

    save_payload["created_at"] = now_iso
    await asyncio.to_thread(
        lambda: supabase_admin.table("partner_bank_secrets")
        .insert(save_payload)
        .execute()
    )


class PartnerProfileRequest(BaseModel):
    visitor_id: str
    display_name: str | None = None
    referral_code: str | None = None


class PartnerBankRequest(BaseModel):
    visitor_id: str
    bank_code: str | None = None
    account_name: str | None = None
    account_number: str | None = None
    promptpay_id: str | None = None
    bank_country: str | None = None
    currency: str | None = None
    swift_code: str | None = None
    iban: str | None = None
    routing_number: str | None = None
    bank_name: str | None = None
    branch_name: str | None = None
    account_type: str | None = None


@router.get("/status")
async def get_partner_status(
    visitor_id: str = Query(...),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    if not supabase_admin:
        raise HTTPException(status_code=500, detail="Admin client not configured")
    normalized_visitor_id = require_valid_visitor(visitor_id, x_visitor_token)
    return await _resolve_partner_status(normalized_visitor_id)


@router.get("/dashboard")
async def get_partner_dashboard(
    visitor_id: str = Query(...),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    if not supabase_admin:
        raise HTTPException(status_code=500, detail="Admin client not configured")

    normalized_visitor_id = require_valid_visitor(visitor_id, x_visitor_token)
    status = await _resolve_partner_status(normalized_visitor_id)
    orders = await _fetch_partner_orders_90d(normalized_visitor_id)
    profile = await _fetch_partner_profile(normalized_visitor_id)

    verified_count = sum(
        1
        for row in orders
        if str(row.get("status") or "").lower() in {"verified", "paid"}
    )
    total_paid_thb = sum(
        float(row.get("amount") or 0)
        for row in orders
        if str(row.get("status") or "").lower() in {"verified", "paid"}
    )

    return {
        "status": status,
        "summary": {
            "total_orders": len(orders),
            "verified_orders": verified_count,
            "total_paid_thb": round(total_paid_thb, 2),
            "canonical_sku": PARTNER_PRIMARY_SKU,
            "canonical_plan_code": PARTNER_PRIMARY_PLAN_CODE,
        },
        "profile": profile,
        "orders": orders,
    }


@router.post("/profile")
async def upsert_partner_profile(
    body: PartnerProfileRequest,
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    if not supabase_admin:
        raise HTTPException(status_code=500, detail="Admin client not configured")

    normalized_visitor_id = require_valid_visitor(body.visitor_id, x_visitor_token)
    status = await _resolve_partner_status(normalized_visitor_id)
    if not status.get("has_access"):
        raise HTTPException(
            status_code=402,
            detail="Partner subscription is required before using profile actions",
        )

    display_name = str(body.display_name or "").strip() or "Vibe Partner"
    referral_code = _sanitize_referral_code(body.referral_code)

    existing = await _fetch_partner_profile(normalized_visitor_id)
    payload = {
        "name": display_name,
        "visitor_id": normalized_visitor_id,
        "status": str((existing or {}).get("status") or "active"),
    }
    if referral_code:
        payload["referral_code"] = referral_code

    try:
        if existing:
            res = await asyncio.to_thread(
                lambda: supabase_admin.table("partners")
                .update(payload)
                .eq("id", existing.get("id"))
                .select("id,name,referral_code,status,metadata,created_at,updated_at,visitor_id")
                .single()
                .execute()
            )
        else:
            res = await asyncio.to_thread(
                lambda: supabase_admin.table("partners")
                .insert(payload)
                .select("id,name,referral_code,status,metadata,created_at,updated_at,visitor_id")
                .single()
                .execute()
            )
    except Exception as exc:
        message = str(exc).lower()
        if "referral_code" in message and "duplicate" in message:
            raise HTTPException(status_code=409, detail="Referral code already in use")
        raise HTTPException(status_code=400, detail="Unable to save partner profile")

    profile_data = res.data or payload
    await sheets_logger.log_event(
        "partner_profile_saved",
        {
            "partner_id": profile_data.get("id"),
            "visitor_id": normalized_visitor_id,
            "display_name": display_name,
            "referral_code": profile_data.get("referral_code"),
            "status": profile_data.get("status"),
        },
        actor_id=normalized_visitor_id,
        visitor_id=normalized_visitor_id,
        channel="partner",
    )
    return profile_data


@router.post("/bank")
async def update_partner_bank(
    body: PartnerBankRequest,
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    if not supabase_admin:
        raise HTTPException(status_code=500, detail="Admin client not configured")

    normalized_visitor_id = require_valid_visitor(body.visitor_id, x_visitor_token)
    status = await _resolve_partner_status(normalized_visitor_id)
    if not status.get("has_access"):
        raise HTTPException(
            status_code=402,
            detail="Partner subscription is required before using payout actions",
        )

    partner = await _fetch_partner_profile(normalized_visitor_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner profile not found")

    metadata = partner.get("metadata") if isinstance(partner.get("metadata"), dict) else {}
    bank_payload = {
        "bank_code": _clean_text(body.bank_code, upper=True),
        "account_name": _clean_text(body.account_name),
        "account_number": _clean_text(body.account_number),
        "promptpay_id": _clean_text(body.promptpay_id),
        "bank_country": _clean_text(body.bank_country, upper=True),
        "currency": _clean_text(body.currency, upper=True),
        "swift_code": _clean_text(body.swift_code, upper=True),
        "iban": _clean_text(body.iban, upper=True),
        "routing_number": _clean_text(body.routing_number),
        "bank_name": _clean_text(body.bank_name),
        "branch_name": _clean_text(body.branch_name),
        "account_type": _clean_text(body.account_type),
    }
    now_iso = datetime.now(tz=UTC).isoformat()
    metadata["bank"] = {
        "bank_code": bank_payload["bank_code"],
        "account_name": bank_payload["account_name"],
        "account_number_masked": _mask_sensitive(bank_payload["account_number"]),
        "promptpay_masked": _mask_sensitive(bank_payload["promptpay_id"]),
        "bank_country": bank_payload["bank_country"],
        "currency": bank_payload["currency"],
        "swift_code_masked": _mask_sensitive(bank_payload["swift_code"]),
        "iban_masked": _mask_sensitive(bank_payload["iban"]),
        "routing_number_masked": _mask_sensitive(bank_payload["routing_number"]),
        "bank_name": bank_payload["bank_name"],
        "branch_name": bank_payload["branch_name"],
        "account_type": bank_payload["account_type"],
        "updated_at": now_iso,
    }

    try:
        await _upsert_partner_bank_secret(str(partner.get("id")), bank_payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to persist secure payout details")

    await asyncio.to_thread(
        lambda: supabase_admin.table("partners")
        .update({"metadata": metadata})
        .eq("id", partner.get("id"))
        .execute()
    )

    await sheets_logger.log_event(
        "partner_bank_saved",
        {
            "partner_id": partner.get("id"),
            "visitor_id": normalized_visitor_id,
            "bank_payload": bank_payload,
            "bank_masked": metadata.get("bank"),
        },
        actor_id=normalized_visitor_id,
        visitor_id=normalized_visitor_id,
        channel="partner",
    )

    return {"status": "ok", "message": "Bank details saved"}
