from types import SimpleNamespace
from unittest.mock import AsyncMock

import app.api.routers.analytics as analytics
from app.main import app


class _FakeQuery:
    def __init__(self, table_name, counts, inserts):
        self.table_name = table_name
        self._counts = counts
        self._inserts = inserts
        self._payload = None
        self._filters = {}
        self._selected = ()

    def select(self, *_args, **_kwargs):
        self._selected = _args
        return self

    def insert(self, payload):
        self._payload = payload
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self._payload is not None:
            self._inserts.append((self.table_name, self._payload))
            return SimpleNamespace(data=[self._payload], count=None)

        if self.table_name == "venues" and "last_osm_sync" in ",".join(self._selected):
            latest = self._counts.get("latest_osm_sync")
            return SimpleNamespace(
                data=[{"last_osm_sync": latest}] if latest else [],
                count=None,
            )

        filter_suffix = ""
        if self._filters:
            pairs = [f"{k}={v}" for k, v in sorted(self._filters.items())]
            filter_suffix = "?" + "&".join(pairs)
        count_key = f"{self.table_name}{filter_suffix}" if filter_suffix else self.table_name
        return SimpleNamespace(
            data=[],
            count=self._counts.get(count_key, self._counts.get(self.table_name, 0)),
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
    fake = _FakeSupabase(
        {
            "user_profiles": 10,
            "venues": 7,
            "venues?source=osm": 5,
            "reviews": 3,
            "shops": 99,
            "latest_osm_sync": "2026-02-18T02:00:00+00:00",
        }
    )
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
    assert payload["stats"]["total_osm_venues"] == 5
    assert payload["stats"]["latest_osm_sync"] == "2026-02-18T02:00:00+00:00"
    assert "shops" not in fake.tables


def test_log_event_prefers_authenticated_user_id(client, monkeypatch):
    log_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(analytics.analytics_buffer, "log", log_mock)
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
    log_mock.assert_awaited_once_with(
        "checkout_start",
        {"sku": "verified"},
        "user-777",
    )
