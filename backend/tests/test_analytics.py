from types import SimpleNamespace

from app.main import app
import app.api.routers.analytics as analytics


class _FakeQuery:
    def __init__(self, table_name, counts, inserts):
        self.table_name = table_name
        self._counts = counts
        self._inserts = inserts
        self._payload = None

    def select(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self._payload = payload
        return self

    def execute(self):
        if self._payload is not None:
            self._inserts.append((self.table_name, self._payload))
            return SimpleNamespace(data=[self._payload], count=None)
        return SimpleNamespace(
            data=[],
            count=self._counts.get(self.table_name, 0),
        )


class _FakeSupabase:
    def __init__(self, counts):
        self.counts = counts
        self.tables = []
        self.inserts = []

    def table(self, table_name):
        self.tables.append(table_name)
        return _FakeQuery(table_name, self.counts, self.inserts)


def test_dashboard_stats_use_canonical_venues(client, monkeypatch):
    fake = _FakeSupabase({"profiles": 10, "venues": 7, "reviews": 3, "shops": 99})
    monkeypatch.setattr(analytics, "supabase", fake)
    app.dependency_overrides[analytics.verify_admin] = lambda: SimpleNamespace(id="admin-1")

    response = client.get("/api/v1/analytics/dashboard/stats")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["stats"]["total_users"] == 10
    assert payload["stats"]["total_venues"] == 7
    assert payload["stats"]["total_shops"] == 7
    assert payload["stats"]["total_reviews"] == 3
    assert "shops" not in fake.tables


def test_log_event_prefers_authenticated_user_id(client, monkeypatch):
    fake = _FakeSupabase({})
    monkeypatch.setattr(analytics, "supabase", fake)
    app.dependency_overrides[analytics.get_optional_user] = lambda: SimpleNamespace(id="user-777")

    response = client.post(
        "/api/v1/analytics/log",
        json={
            "event_type": "checkout_start",
            "data": {"sku": "verified"},
            "user_id": "fallback-user",
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert fake.inserts
    table_name, payload = fake.inserts[0]
    assert table_name == "analytics_logs"
    assert payload["user_id"] == "user-777"
