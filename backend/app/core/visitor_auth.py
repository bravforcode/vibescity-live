import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

_DEV_FALLBACK_SECRET = "dev-insecure-visitor-secret-change-me"


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _base64url_decode(raw: str) -> bytes:
    padding = "=" * ((4 - (len(raw) % 4)) % 4)
    return base64.urlsafe_b64decode(f"{raw}{padding}")


def _get_signing_secret() -> bytes:
    configured = (settings.VISITOR_SIGNING_SECRET or "").strip()
    if configured:
        return configured.encode("utf-8")
    if settings.ENV.lower() == "production":
        raise RuntimeError("VISITOR_SIGNING_SECRET is required in production")
    logger.warning(
        "VISITOR_SIGNING_SECRET is missing; using development fallback secret"
    )
    return _DEV_FALLBACK_SECRET.encode("utf-8")


def normalize_visitor_id(visitor_id: str) -> str:
    try:
        return str(UUID(str(visitor_id).strip()))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visitor_id must be a valid UUID",
        ) from exc


def issue_visitor_token(visitor_id: str, ttl_seconds: int | None = None) -> tuple[str, dict]:
    now = int(time.time())
    ttl = int(ttl_seconds or settings.VISITOR_TOKEN_TTL_SECONDS or 604800)
    payload = {
        "vid": visitor_id,
        "iat": now,
        "exp": now + max(ttl, 60),
        "v": 1,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    payload_part = _base64url_encode(payload_bytes)
    signature = hmac.new(
        _get_signing_secret(),
        payload_part.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    token = f"{payload_part}.{_base64url_encode(signature)}"
    return token, payload


def get_token_payload(token: str) -> dict | None:
    if not token or "." not in token:
        return None
    try:
        payload_part, _signature_part = token.split(".", 1)
        payload_raw = _base64url_decode(payload_part)
        payload = json.loads(payload_raw.decode("utf-8"))
        if not isinstance(payload, dict):
            return None
        return payload
    except Exception:
        return None


def verify_visitor_token(visitor_id: str, token: str) -> bool:
    if not token or "." not in token:
        return False

    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError:
        return False

    expected_signature = _base64url_encode(
        hmac.new(
            _get_signing_secret(),
            payload_part.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    )
    if not hmac.compare_digest(signature_part, expected_signature):
        return False

    payload = get_token_payload(token)
    if not payload:
        return False

    token_visitor_id = str(payload.get("vid") or "").strip().lower()
    if token_visitor_id != visitor_id.strip().lower():
        return False

    now = int(time.time())
    exp = int(payload.get("exp") or 0)
    if exp <= now:
        return False

    return True


def require_valid_visitor(visitor_id: str, token: str | None) -> str:
    normalized = normalize_visitor_id(visitor_id)
    if not verify_visitor_token(normalized, token or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired visitor token",
        )
    return normalized


def payload_expiry_iso(payload: dict) -> str:
    exp = int(payload.get("exp") or 0)
    return datetime.fromtimestamp(exp, tz=UTC).isoformat()
