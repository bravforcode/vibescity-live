from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
import hashlib
import json
import uuid
import stripe
import requests
from urllib.parse import urlparse
from app.core.config import get_settings
from app.core.auth import verify_user
from app.core.rate_limit import limiter
from app.core.supabase import supabase_admin
from app.services.ocr_queue import enqueue_ocr_job

router = APIRouter()
settings = get_settings()

stripe.api_key = settings.STRIPE_SECRET_KEY


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
    address_line2: Optional[str] = None
    country: str
    province: str
    district: str
    postal_code: str


class ManualOrderRequest(BaseModel):
    venue_id: Optional[str] = None
    sku: str
    amount: float = Field(..., gt=0)
    slip_url: str
    visitor_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    consent_personal_data: bool = False
    buyer_profile: BuyerProfile


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


def _fetch_ip_info(ip: str) -> Optional[Dict[str, Any]]:
    if not ip or not settings.IPINFO_TOKEN:
        return None
    try:
        resp = requests.get(
            f"https://ipinfo.io/{ip}/json?token={settings.IPINFO_TOKEN}",
            timeout=5,
        )
        if resp.status_code >= 400:
            return None
        return resp.json()
    except Exception:
        return None


def _send_discord(payload: Dict[str, Any]) -> None:
    if not settings.DISCORD_WEBHOOK_URL:
        return
    try:
        requests.post(
            settings.DISCORD_WEBHOOK_URL,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=5,
        )
    except Exception:
        pass


@router.post("/create-checkout-session")
@limiter.limit("10/minute")
async def create_checkout_session(
    request: Request,
    body: CheckoutSessionRequest,
    user: dict = Depends(verify_user),
):
    try:
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
        metadata = {
            "user_id": user_id,
            "item_type": body.itemType,
            "item_id": body.itemId,
        }

        # specific metadata for webhook handler expectations
        if body.itemType in ["verified", "glow", "boost", "giant"]:
            # The existing webhook expects 'venue_id' and 'sku'
            metadata["venue_id"] = body.itemId
            metadata["sku"] = f"{body.itemType}_feature"

        session = stripe.checkout.Session.create(
            payment_method_types=["card", "promptpay"],
            line_items=line_items,
            mode=mode,
            success_url=validate_redirect_url(body.successUrl),
            cancel_url=validate_redirect_url(body.cancelUrl),
            metadata=metadata,
        )

        return {"url": session.url}

    except stripe.error.StripeError as e:
        print(f"Stripe Error: {e}")
        raise HTTPException(status_code=502, detail="Payment provider error")
    except Exception as e:
        print(f"Stripe Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/manual-order")
@limiter.limit("10/minute")
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

    ip_address = _extract_ip(request)
    ip_hash = _hash_ip(ip_address)
    ip_info = _fetch_ip_info(ip_address)
    user_agent = request.headers.get("user-agent") or ""

    initial_status = "pending" if settings.SLIP_DISABLE_MANUAL_REVIEW else "pending_review"

    order_payload: Dict[str, Any] = {
        "venue_id": body.venue_id,
        "visitor_id": body.visitor_id,
        "sku": body.sku,
        "amount": body.amount,
        "payment_method": "manual_transfer",
        "status": initial_status,
        "slip_url": body.slip_url,
        "metadata": body.metadata or {},
    }

    try:
        order_res = (
            supabase_admin.table("orders").insert(order_payload).select("*").execute()
        )
        if not order_res.data:
            raise HTTPException(status_code=500, detail="Failed to create order")
        order = order_res.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    except Exception:
        pass

    _send_discord(
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
                        {"name": "💸 Amount", "value": f"฿{body.amount:,.0f}", "inline": True},
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

    try:
        enqueue_ocr_job(order.get("id"))
        return {"success": True, "order": order, "ocr_enqueued": True}
    except Exception as e:
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
        except Exception:
            # Best-effort fallback only.
            pass

        return {
            "success": True,
            "order": order,
            "ocr_enqueued": False,
            "retryable": True,
            "retry_token": retry_token,
            "message": "Order created. OCR queue retry is pending.",
        }
