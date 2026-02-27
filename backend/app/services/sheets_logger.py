import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import requests

from app.core.config import get_settings

logger = logging.getLogger("app.sheets_logger")
settings = get_settings()


def _utc_now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def _resolve_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    return payload if isinstance(payload, dict) else {}


def _redact_sensitive(payload: dict[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    sensitive_keys = {
        "account_number",
        "promptpay_id",
        "swift_code",
        "iban",
        "routing_number",
        "bank_account",
    }
    for key, value in payload.items():
        if key in sensitive_keys and value:
            text = str(value)
            redacted[key] = f"{'*' * max(0, len(text) - 4)}{text[-4:]}"
        else:
            redacted[key] = value
    return redacted


class SheetsLogger:
    def _resolve_url(self, channel: str) -> str:
        if channel == "partner":
            return settings.SHEETS_WEBHOOK_PARTNER_URL or settings.SHEETS_WEBHOOK_EVENTS_URL
        if channel == "payments":
            return settings.SHEETS_WEBHOOK_PAYMENTS_URL or settings.SHEETS_WEBHOOK_EVENTS_URL
        return settings.SHEETS_WEBHOOK_EVENTS_URL

    async def log_event(
        self,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        actor_id: str | None = None,
        visitor_id: str | None = None,
        channel: str = "events",
        full_detail: bool | None = None,
    ) -> bool:
        if not settings.SHEETS_LOGGER_ENABLED:
            return False

        # Single source-of-truth mode: use DB -> admin-sheet-sync only.
        # Keep legacy webhook mode available for emergency fallback.
        if str(getattr(settings, "SHEETS_STRATEGY", "db_sync")).strip().lower() != "legacy_webhook":
            return False

        url = self._resolve_url(channel)
        if not url:
            return False

        include_full = (
            settings.SHEETS_LOGGER_FULL_DETAIL
            if full_detail is None
            else bool(full_detail)
        )
        normalized_payload = _resolve_payload(payload)
        request_payload = {
            "event_type": event_type,
            "timestamp": _utc_now_iso(),
            "actor_id": actor_id or "",
            "visitor_id": visitor_id or "",
            "channel": channel,
            "payload": normalized_payload if include_full else _redact_sensitive(normalized_payload),
        }
        headers = {"Content-Type": "application/json"}
        if settings.SHEETS_WEBHOOK_SECRET:
            headers["X-Sheets-Secret"] = settings.SHEETS_WEBHOOK_SECRET

        timeout_s = max(0.3, min(settings.SHEETS_LOGGER_TIMEOUT_MS / 1000.0, 8.0))

        try:
            await asyncio.to_thread(
                requests.post,
                url,
                json=request_payload,
                headers=headers,
                timeout=timeout_s,
            )
            return True
        except Exception as exc:
            # fail-open: do not propagate errors to business flows
            logger.warning("sheets_logger_failed: %s", str(exc))
            return False


sheets_logger = SheetsLogger()
