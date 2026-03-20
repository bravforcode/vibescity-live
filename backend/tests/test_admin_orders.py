from types import SimpleNamespace

import pytest

import app.api.routers.admin as admin_router
from app.core.auth import verify_admin
from app.main import app


class FakeOrdersQuery:
    def __init__(self, rows):
        self._rows = list(rows)
        self._status = ""
        self._sku_like = ""
        self._venue_id = ""
        self._date_from = ""
        self._date_to = ""
        self._descending = True
        self._order_field = "created_at"
        self._from = 0
        self._to = None
        self.count = None

    def select(self, *_args, count=None, **_kwargs):
        self.count = count
        return self

    def order(self, field, desc=True):
        self._order_field = str(field or "created_at")
        self._descending = bool(desc)
        return self

    def range(self, from_idx, to_idx):
        self._from = int(from_idx)
        self._to = int(to_idx)
        return self

    def eq(self, field, value):
        if field == "status":
            self._status = str(value or "")
        if field == "venue_id":
            self._venue_id = str(value or "")
        return self

    def ilike(self, field, value):
        if field == "sku":
            self._sku_like = str(value or "").replace("%", "").lower()
        return self

    def gte(self, field, value):
        if field == "created_at":
            self._date_from = str(value or "")
        return self

    def lte(self, field, value):
        if field == "created_at":
            self._date_to = str(value or "")
        return self

    def execute(self):
        rows = list(self._rows)
        if self._status:
            rows = [r for r in rows if str(r.get("status") or "") == self._status]
        if self._venue_id:
            rows = [r for r in rows if str(r.get("venue_id") or "") == self._venue_id]
        if self._sku_like:
            rows = [
                r
                for r in rows
                if self._sku_like in str(r.get("sku") or "").lower()
            ]
        if self._date_from:
            rows = [
                r
                for r in rows
                if str(r.get("created_at") or "") >= self._date_from
            ]
        if self._date_to:
            rows = [
                r
                for r in rows
                if str(r.get("created_at") or "") <= self._date_to
            ]

        rows.sort(
            key=lambda r: str(r.get(self._order_field) or ""),
            reverse=self._descending,
        )

        total = len(rows)
        if self._to is None:
            sliced = rows[self._from :]
        else:
            sliced = rows[self._from : self._to + 1]

        return SimpleNamespace(data=sliced, count=total)


class FakeSupabaseAdmin:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        if name != "orders":
            raise AssertionError(f"Unexpected table: {name}")
        return FakeOrdersQuery(self._rows)


@pytest.fixture(autouse=True)
def override_verify_admin():
    app.dependency_overrides[verify_admin] = lambda: SimpleNamespace(
        id="admin-1",
        app_metadata={"role": "admin"},
        email="admin@example.com",
    )
    yield


def test_admin_orders_list_and_filters(client, monkeypatch):
    rows = [
        {
            "id": "order-1",
            "sku": "pin-basic",
            "status": "paid",
            "amount": 120,
            "venue_id": "00000000-0000-0000-0000-000000000001",
            "user_id": "user-1",
            "visitor_id": "visitor-1",
            "slip_url": None,
            "metadata": {},
            "created_at": "2026-02-20T10:00:00+00:00",
            "updated_at": "2026-02-20T10:01:00+00:00",
        },
        {
            "id": "order-2",
            "sku": "pin-pro",
            "status": "pending",
            "amount": 220,
            "venue_id": "00000000-0000-0000-0000-000000000001",
            "user_id": "user-2",
            "visitor_id": "visitor-2",
            "slip_url": None,
            "metadata": {},
            "created_at": "2026-02-21T10:00:00+00:00",
            "updated_at": "2026-02-21T10:01:00+00:00",
        },
        {
            "id": "order-3",
            "sku": "pin-basic-plus",
            "status": "paid",
            "amount": 320,
            "venue_id": "00000000-0000-0000-0000-000000000003",
            "user_id": "user-3",
            "visitor_id": "visitor-3",
            "slip_url": None,
            "metadata": {},
            "created_at": "2026-02-22T10:00:00+00:00",
            "updated_at": "2026-02-22T10:01:00+00:00",
        },
    ]
    monkeypatch.setattr(admin_router, "supabase_admin", FakeSupabaseAdmin(rows))

    response = client.get(
        "/api/v1/admin/orders?page=1&page_size=1&order_by=created_at&ascending=false&status=paid"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["total"] == 2
    assert payload["total_pages"] == 2
    assert len(payload["rows"]) == 1
    assert payload["rows"][0]["id"] == "order-3"


def test_admin_orders_analytics_summary(client, monkeypatch):
    rows = [
        {
            "id": "order-1",
            "sku": "pin-basic",
            "status": "paid",
            "amount": 100,
            "created_at": "2026-02-20T10:00:00+00:00",
        },
        {
            "id": "order-2",
            "sku": "pin-pro",
            "status": "pending",
            "amount": 200,
            "created_at": "2026-02-20T11:00:00+00:00",
        },
        {
            "id": "order-3",
            "sku": "pin-plus",
            "status": "paid",
            "amount": 300,
            "created_at": "2026-02-21T12:00:00+00:00",
        },
    ]
    monkeypatch.setattr(admin_router, "supabase_admin", FakeSupabaseAdmin(rows))

    response = client.get("/api/v1/admin/orders/analytics")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["summary"]["total_orders"] == 3
    assert payload["summary"]["paid_orders"] == 2
    assert payload["summary"]["total_revenue"] == 400
    assert payload["status_breakdown"]["paid"] == 2
    assert payload["status_breakdown"]["pending"] == 1
    assert payload["revenue_trend"] == [
        {"date": "2026-02-20", "amount": 100.0},
        {"date": "2026-02-21", "amount": 300.0},
    ]
