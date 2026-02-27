from types import SimpleNamespace

import pytest

import app.services.sheets_logger as sheets_module


@pytest.mark.asyncio
async def test_sheets_logger_fail_open_on_network_error(monkeypatch):
    monkeypatch.setattr(sheets_module.settings, "SHEETS_LOGGER_ENABLED", True)
    monkeypatch.setattr(sheets_module.settings, "SHEETS_STRATEGY", "legacy_webhook")
    monkeypatch.setattr(
        sheets_module.settings, "SHEETS_WEBHOOK_EVENTS_URL", "https://example.com/events"
    )
    monkeypatch.setattr(sheets_module.settings, "SHEETS_WEBHOOK_SECRET", "")

    def _raise_post(*_args, **_kwargs):
        raise TimeoutError("network timeout")

    monkeypatch.setattr(sheets_module.requests, "post", _raise_post)

    ok = await sheets_module.sheets_logger.log_event(
        "manual_order_submitted",
        {"order_id": "ord-1", "account_number": "1234567890"},
        channel="events",
    )
    assert ok is False


@pytest.mark.asyncio
async def test_sheets_logger_redacts_sensitive_payload(monkeypatch):
    monkeypatch.setattr(sheets_module.settings, "SHEETS_LOGGER_ENABLED", True)
    monkeypatch.setattr(sheets_module.settings, "SHEETS_STRATEGY", "legacy_webhook")
    monkeypatch.setattr(
        sheets_module.settings, "SHEETS_WEBHOOK_EVENTS_URL", "https://example.com/events"
    )
    monkeypatch.setattr(sheets_module.settings, "SHEETS_WEBHOOK_SECRET", "secret")
    monkeypatch.setattr(sheets_module.settings, "SHEETS_LOGGER_TIMEOUT_MS", 500)

    captured = {}

    def _capture_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs.get("json", {})
        captured["headers"] = kwargs.get("headers", {})
        captured["timeout"] = kwargs.get("timeout")
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr(sheets_module.requests, "post", _capture_post)

    ok = await sheets_module.sheets_logger.log_event(
        "partner_bank_saved",
        {
            "account_number": "1234567890",
            "promptpay_id": "0891234567",
            "swift_code": "BKBKTHBK",
            "routing_number": "110000",
            "public_note": "ok",
        },
        channel="events",
        full_detail=False,
    )

    assert ok is True
    payload = captured["json"]["payload"]
    assert payload["account_number"].endswith("7890")
    assert payload["promptpay_id"].endswith("4567")
    assert payload["swift_code"].endswith("THBK")
    assert payload["routing_number"].endswith("0000")
    assert payload["public_note"] == "ok"
    assert captured["headers"]["X-Sheets-Secret"] == "secret"
