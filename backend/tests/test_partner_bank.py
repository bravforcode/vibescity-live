from types import SimpleNamespace
from unittest.mock import AsyncMock

import app.api.routers.partner as partner_router


def test_partner_bank_accepts_extended_payload_and_logs(client, monkeypatch):
    updates = []
    captured_secret = {}

    class _FakeQuery:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self._payload = None
            self._filters = {}

        def update(self, payload):
            self._payload = payload
            return self

        def eq(self, key, value):
            self._filters[key] = value
            return self

        def execute(self):
            if self.table_name == "partners":
                updates.append(
                    {
                        "payload": self._payload,
                        "filters": self._filters,
                    }
                )
            return SimpleNamespace(data=[self._payload], count=None)

    class _FakeSupabase:
        def table(self, table_name):
            return _FakeQuery(table_name)

    async def _fake_status(_visitor_id):
        return {
            "has_access": True,
            "status": "active",
            "current_period_end": None,
        }

    async def _fake_profile(_visitor_id):
        return {
            "id": "partner-1",
            "metadata": {},
        }

    async def _fake_upsert_secret(partner_id, payload):
        captured_secret["partner_id"] = partner_id
        captured_secret["payload"] = payload

    sheet_log_mock = AsyncMock(return_value=True)

    monkeypatch.setattr(partner_router, "supabase_admin", _FakeSupabase())
    monkeypatch.setattr(partner_router, "require_valid_visitor", lambda v, _t: v)
    monkeypatch.setattr(partner_router, "_resolve_partner_status", _fake_status)
    monkeypatch.setattr(partner_router, "_fetch_partner_profile", _fake_profile)
    monkeypatch.setattr(partner_router, "_upsert_partner_bank_secret", _fake_upsert_secret)
    monkeypatch.setattr(partner_router.sheets_logger, "log_event", sheet_log_mock)

    payload = {
        "visitor_id": "58f7821e-c3c6-45e0-8193-cf093a8110b7",
        "bank_code": "kbank",
        "account_name": "VibeCity Partner",
        "account_number": "123456789012",
        "promptpay_id": "0891234567",
        "bank_country": "th",
        "currency": "thb",
        "swift_code": "bkbkthbk",
        "iban": "th89xxxx",
        "routing_number": "110000",
        "bank_name": "Kasikornbank",
        "branch_name": "Siam",
        "account_type": "savings",
    }
    response = client.post("/api/v1/partner/bank", json=payload)

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    assert captured_secret["partner_id"] == "partner-1"
    assert captured_secret["payload"]["bank_code"] == "KBANK"
    assert captured_secret["payload"]["bank_country"] == "TH"
    assert captured_secret["payload"]["currency"] == "THB"
    assert captured_secret["payload"]["swift_code"] == "BKBKTHBK"
    assert captured_secret["payload"]["iban"] == "TH89XXXX"

    assert len(updates) == 1
    bank_meta = updates[0]["payload"]["metadata"]["bank"]
    assert bank_meta["account_number_masked"].endswith("9012")
    assert bank_meta["promptpay_masked"].endswith("4567")
    assert bank_meta["swift_code_masked"].endswith("THBK")
    assert bank_meta["iban_masked"].endswith("XXXX")
    assert bank_meta["routing_number_masked"].endswith("0000")

    assert sheet_log_mock.await_count == 1
