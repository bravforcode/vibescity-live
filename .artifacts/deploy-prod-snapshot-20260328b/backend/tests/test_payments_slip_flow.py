"""
Tests for the manual-order slip verification integration.

All tests are offline: external calls (requests.get/post, GCV, Supabase)
are mocked or guarded.
"""

import hashlib
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import verify_user
from app.main import app
from app.services.slip_verification import SlipVerification

# ---------------------------------------------------------------------------
# Network guard — any real HTTP call raises immediately
# ---------------------------------------------------------------------------

def _network_guard(*a, **kw):
    raise AssertionError("Network call attempted in offline test")


@pytest.fixture(autouse=True)
def block_network(monkeypatch):
    import requests as _req
    monkeypatch.setattr(_req, "get", _network_guard)
    monkeypatch.setattr(_req, "post", _network_guard)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FAKE_USER = SimpleNamespace(id="user-aaa", app_metadata={})

VALID_BUYER = {
    "full_name": "Test User",
    "phone": "0800000000",
    "email": "test@example.com",
    "address_line1": "123 St",
    "country": "TH",
    "province": "Bangkok",
    "district": "Sathorn",
    "postal_code": "10120",
}

IMG_HASH = hashlib.sha256(b"fake-image").hexdigest()
TEXT_HASH = hashlib.sha256(b"normalized text").hexdigest()

ORDER_COUNTER = {"n": 0}


def _make_order_id():
    ORDER_COUNTER["n"] += 1
    return f"order-{ORDER_COUNTER['n']:04d}"


def _build_body(sku="verified", slip_url="https://example.com/slip.jpg", **extra):
    base = {
        "venue_id": "venue-1",
        "sku": sku,
        "slip_url": slip_url,
        "consent_personal_data": True,
        "buyer_profile": VALID_BUYER,
    }
    base.update(extra)
    return base


def _mock_verification(status="verified", reason="verified",
                       image_hash=IMG_HASH, text_hash=TEXT_HASH):
    return SlipVerification(
        status=status, reason=reason, provider="gcv", data={},
        score=0.0, signals={}, image_hash=image_hash,
        text_hash=text_hash, ocr_text="mock text",
    )


class FakeSupabaseChain:
    """Chainable mock that distinguishes insert-select from dup-check-select.

    The duplicate check path is: .select("id").eq("slip_image_hash",...).neq(...).limit(1)
    The insert path is:          .insert(...).select("*")
    We track state via _is_dup_query to return empty for dup checks by default.
    """

    def __init__(self, order_data, dup_data=None):
        self._order_data = order_data  # returned by insert().select("*").execute()
        self._dup_data = dup_data or []  # returned by the duplicate check
        self._is_dup_query = False
        self._update_payloads = []
        self._insert_payloads = []

    def table(self, _name):
        # Return a fresh chain copy to avoid state leakage between calls
        clone = FakeSupabaseChain(self._order_data, self._dup_data)
        clone._update_payloads = self._update_payloads
        clone._insert_payloads = self._insert_payloads
        return clone

    def insert(self, payload):
        self._insert_payloads.append(payload)
        self._is_dup_query = False
        return self

    def select(self, *args):
        if args and args[0] == "id":
            self._is_dup_query = True
        return self

    def update(self, payload):
        self._update_payloads.append(payload)
        return self

    def eq(self, _col, _val):
        return self

    def neq(self, _col, _val):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        if self._is_dup_query:
            return SimpleNamespace(data=self._dup_data)
        return SimpleNamespace(data=self._order_data)


@pytest.fixture()
def client():
    return TestClient(app)


def _post_manual_order(client, body, user=FAKE_USER):
    app.dependency_overrides[verify_user] = lambda: user
    return client.post("/api/v1/payments/manual-order", json=body)


# ---------------------------------------------------------------------------
# T1) Server price wins — client amount is ignored
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.enqueue_ocr_job")
@patch("app.api.routers.payments.verify_slip_with_gcv", new_callable=AsyncMock)
@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._send_discord")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
@patch("app.api.routers.payments.get_product_price", new_callable=AsyncMock, return_value=19900)
def test_server_price_wins(_price, _ip, _discord, mock_supa, mock_verify, _ocr, client):
    oid = _make_order_id()
    mock_verify.return_value = _mock_verification()

    chain = FakeSupabaseChain(
        order_data=[{"id": oid, "metadata": {}, "status": "pending", "amount": 199.0}],
    )
    mock_supa.table = chain.table

    body = _build_body(sku="verified", metadata={"client_amount": 999})
    resp = _post_manual_order(client, body)

    assert resp.status_code == 200
    # Server price for "verified" = 19900 satang = 199.0 baht
    assert chain._insert_payloads[0]["amount"] == 199.0


# ---------------------------------------------------------------------------
# T2) Verified slip => order becomes verified
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.enqueue_ocr_job")
@patch("app.api.routers.payments.verify_slip_with_gcv", new_callable=AsyncMock)
@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._send_discord")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
@patch("app.api.routers.payments.get_product_price", new_callable=AsyncMock, return_value=19900)
def test_verified_slip_sets_verified(_price, _ip, _discord, mock_supa, mock_verify, _ocr, client):
    oid = _make_order_id()
    mock_verify.return_value = _mock_verification(status="verified", reason="verified")

    chain = FakeSupabaseChain(
        order_data=[{"id": oid, "metadata": {}, "status": "pending"}],
    )
    mock_supa.table = chain.table

    resp = _post_manual_order(client, _build_body())
    assert resp.status_code == 200
    assert resp.json()["verification_status"] == "verified"
    assert any(p.get("status") == "verified" for p in chain._update_payloads)


# ---------------------------------------------------------------------------
# T3) Pending_review slip => order becomes pending_review
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.enqueue_ocr_job")
@patch("app.api.routers.payments.verify_slip_with_gcv", new_callable=AsyncMock)
@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._send_discord")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
@patch("app.api.routers.payments.get_product_price", new_callable=AsyncMock, return_value=19900)
def test_pending_review_slip(_price, _ip, _discord, mock_supa, mock_verify, mock_ocr, client):
    oid = _make_order_id()
    mock_verify.return_value = _mock_verification(status="pending_review", reason="amount_missing")

    chain = FakeSupabaseChain(
        order_data=[{"id": oid, "metadata": {}, "status": "pending"}],
    )
    mock_supa.table = chain.table

    resp = _post_manual_order(client, _build_body())
    assert resp.status_code == 200
    assert resp.json()["verification_status"] == "pending_review"
    mock_ocr.assert_called_once()


# ---------------------------------------------------------------------------
# T4) Rejected slip => order becomes rejected with reason
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.enqueue_ocr_job")
@patch("app.api.routers.payments.verify_slip_with_gcv", new_callable=AsyncMock)
@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._send_discord")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
@patch("app.api.routers.payments.get_product_price", new_callable=AsyncMock, return_value=19900)
def test_rejected_slip_amount_mismatch(_price, _ip, _discord, mock_supa, mock_verify, mock_ocr, client):
    oid = _make_order_id()
    mock_verify.return_value = _mock_verification(status="rejected", reason="amount_mismatch")

    chain = FakeSupabaseChain(
        order_data=[{"id": oid, "metadata": {}, "status": "pending"}],
    )
    mock_supa.table = chain.table

    resp = _post_manual_order(client, _build_body())
    assert resp.status_code == 200
    data = resp.json()
    assert data["verification_status"] == "rejected"
    assert data["verification_reason"] == "amount_mismatch"
    mock_ocr.assert_not_called()


# ---------------------------------------------------------------------------
# T5) Duplicate slip => reject with reason duplicate_slip
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.enqueue_ocr_job")
@patch("app.api.routers.payments.verify_slip_with_gcv", new_callable=AsyncMock)
@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._send_discord")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
@patch("app.api.routers.payments.get_product_price", new_callable=AsyncMock, return_value=19900)
def test_duplicate_slip_rejected(_price, _ip, _discord, mock_supa, mock_verify, mock_ocr, client):
    oid = _make_order_id()
    mock_verify.return_value = _mock_verification(status="verified", reason="verified")

    chain = FakeSupabaseChain(
        order_data=[{"id": oid, "metadata": {}, "status": "pending"}],
        dup_data=[{"id": "other-order"}],  # simulate existing order with same hash
    )
    mock_supa.table = chain.table

    resp = _post_manual_order(client, _build_body())
    assert resp.status_code == 200
    data = resp.json()
    assert data["verification_status"] == "rejected"
    assert data["verification_reason"] == "duplicate_slip"
    mock_ocr.assert_not_called()


# ---------------------------------------------------------------------------
# T6) Idempotent resubmission — final order returns existing result
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.verify_slip_with_gcv", new_callable=AsyncMock)
@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._send_discord")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
@patch("app.api.routers.payments.get_product_price", new_callable=AsyncMock, return_value=19900)
def test_idempotent_resubmission_returns_existing(_price, _ip, _discord, mock_supa, mock_verify, client):
    """Re-submitting a slip whose order is already final returns 200 with existing order."""

    existing_order = {
        "id": "order-existing",
        "status": "verified",
        "slip_url": "https://example.com/slip.jpg",
        "slip_image_hash": IMG_HASH,
        "slip_provider": "gcv",
        "metadata": {},
    }

    class IdempotentChain:
        def table(self, _name):
            return self

        def insert(self, _payload):
            raise Exception("duplicate key value violates unique constraint uq_orders_slip_url")

        def select(self, *args):
            return self

        def eq(self, _col, _val):
            return self

        def limit(self, _n):
            return self

        def execute(self):
            return SimpleNamespace(data=[existing_order])

    mock_supa.table = IdempotentChain().table

    resp = _post_manual_order(client, _build_body())
    assert resp.status_code == 200
    data = resp.json()
    assert data["verification_status"] == "verified"
    assert data["order"]["id"] == "order-existing"
    mock_verify.assert_not_called()


# ---------------------------------------------------------------------------
# T6b) Non-final duplicate order still returns 409
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.verify_slip_with_gcv", new_callable=AsyncMock)
@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._send_discord")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
@patch("app.api.routers.payments.get_product_price", new_callable=AsyncMock, return_value=19900)
def test_nonfinal_duplicate_returns_409(_price, _ip, _discord, mock_supa, mock_verify, client):
    """Re-submitting a slip whose order is still pending_review returns 409."""

    pending_order = {
        "id": "order-pending",
        "status": "pending_review",
        "slip_url": "https://example.com/slip.jpg",
        "metadata": {},
    }

    class NonFinalDupChain:
        def table(self, _name):
            return self

        def insert(self, _payload):
            raise Exception("duplicate key value violates unique constraint uq_orders_slip_url")

        def select(self, *args):
            return self

        def eq(self, _col, _val):
            return self

        def limit(self, _n):
            return self

        def execute(self):
            return SimpleNamespace(data=[pending_order])

    mock_supa.table = NonFinalDupChain().table

    resp = _post_manual_order(client, _build_body())
    assert resp.status_code == 409
    assert "already been submitted" in resp.json()["detail"]
    mock_verify.assert_not_called()


# ---------------------------------------------------------------------------
# T8) slip_provider and slip_reason stored in update
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.enqueue_ocr_job")
@patch("app.api.routers.payments.verify_slip_with_gcv", new_callable=AsyncMock)
@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._send_discord")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
@patch("app.api.routers.payments.get_product_price", new_callable=AsyncMock, return_value=19900)
def test_slip_provider_and_reason_stored(_price, _ip, _discord, mock_supa, mock_verify, _ocr, client):
    oid = _make_order_id()
    mock_verify.return_value = _mock_verification(status="rejected", reason="amount_mismatch")

    chain = FakeSupabaseChain(
        order_data=[{"id": oid, "metadata": {}, "status": "pending"}],
    )
    mock_supa.table = chain.table

    resp = _post_manual_order(client, _build_body())
    assert resp.status_code == 200
    # The update payload should include slip_provider and slip_reason
    assert any(
        p.get("slip_provider") == "gcv" and p.get("slip_reason") == "amount_mismatch"
        for p in chain._update_payloads
    )


# ---------------------------------------------------------------------------
# T7) Authorization — consent_personal_data=false is rejected
#     (The manual-order endpoint is visitor-facing; auth is consent-gated.)
# ---------------------------------------------------------------------------

@patch("app.api.routers.payments.supabase_admin")
@patch("app.api.routers.payments._fetch_ip_info", return_value=None)
def test_missing_consent_rejected(_ip, _supa, client):
    """Requests without consent must be rejected with 400."""
    body = _build_body()
    body["consent_personal_data"] = False
    resp = _post_manual_order(client, body)
    assert resp.status_code == 400
    assert "Consent" in resp.json()["detail"]
