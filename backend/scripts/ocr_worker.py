import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
import redis
import requests

# Ensure backend dir is in path
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.core.config import get_settings
from app.core.supabase import supabase_admin
from app.services.slip_verification import get_feature_from_sku, verify_slip_with_gcv


load_dotenv()
settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("vibecity-ocr-worker")


def get_redis() -> redis.Redis:
    if not settings.REDIS_URL:
        raise RuntimeError("Missing REDIS_URL")
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    r.ping()
    return r


def ensure_group(r: redis.Redis) -> None:
    try:
        r.xgroup_create(settings.OCR_QUEUE_STREAM, settings.OCR_QUEUE_GROUP, id="0", mkstream=True)
        logger.info("✅ OCR consumer group ready")
    except redis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_order(order_id: str):
    if not supabase_admin:
        raise RuntimeError("Supabase admin client not configured")
    res = (
        supabase_admin.table("orders")
        .select("*")
        .eq("id", order_id)
        .single()
        .execute()
    )
    return res.data


def update_order(order_id: str, status: str, metadata: dict):
    if not supabase_admin:
        raise RuntimeError("Supabase admin client not configured")
    supabase_admin.table("orders").update(
        {"status": status, "metadata": metadata, "updated_at": now_iso()}
    ).eq("id", order_id).execute()


def apply_entitlement(order: dict, feature: str, starts_at: datetime, ends_at: datetime):
    if not supabase_admin:
        raise RuntimeError("Supabase admin client not configured")
    supabase_admin.rpc(
        "apply_entitlement",
        {
            "p_user_id": None,
            "p_venue_id": order.get("venue_id"),
            "p_order_id": order.get("id"),
            "p_feature": feature,
            "p_starts_at": starts_at.isoformat(),
            "p_ends_at": ends_at.isoformat(),
        },
    ).execute()


def check_duplicate(image_hash: str, text_hash: str, order_id: str) -> str:
    if not supabase_admin:
        return ""
    duplicate_window_start = (
        datetime.now(timezone.utc)
        - timedelta(days=settings.SLIP_DUPLICATE_WINDOW_DAYS)
    ).isoformat()

    if image_hash:
        res = (
            supabase_admin.table("orders")
            .select("id")
            .contains("metadata", {"slip_image_hash": image_hash})
            .gte("created_at", duplicate_window_start)
            .neq("id", order_id)
            .limit(1)
            .execute()
        )
        if res.data:
            return "duplicate_slip"

    if text_hash:
        res = (
            supabase_admin.table("orders")
            .select("id")
            .contains("metadata", {"slip_text_hash": text_hash})
            .gte("created_at", duplicate_window_start)
            .neq("id", order_id)
            .limit(1)
            .execute()
        )
        if res.data:
            return "duplicate_slip"

    return ""


def process_order(order_id: str) -> None:
    order = fetch_order(order_id)
    if not order:
        logger.warning(f"Order not found: {order_id}")
        return

    if order.get("status") in ("paid", "rejected"):
        logger.info(f"Order already finalized: {order_id}")
        return

    slip_url = order.get("slip_url")
    amount = float(order.get("amount") or 0)
    sku = order.get("sku") or ""
    venue_id = order.get("venue_id")

    if not slip_url or amount <= 0:
        logger.warning(f"Missing slip/amount for order {order_id}")
        return

    verification = None
    try:
        verification = verify_slip_with_gcv(slip_url, amount)
    except Exception as e:
        verification = None
        logger.error(f"OCR failed for order {order_id}: {e}")

    manual_review_disabled = settings.SLIP_DISABLE_MANUAL_REVIEW
    final_status = order.get("status") or ("pending" if manual_review_disabled else "pending_review")
    verification_reason = ""
    entitlement_applied = False

    image_hash = verification.image_hash if verification else ""
    text_hash = verification.text_hash if verification else ""

    duplicate_reason = ""
    if verification and (image_hash or text_hash):
        duplicate_reason = check_duplicate(image_hash, text_hash, order_id)
        if duplicate_reason:
            verification.status = "rejected"
            verification.reason = duplicate_reason

    if verification and verification.status == "verified":
        feature = get_feature_from_sku(sku)
        starts_at = datetime.now(timezone.utc)
        ends_at = starts_at

        if "3d" in sku:
            ends_at = starts_at + timedelta(days=3)
        elif "7d" in sku or "weekly" in sku:
            ends_at = starts_at + timedelta(days=7)
        elif "monthly" in sku or "30d" in sku:
            ends_at = starts_at + timedelta(days=30)
        elif sku == "verified":
            ends_at = starts_at + timedelta(days=365)
        elif "lifetime" in sku:
            ends_at = starts_at + timedelta(days=365 * 99)
        else:
            ends_at = starts_at + timedelta(days=1)

        if venue_id:
            try:
                apply_entitlement(order, feature, starts_at, ends_at)
                entitlement_applied = True
            except Exception as e:
                verification.status = "error"
                verification.reason = f"entitlement_error: {e}"
        else:
            entitlement_applied = True

    if verification and verification.status == "verified" and entitlement_applied:
        final_status = "paid"
    elif verification and verification.status == "rejected":
        final_status = "rejected"
    elif manual_review_disabled:
        final_status = "rejected"
        verification_reason = (
            verification.reason if verification else "verification_error"
        )
    else:
        final_status = "pending_review"

    if verification:
        verification_reason = verification.reason or verification_reason

    verification_meta = {
        "provider": verification.provider if verification else "gcv",
        "status": verification.status if verification else "error",
        "reason": verification_reason or "ocr_failed",
        "checked_at": now_iso(),
        "amount": verification.data.get("amount") if verification else None,
        "trans_ref": verification.data.get("transRef") if verification else None,
        "trans_date": verification.data.get("transDate") if verification else None,
        "receiver": verification.data.get("receiver") if verification else None,
        "sender": verification.data.get("sender") if verification else None,
        "manual_review_disabled": manual_review_disabled,
        "score": verification.score if verification else 0,
        "signals": verification.signals if verification else {},
    }

    merged_metadata = order.get("metadata") or {}
    merged_metadata.update(
        {
            "slip_trans_ref": verification.data.get("transRef") if verification else None,
            "slip_image_hash": image_hash or None,
            "slip_text_hash": text_hash or None,
            "slip_ocr_raw": verification.ocr_text if (verification and settings.SLIP_STORE_OCR_RAW) else None,
            "slip_verification": verification_meta,
            "slip_decision": {
                "final_status": final_status,
                "auto_review": manual_review_disabled,
            },
            "pii_consent": True,
        }
    )

    update_order(order_id, final_status, merged_metadata)
    logger.info(f"✅ OCR processed order {order_id} -> {final_status}")

    if settings.DISCORD_WEBHOOK_URL:
        color = 5763719 if final_status == "paid" else 15548997 if final_status == "rejected" else 16763904
        try:
            requests.post(
                settings.DISCORD_WEBHOOK_URL,
                headers={"Content-Type": "application/json"},
                data=json.dumps(
                    {
                        "username": "VibeCity Order Bot",
                        "avatar_url": "https://vibecity.live/logo.png",
                        "embeds": [
                            {
                                "title": "🧾 Slip Verification Result",
                                "description": f"Order {order_id} → {final_status.upper()}",
                                "color": color,
                                "fields": [
                                    {
                                        "name": "✅ Verification",
                                        "value": f"{verification_meta['status']} ({verification_meta['reason']})",
                                        "inline": False,
                                    },
                                    {"name": "💸 Amount", "value": f"฿{amount:,.0f}", "inline": True},
                                ],
                                "timestamp": now_iso(),
                            }
                        ],
                    }
                ),
                timeout=5,
            )
        except Exception:
            pass


def run_worker() -> None:
    r = get_redis()
    ensure_group(r)
    logger.info("🎧 OCR worker listening...")

    while True:
        try:
            resp = r.xreadgroup(
                groupname=settings.OCR_QUEUE_GROUP,
                consumername=settings.OCR_QUEUE_CONSUMER,
                streams={settings.OCR_QUEUE_STREAM: ">"},
                count=5,
                block=5000,
            )
            if not resp:
                continue

            for _stream, messages in resp:
                for msg_id, fields in messages:
                    try:
                        payload_raw = fields.get("payload") or "{}"
                        payload = json.loads(payload_raw)
                        order_id = payload.get("order_id")
                        if not order_id:
                            raise RuntimeError("Missing order_id in OCR payload")
                        process_order(order_id)
                        r.xack(settings.OCR_QUEUE_STREAM, settings.OCR_QUEUE_GROUP, msg_id)
                    except Exception as ex:
                        logger.error(f"❌ OCR worker failed msg {msg_id}: {ex}")
                        try:
                            r.xadd(
                                f"dlq:{settings.OCR_QUEUE_STREAM}",
                                {"error": str(ex), "event": json.dumps(fields)},
                            )
                            r.xack(settings.OCR_QUEUE_STREAM, settings.OCR_QUEUE_GROUP, msg_id)
                        except Exception:
                            pass
        except Exception as loop_ex:
            logger.error(f"❌ OCR loop error: {loop_ex}")
            time.sleep(2)


if __name__ == "__main__":
    run_worker()
