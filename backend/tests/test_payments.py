from types import SimpleNamespace

import app.api.routers.payments as payments


def test_create_checkout_session_success(client, override_auth, monkeypatch):
    monkeypatch.setattr(payments.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(
        payments.stripe.checkout.Session,
        "create",
        lambda **_kwargs: SimpleNamespace(url="https://stripe.test/checkout"),
    )

    payload = {
        "itemType": "verified",
        "itemId": "venue-1",
        "successUrl": "https://vibecity.live/success",
        "cancelUrl": "https://vibecity.live/cancel",
    }
    res = client.post("/api/v1/payments/create-checkout-session", json=payload)
    assert res.status_code == 200
    assert res.json()["url"] == "https://stripe.test/checkout"


def test_create_checkout_session_logs_sheet_event(client, override_auth, monkeypatch):
    captured = []

    monkeypatch.setattr(payments.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(
        payments.stripe.checkout.Session,
        "create",
        lambda **_kwargs: SimpleNamespace(url="https://stripe.test/checkout"),
    )
    monkeypatch.setattr(
        payments,
        "_schedule_payment_sheet_log",
        lambda event_type, payload, **kwargs: captured.append(
            {"event_type": event_type, "payload": payload, "kwargs": kwargs}
        ),
    )

    payload = {
        "itemType": "verified",
        "itemId": "venue-2",
        "successUrl": "https://vibecity.live/success",
        "cancelUrl": "https://vibecity.live/cancel",
    }
    res = client.post("/api/v1/payments/create-checkout-session", json=payload)

    assert res.status_code == 200
    assert len(captured) == 1
    assert captured[0]["event_type"] == "checkout_session_created"
    assert captured[0]["payload"]["item_type"] == "verified"
    assert captured[0]["payload"]["item_id"] == "venue-2"


def test_create_checkout_session_invalid_redirect(client, override_auth, monkeypatch):
    monkeypatch.setattr(payments.settings, "STRIPE_SECRET_KEY", "sk_test")
    payload = {
        "itemType": "verified",
        "itemId": "venue-1",
        "successUrl": "https://evil.com/hack",
        "cancelUrl": "https://evil.com/cancel",
    }
    res = client.post("/api/v1/payments/create-checkout-session", json=payload)
    assert res.status_code == 400


def test_manual_order_requires_consent(client, monkeypatch):
    monkeypatch.setattr(payments, "supabase_admin", object())
    payload = {
        "venue_id": "c2968e0d-3f5f-4f4c-a5b3-2db6dcaf2fb0",
        "sku": "verified_badge",
        "amount": 199,
        "slip_url": "https://example.com/slip.jpg",
        "visitor_id": "visitor-1",
        "consent_personal_data": False,
        "buyer_profile": {
            "full_name": "Healthcheck Bot",
            "phone": "0800000000",
            "email": "healthcheck@vibecity.live",
            "address_line1": "Healthcheck Street",
            "country": "TH",
            "province": "Bangkok",
            "district": "Pathum Wan",
            "postal_code": "10330",
        },
    }
    res = client.post("/api/v1/payments/manual-order", json=payload)
    assert res.status_code == 400
    assert res.json()["detail"] == "Consent required"


def test_manual_order_success(client, monkeypatch):
    class _FakeInsertResult:
        def __init__(self, data):
            self.data = data

    class _FakeQuery:
        def __init__(self, table_name):
            self.table_name = table_name
            self._payload = None
            self._filters = {}

        def insert(self, payload):
            self._payload = payload
            return self

        def update(self, payload):
            self._payload = payload
            return self

        def eq(self, key, value):
            self._filters[key] = value
            return self

        def select(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "orders":
                return _FakeInsertResult([{"id": "order-1", **(self._payload or {})}])
            return _FakeInsertResult([])

    class _FakeSupabase:
        def table(self, table_name):
            return _FakeQuery(table_name)

    monkeypatch.setattr(payments, "supabase_admin", _FakeSupabase())
    monkeypatch.setattr(payments, "enqueue_ocr_job", lambda _order_id: "1-0")
    monkeypatch.setattr(payments, "_send_discord", lambda _payload: None)
    monkeypatch.setattr(payments, "_fetch_ip_info", lambda _ip: None)

    payload = {
        "venue_id": "c2968e0d-3f5f-4f4c-a5b3-2db6dcaf2fb0",
        "sku": "verified_badge",
        "amount": 199,
        "slip_url": "https://example.com/slip.jpg",
        "visitor_id": "visitor-1",
        "consent_personal_data": True,
        "buyer_profile": {
            "full_name": "Healthcheck Bot",
            "phone": "0800000000",
            "email": "healthcheck@vibecity.live",
            "address_line1": "Healthcheck Street",
            "country": "TH",
            "province": "Bangkok",
            "district": "Pathum Wan",
            "postal_code": "10330",
        },
    }
    res = client.post("/api/v1/payments/manual-order", json=payload)
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert res.json()["order"]["id"] == "order-1"
    assert res.json()["ocr_enqueued"] is True


def test_manual_order_queue_failure_returns_pending(client, monkeypatch):
    class _FakeInsertResult:
        def __init__(self, data):
            self.data = data

    class _FakeQuery:
        def __init__(self, table_name):
            self.table_name = table_name
            self._payload = None

        def insert(self, payload):
            self._payload = payload
            return self

        def update(self, payload):
            self._payload = payload
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def select(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name == "orders":
                return _FakeInsertResult(
                    [{"id": "order-queue-fail", **(self._payload or {})}]
                )
            return _FakeInsertResult([])

    class _FakeSupabase:
        def table(self, table_name):
            return _FakeQuery(table_name)

    monkeypatch.setattr(payments, "supabase_admin", _FakeSupabase())
    monkeypatch.setattr(
        payments,
        "enqueue_ocr_job",
        lambda _order_id: (_ for _ in ()).throw(RuntimeError("queue down")),
    )
    monkeypatch.setattr(payments, "_send_discord", lambda _payload: None)
    monkeypatch.setattr(payments, "_fetch_ip_info", lambda _ip: None)

    payload = {
        "venue_id": "c2968e0d-3f5f-4f4c-a5b3-2db6dcaf2fb0",
        "sku": "verified_badge",
        "amount": 199,
        "slip_url": "https://example.com/slip.jpg",
        "visitor_id": "visitor-1",
        "consent_personal_data": True,
        "buyer_profile": {
            "full_name": "Healthcheck Bot",
            "phone": "0800000000",
            "email": "healthcheck@vibecity.live",
            "address_line1": "Healthcheck Street",
            "country": "TH",
            "province": "Bangkok",
            "district": "Pathum Wan",
            "postal_code": "10330",
        },
    }
    res = client.post("/api/v1/payments/manual-order", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["ocr_enqueued"] is False
    assert data["retryable"] is True


def test_webhook_uses_stripe_webhook_events_idempotency_store(client, monkeypatch):
    class _FakeResp:
        def __init__(self, data):
            self.data = data

    class _FakeQuery:
        def __init__(self, table_name, store):
            self.table_name = table_name
            self.store = store
            self._filters = {}
            self._insert_payload = None
            self._update_payload = None

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, key, value):
            self._filters[key] = value
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def insert(self, payload):
            self._insert_payload = payload
            return self

        def update(self, payload):
            self._update_payload = payload
            return self

        def execute(self):
            if self.table_name != "stripe_webhook_events":
                return _FakeResp([])

            event_id = self._filters.get("stripe_event_id")
            if self._insert_payload is not None:
                insert_event_id = self._insert_payload.get("stripe_event_id")
                self.store[insert_event_id] = {
                    **self._insert_payload,
                    "id": "evt-row-1",
                }
                return _FakeResp([self.store[insert_event_id]])

            if self._update_payload is not None and event_id in self.store:
                self.store[event_id].update(self._update_payload)
                return _FakeResp([self.store[event_id]])

            row = self.store.get(event_id)
            return _FakeResp([row] if row else [])

    class _FakeSupabase:
        def __init__(self):
            self.events = {}

        def table(self, table_name):
            return _FakeQuery(table_name, self.events)

    fake_supabase = _FakeSupabase()
    monkeypatch.setattr(payments, "supabase_admin", fake_supabase)
    monkeypatch.setattr(payments.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        payments.stripe.Webhook,
        "construct_event",
        lambda **_kwargs: {
            "id": "evt_test_1",
            "type": "charge.succeeded",
            "data": {"object": {}},
        },
    )

    res = client.post(
        "/api/v1/payments/webhook",
        data="{}",
        headers={"stripe-signature": "sig_test"},
    )

    assert res.status_code == 200
    assert res.json()["received"] is True
    assert "evt_test_1" in fake_supabase.events
    assert fake_supabase.events["evt_test_1"]["event_type"] == "charge.succeeded"


def test_webhook_duplicate_event_returns_duplicate(client, monkeypatch):
    class _FakeResp:
        def __init__(self, data):
            self.data = data

    class _FakeQuery:
        def __init__(self, table_name, store):
            self.table_name = table_name
            self.store = store
            self._filters = {}

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, key, value):
            self._filters[key] = value
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def insert(self, payload):
            self.store[payload["stripe_event_id"]] = payload
            return self

        def update(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table_name != "stripe_webhook_events":
                return _FakeResp([])
            event_id = self._filters.get("stripe_event_id")
            row = self.store.get(event_id)
            return _FakeResp([row] if row else [])

    class _FakeSupabase:
        def __init__(self):
            self.events = {
                "evt_test_dup": {
                    "id": "evt-row-2",
                    "stripe_event_id": "evt_test_dup",
                    "event_type": "checkout.session.completed",
                }
            }

        def table(self, table_name):
            return _FakeQuery(table_name, self.events)

    monkeypatch.setattr(payments, "supabase_admin", _FakeSupabase())
    monkeypatch.setattr(payments.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        payments.stripe.Webhook,
        "construct_event",
        lambda **_kwargs: {
            "id": "evt_test_dup",
            "type": "checkout.session.completed",
            "data": {"object": {}},
        },
    )

    res = client.post(
        "/api/v1/payments/webhook",
        data="{}",
        headers={"stripe-signature": "sig_test"},
    )

    assert res.status_code == 200
    assert res.json()["duplicate"] is True
