import asyncio
import hashlib
import json
import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import requests
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from postgrest import APIError
from pydantic import BaseModel, Field

from app.core.auth import verify_user
from app.core.concurrency import core_db_sem
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.resilience import retry_external_api
from app.core.supabase import supabase_admin
from app.services.ocr_queue import enqueue_ocr_job
from app.services.sheets_logger import sheets_logger
from app.services.slip_verification import get_feature_from_sku, verify_slip_with_gcv

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("app.payments")

stripe.api_key = settings.STRIPE_SECRET_KEY


def _schedule_payment_sheet_log(
    event_type: str,
    payload: dict[str, Any],
    *,
    actor_id: str | None = None,
    visitor_id: str | None = None,
) -> None:
    """Fire-and-forget sheets log from inside an async endpoint."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            sheets_logger.log_event(
                event_type,
                payload,
                actor_id=actor_id,
                visitor_id=visitor_id,
                channel="payments",
            )
        )
    except RuntimeError:
        # No running event loop — log warning and continue (never block payment flows)
        logger.warning("_schedule_payment_sheet_log: no running event loop, skipping %s", event_type)
    except TypeError as exc:
        logger.warning("payment_sheet_log_schedule_failed", extra={"event_type": event_type, "err": str(exc)})


def _is_duplicate_slip_error(exc: Exception) -> bool:
    lowered = str(exc).lower()
    return "duplicate key value" in lowered and "slip_url" in lowered


class CheckoutSessionRequest(BaseModel):
    itemType: str  # 'coin_package', 'verified', 'glow', 'boost', 'giant'
    itemId: str  # 'package_small', 'package_medium', or shopId for features
    successUrl: str
    cancelUrl: str


class BuyerProfile(BaseModel):
    full_name: str
    phone: str
    email: str
    address_line1: str
    address_line2: str | None = None
    country: str
    province: str
    district: str
    postal_code: str


class ManualOrderRequest(BaseModel):
    venue_id: str | None = None
    sku: str
    amount: float | None = Field(default=None, gt=0)
    slip_url: str
    visitor_id: str | None = None
    metadata: dict[str, Any] | None = None
    consent_personal_data: bool = False
    buyer_profile: BuyerProfile


async def get_product_price(sku: str) -> int:
    feature = get_feature_from_sku(sku)
    prices = {
        "verified": 19900,
        "glow": 9900,
        "boost": 4900,
        "giant": 29900,
    }
    return int(prices.get(feature, 19900))


async def _resolve_order_amount(sku: str, client_amount: float | None) -> float:
    satang = await get_product_price(sku)
    if satang and satang > 0:
        return round(float(satang) / 100.0, 2)
    if client_amount and client_amount > 0:
        return round(float(client_amount), 2)
    raise HTTPException(status_code=400, detail="Invalid amount")


def validate_redirect_url(url: str) -> str:
    """
    Prevent open redirects by allowlisting hostnames.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid redirect scheme")
    host = parsed.hostname or ""
    if host not in settings.ALLOWED_CHECKOUT_REDIRECT_HOSTS:
        raise HTTPException(status_code=400, detail="Invalid redirect host")
    return url


def _extract_ip(req: Request) -> str:
    forwarded = req.headers.get("x-forwarded-for") or ""
    real_ip = req.headers.get("x-real-ip") or ""
    candidate = forwarded or real_ip
    if not candidate:
        return ""
    return candidate.split(",")[0].strip()


def _hash_ip(ip: str) -> str:
    if not ip:
        return ""
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


async def _fetch_ip_info(ip: str) -> dict[str, Any] | None:
    """Non-blocking IP info lookup — runs sync requests in a thread."""
    if not ip or not settings.IPINFO_TOKEN:
        return None
    def _get() -> dict[str, Any] | None:
        try:
            resp = requests.get(
                f"https://ipinfo.io/{ip}/json?token={settings.IPINFO_TOKEN}",
                timeout=5,
            )
            if resp.status_code >= 400:
                return None
            return resp.json()
        except (requests.RequestException, ValueError) as exc:
            logger.info("ip_info_lookup_failed", extra={"ip": ip, "err": str(exc)})
            return None

    return await asyncio.to_thread(_get)


async def _send_discord(payload: dict[str, Any]) -> None:
    """Non-blocking Discord notification — runs sync requests in a thread."""
    if not settings.DISCORD_WEBHOOK_URL:
        return
    def _post() -> None:
        try:
            response = requests.post(
                settings.DISCORD_WEBHOOK_URL,
                headers={"Content-Type": "application/json"},
                data=json.dumps(payload),
                timeout=5,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("discord_webhook_failed", extra={"err": str(exc)})

    await asyncio.to_thread(_post)


@router.post("/create-checkout-session")
@limiter.limit("10/minute")
async def create_checkout_session(
    request: Request,
    body: CheckoutSessionRequest,
    user: dict = Depends(verify_user),
):
    user_id = None
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured")
    # 1. Define Products & Prices (In a real app, database backed)
    # For MVP, we map itemType to prices here.

    line_items = []
    mode = "payment"

    # Example Pricing (THB)
    PRICES = {
        # Features
        "verified": 19900,  # 199.00 THB
        "glow": 9900,  # 99.00 THB
        "boost": 4900,  # 49.00 THB
        "giant": 29900,  # 299.00 THB

        # Application features could also be subscriptions
    }

    price_amount = PRICES.get(body.itemType)
    if not price_amount:
        raise HTTPException(status_code=400, detail="Invalid item type")

    line_items.append(
        {
            "price_data": {
                "currency": "thb",
                "product_data": {
                    "name": f"VibeCity: {body.itemType.upper()}",
                },
                "unit_amount": price_amount,
            },
            "quantity": 1,
        }
    )

    # 2. metadata for Webhook
    user_id = user.get("id") if isinstance(user, dict) else getattr(user, "id", None)

    # C3: Deterministic idempotency key — prevents duplicate charges on retry
    ts_bucket = str(int(time.time()) // 3600)
    idempotency_key = str(
        uuid.uuid5(
            uuid.NAMESPACE_OID,
            f"{user_id}:{body.itemType}:{body.itemId}:{ts_bucket}",
        )
    )

    metadata = {
        "user_id": user_id,
        "item_type": body.itemType,
        "item_id": body.itemId,
        "idempotency_key": idempotency_key,  # Passed to webhook for order-level dedup
    }

    # specific metadata for webhook handler expectations
    if body.itemType in ["verified", "glow", "boost", "giant"]:
        # The existing webhook expects 'venue_id' and 'sku'
        metadata["venue_id"] = body.itemId
        metadata["sku"] = f"{body.itemType}_feature"

    try:
        @retry_external_api
        def create_stripe_session():
            return stripe.checkout.Session.create(
                payment_method_types=["card", "promptpay"],
                line_items=line_items,
                mode=mode,
                success_url=validate_redirect_url(body.successUrl),
                cancel_url=validate_redirect_url(body.cancelUrl),
                metadata=metadata,
                idempotency_key=idempotency_key,
            )
        
        session = create_stripe_session()
        _schedule_payment_sheet_log(
            "checkout_session_created",
            {
                "user_id": user_id,
                "item_type": body.itemType,
                "item_id": body.itemId,
                "payment_method_types": ["card", "promptpay"],
                "mode": mode,
                "idempotency_key": idempotency_key,
                "checkout_url": session.url,
            },
            actor_id=str(user_id) if user_id else None,
        )

        return {"url": session.url}
    except stripe.error.StripeError as e:
        logger.error(
            "stripe_checkout_error",
            extra={
                "err": str(e),
                "user_id": user_id,
                "item_type": body.itemType,
                "item_id": body.itemId,
            },
        )
        raise HTTPException(status_code=502, detail="Payment provider error") from e
    except (TypeError, ValueError) as e:
        logger.error(
            "checkout_error",
            extra={
                "err": str(e),
                "user_id": user_id,
                "item_type": body.itemType,
                "item_id": body.itemId,
            },
        )
        raise HTTPException(status_code=500, detail="Unable to create checkout session") from e


@router.post("/manual-order")
@limiter.limit("120/minute")
async def create_manual_order(request: Request, body: ManualOrderRequest):
    if not body.consent_personal_data:
        raise HTTPException(status_code=400, detail="Consent required")

    if not supabase_admin:
        raise HTTPException(status_code=500, detail="Admin client not configured")

    required_fields = [
        body.buyer_profile.full_name,
        body.buyer_profile.phone,
        body.buyer_profile.email,
        body.buyer_profile.address_line1,
        body.buyer_profile.country,
        body.buyer_profile.province,
        body.buyer_profile.district,
        body.buyer_profile.postal_code,
    ]
    if any(not value for value in required_fields):
        raise HTTPException(status_code=400, detail="Missing buyer_profile fields")

    amount = await _resolve_order_amount(body.sku, body.amount)
    ip_address = _extract_ip(request)
    ip_hash = _hash_ip(ip_address)
    ip_info = await _fetch_ip_info(ip_address)
    user_agent = request.headers.get("user-agent") or ""

    initial_status = "pending" if settings.SLIP_DISABLE_MANUAL_REVIEW else "pending_review"

    # C2: Idempotency — hash slip URL to detect duplicate submissions
    slip_hash_value = hashlib.sha256(body.slip_url.encode("utf-8")).hexdigest()

    # H1: Serialize concurrent payment DB writes through semaphore
    # Keep the critical section limited to DB operations.
    order_payload: dict[str, Any] = {
        "venue_id": body.venue_id,
        "visitor_id": body.visitor_id,
        "sku": body.sku,
        "amount": amount,
        "payment_method": "manual_transfer",
        "status": initial_status,
        "slip_url": body.slip_url,
        "slip_hash": slip_hash_value,
        "metadata": body.metadata or {},
    }

    async with core_db_sem:
        # C2: Check for existing order with same visitor + slip before insert
        if body.visitor_id:
            try:
                existing_res = (
                    supabase_admin.table("orders")
                    .select("id,status,created_at")
                    .eq("visitor_id", body.visitor_id)
                    .eq("slip_hash", slip_hash_value)
                    .limit(1)
                    .execute()
                )
                if existing_res.data:
                    existing = existing_res.data[0]
                    _schedule_payment_sheet_log(
                        "manual_order_duplicate",
                        {
                            "order_id": existing.get("id"),
                            "status": existing.get("status"),
                            "visitor_id": body.visitor_id,
                            "sku": body.sku,
                            "amount": amount,
                            "slip_hash": slip_hash_value,
                        },
                        actor_id=body.visitor_id,
                        visitor_id=body.visitor_id,
                    )
                    return {
                        "success": True,
                        "order": existing,
                        "duplicate": True,
                    }
            except APIError as e:
                logger.warning(
                    "manual_order_duplicate_check_failed",
                    extra={
                        "err": str(e),
                        "visitor_id": body.visitor_id,
                    },
                )

        try:
            order_res = (
                supabase_admin.table("orders").insert(order_payload).select("*").execute()
            )
            if not order_res.data:
                raise HTTPException(status_code=500, detail="Failed to create order")
            order = order_res.data[0]
        except Exception as e:
            if _is_duplicate_slip_error(e):
                existing_order = None
                try:
                    existing_res = (
                        supabase_admin.table("orders")
                        .select("*")
                        .eq("slip_url", body.slip_url)
                        .limit(1)
                        .execute()
                    )
                    if existing_res.data:
                        existing_order = existing_res.data[0]
                except APIError as lookup_exc:
                    logger.warning(
                        "manual_order_duplicate_lookup_failed",
                        extra={"err": str(lookup_exc), "slip_url": body.slip_url},
                    )
                    existing_order = None

                if existing_order:
                    existing_status = str(existing_order.get("status") or "").lower()
                    final_statuses = {
                        "verified",
                        "rejected",
                        "paid",
                        "failed",
                        "cancelled",
                        "refunded",
                    }
                    if existing_status in final_statuses:
                        return {
                            "success": True,
                            "order": existing_order,
                            "verification_status": existing_status,
                        }
                raise HTTPException(
                    status_code=409,
                    detail="This slip has already been submitted and is being processed",
                ) from e
            if not isinstance(e, APIError):
                raise
            logger.error(
                "manual_order_create_failed",
                extra={"err": str(e), "visitor_id": body.visitor_id, "venue_id": body.venue_id},
            )
            raise HTTPException(status_code=500, detail="Failed to create order") from e

    slip_audit_payload = {
        "order_id": order.get("id"),
        "user_id": order.get("user_id") or None,
        "visitor_id": body.visitor_id or None,
        "consent_personal_data": True,
        "buyer_full_name": body.buyer_profile.full_name,
        "buyer_phone": body.buyer_profile.phone,
        "buyer_email": body.buyer_profile.email,
        "buyer_address_line1": body.buyer_profile.address_line1,
        "buyer_address_line2": body.buyer_profile.address_line2 or None,
        "buyer_country": body.buyer_profile.country,
        "buyer_province": body.buyer_profile.province,
        "buyer_district": body.buyer_profile.district,
        "buyer_postal": body.buyer_profile.postal_code,
        "ip_address": ip_address or None,
        "ip_hash": ip_hash or None,
        "user_agent": user_agent or None,
        "geo_country": (ip_info or {}).get("country") or body.buyer_profile.country or None,
        "geo_region": (ip_info or {}).get("region") or body.buyer_profile.province or None,
        "geo_city": (ip_info or {}).get("city") or body.buyer_profile.district or None,
        "geo_postal": (ip_info or {}).get("postal") or body.buyer_profile.postal_code or None,
        "geo_timezone": (ip_info or {}).get("timezone") or None,
        "geo_loc": (ip_info or {}).get("loc") or None,
        "geo_org": (ip_info or {}).get("org") or None,
    }

    try:
        supabase_admin.table("slip_audit").insert(slip_audit_payload).execute()
    except APIError as exc:
        logger.warning("slip_audit_insert_failed", extra={"order_id": order.get("id"), "err": str(exc)})

    _schedule_payment_sheet_log(
        "manual_order_submitted",
        {
            "order_id": order.get("id"),
            "visitor_id": body.visitor_id,
            "venue_id": body.venue_id,
            "sku": body.sku,
            "amount": amount,
            "status": order.get("status"),
            "slip_url": body.slip_url,
            "metadata": body.metadata or {},
            "buyer_profile": body.buyer_profile.model_dump(),
            "ip_hash": ip_hash,
            "geo": {
                "country": (ip_info or {}).get("country"),
                "region": (ip_info or {}).get("region"),
                "city": (ip_info or {}).get("city"),
                "postal": (ip_info or {}).get("postal"),
            },
        },
        actor_id=body.visitor_id,
        visitor_id=body.visitor_id,
    )

    await _send_discord(
        {
            "username": "VibeCity Order Bot",
            "avatar_url": "https://vibecity.live/logo.png",
            "embeds": [
                {
                    "title": "💰 New Manual Payment Received!",
                    "description": "A new transfer has been submitted for verification.",
                    "color": 5814783,
                    "fields": [
                        {"name": "📦 Package", "value": body.sku.upper(), "inline": True},
                        {"name": "💸 Amount", "value": f"฿{amount:,.0f}", "inline": True},
                        {"name": "🏪 Venue ID", "value": f"{body.venue_id}", "inline": False},
                        {
                            "name": "🧾 Order Metadata",
                            "value": json.dumps(body.metadata) if body.metadata else "N/A",
                            "inline": False,
                        },
                    ],
                    "image": {"url": body.slip_url},
                }
            ],
        }
    )

    auto_verify = body.amount is None
    if auto_verify:
        verification = await verify_slip_with_gcv(body.slip_url, amount)
        verification_status = verification.status
        verification_reason = verification.reason

        if verification.image_hash:
            try:
                duplicate_res = (
                    supabase_admin.table("orders")
                    .select("id")
                    .eq("slip_image_hash", verification.image_hash)
                    .neq("id", order.get("id"))
                    .limit(1)
                    .execute()
                )
                if duplicate_res.data:
                    verification_status = "rejected"
                    verification_reason = "duplicate_slip"
            except APIError as exc:
                logger.warning(
                    "manual_order_duplicate_image_check_failed",
                    extra={"order_id": order.get("id"), "err": str(exc)},
                )

        update_payload = {
            "status": verification_status,
            "slip_provider": verification.provider,
            "slip_reason": verification_reason,
            "slip_image_hash": verification.image_hash or None,
            "slip_text_hash": verification.text_hash or None,
        }
        try:
            supabase_admin.table("orders").update(update_payload).eq(
                "id", order.get("id")
            ).execute()
            order.update(update_payload)
        except APIError as exc:
            logger.warning(
                "manual_order_auto_verify_update_failed",
                extra={"order_id": order.get("id"), "err": str(exc)},
            )

        ocr_enqueued = False
        if verification_status == "pending_review":
            try:
                enqueue_ocr_job(order.get("id"))
                ocr_enqueued = True
            except (RuntimeError, ValueError) as exc:
                logger.warning(
                    "manual_order_auto_verify_enqueue_failed",
                    extra={"order_id": order.get("id"), "err": str(exc)},
                )
                ocr_enqueued = False

        return {
            "success": True,
            "order": order,
            "verification_status": verification_status,
            "verification_reason": verification_reason,
            "ocr_enqueued": ocr_enqueued,
        }

    try:
        enqueue_ocr_job(order.get("id"))
        _schedule_payment_sheet_log(
            "manual_order_ocr_enqueued",
            {
                "order_id": order.get("id"),
                "status": order.get("status"),
                "visitor_id": body.visitor_id,
            },
            actor_id=body.visitor_id,
            visitor_id=body.visitor_id,
        )
        return {"success": True, "order": order, "ocr_enqueued": True}
    except (RuntimeError, ValueError) as e:
        # Do not fail the entire request after order creation.
        retry_token = str(uuid.uuid4())
        fallback_metadata = {**(order.get("metadata") or {})}
        fallback_metadata.update(
            {
                "ocr_enqueue_error": str(e),
                "ocr_retry_token": retry_token,
            }
        )
        try:
            supabase_admin.table("orders").update(
                {
                    "metadata": fallback_metadata,
                }
            ).eq("id", order.get("id")).execute()
            order["metadata"] = fallback_metadata
        except APIError as fallback_exc:
            # Best-effort fallback only.
            logger.warning(
                "manual_order_ocr_fallback_update_failed",
                extra={"order_id": order.get("id"), "err": str(fallback_exc)},
            )

        _schedule_payment_sheet_log(
            "manual_order_ocr_enqueue_failed",
            {
                "order_id": order.get("id"),
                "status": order.get("status"),
                "visitor_id": body.visitor_id,
                "retry_token": retry_token,
                "error": str(e),
            },
            actor_id=body.visitor_id,
            visitor_id=body.visitor_id,
        )

        return {
            "success": True,
            "order": order,
            "ocr_enqueued": False,
            "retryable": True,
            "retry_token": retry_token,
            "message": "Order created. OCR queue retry is pending.",
        }


# ---------------------------------------------------------------------------
# C1: Verified Stripe Webhook — ONLY entry point for payment state changes
# ---------------------------------------------------------------------------

async def _handle_checkout_completed(session: dict) -> None:
    """Mark order paid after signature-verified webhook.

    Important: Never mutate order state based only on metadata without additional
    validation. This handler must remain strict because `/webhook` is a public endpoint.
    """
    metadata = session.get("metadata") or {}
    order_id = metadata.get("order_id")
    session_id = session.get("id")
    payment_status = session.get("payment_status")
    idempotency_key = metadata.get("idempotency_key")

    if not order_id or not session_id or not supabase_admin:
        return

    # Only mark paid when Stripe says it's paid.
    if payment_status != "paid":
        logger.warning(
            "checkout_completed_not_paid",
            extra={"order_id": order_id, "session_id": session_id, "payment_status": payment_status},
        )
        return

    # Transaction-level idempotency: guard against double-click checkout edge cases.
    # Stripe-level dedup (event_id) already prevents duplicate events; this guards
    # the fulfillment state in case the same intent produces multiple sessions.
    if idempotency_key:
        try:
            already_fulfilled = (
                supabase_admin.table("orders")
                .select("id, status")
                .eq("idempotency_key", idempotency_key)
                .not_.in_("status", ["pending", "pending_review"])
                .limit(1)
                .execute()
            )
            if already_fulfilled.data:
                logger.info(
                    "checkout_already_fulfilled",
                    extra={"idempotency_key": idempotency_key, "order_id": order_id},
                )
                return
        except APIError as e:
            # Non-fatal: log and proceed (idempotency_key column may not exist yet)
            logger.warning("idempotency_check_failed", extra={"err": str(e)})

    try:
        # Only transition from pending-ish states to avoid replay/late events reopening flows.
        supabase_admin.table("orders").update(
            {"status": "paid", "stripe_session_id": session_id}
        ).eq("id", order_id).in_("status", ["pending", "pending_review"]).execute()
        await sheets_logger.log_event(
            "manual_order_status_updated",
            {
                "order_id": order_id,
                "status": "paid",
                "stripe_session_id": session_id,
                "source": "stripe_webhook_checkout_completed",
            },
            channel="payments",
        )
    except APIError as e:
        logger.error(
            "checkout_completed_handler_error",
            extra={"error": str(e), "order_id": order_id, "session_id": session_id},
        )


async def _handle_payment_intent_succeeded(pi: dict) -> None:
    logger.info("payment_intent_succeeded", extra={"pi_id": pi.get("id")})
    await sheets_logger.log_event(
        "payment_intent_succeeded",
        {
            "payment_intent_id": pi.get("id"),
            "amount": pi.get("amount"),
            "currency": pi.get("currency"),
            "status": pi.get("status"),
        },
        channel="payments",
    )


@router.post("/webhook")
@limiter.limit("30/minute")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature")

    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=settings.STRIPE_WEBHOOK_SECRET,
        )
    except stripe.error.SignatureVerificationError as exc:
        logger.warning("stripe_webhook_invalid_signature")
        raise HTTPException(status_code=400, detail="Invalid signature") from exc
    except ValueError as e:
        logger.error("stripe_webhook_parse_error", extra={"error": str(e)})
        raise HTTPException(status_code=400, detail="Bad payload") from e

    event_id = event.get("id", "")
    if not supabase_admin:
        raise HTTPException(status_code=500, detail="Admin client not configured")

    # Canonical idempotency store: stripe_webhook_events
    # Keep legacy stripe_events out of this flow to avoid split-brain dedupe state.
    try:
        existing = (
            supabase_admin.table("stripe_webhook_events")
            .select("id")
            .eq("stripe_event_id", event_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return {"received": True, "duplicate": True}

        supabase_admin.table("stripe_webhook_events").insert(
            {
                "stripe_event_id": event_id,
                "event_type": event.get("type"),
                "payload": event,
                "processed_at": None,
            }
        ).execute()
    except APIError as e:
        err = str(e).lower()
        if "duplicate key" in err or "23505" in err:
            return {"received": True, "duplicate": True}
        logger.error(
            "stripe_event_store_error",
            extra={"event_id": event_id, "err": str(e)},
        )
        raise HTTPException(status_code=500, detail="Event processing error") from e

    event_type = event.get("type")
    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(event.get("data", {}).get("object", {}))
    elif event_type == "payment_intent.succeeded":
        await _handle_payment_intent_succeeded(event.get("data", {}).get("object", {}))

    try:
        supabase_admin.table("stripe_webhook_events").update(
            {"processed_at": datetime.now(UTC).isoformat()}
        ).eq("stripe_event_id", event_id).execute()
    except APIError as e:
        logger.warning(
            "stripe_event_processed_mark_failed",
            extra={"event_id": event_id, "err": str(e)},
        )

    return {"received": True}
