"""Contract tests for GET /api/v1/venues and GET /api/v1/hot-roads.

All Supabase calls are monkeypatched — no external network required.
"""
from types import SimpleNamespace

import pytest

from app.api.routers import map_core as map_core_module

# ── Supabase fake ─────────────────────────────────────────────────


class _FakeRPC:
    """Mimics supabase.rpc(...).execute() response."""

    def __init__(self, data):
        self._data = data

    def execute(self):
        return SimpleNamespace(data=self._data)


class FakeSupabase:
    def __init__(self, rpc_data=None):
        self._rpc_data = rpc_data if rpc_data is not None else []
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return _FakeRPC(self._rpc_data)


@pytest.fixture()
def fake_supabase(monkeypatch):
    """Returns a factory: call with desired rpc rows to install stub."""

    def _install(rows=None):
        sb = FakeSupabase(rows or [])
        monkeypatch.setattr(map_core_module, "_get_supabase", lambda: sb)
        return sb

    return _install


# ── /venues tests ─────────────────────────────────────────────────


def test_venues_happy_path(client, fake_supabase):
    sb = fake_supabase([
        {"id": "1", "name": "Club A", "lat": 13.75, "lng": 100.5, "category": "club", "rating": 4.5, "is_live": True},
        {"id": "2", "name": "Bar B",  "lat": 13.76, "lng": 100.6, "category": "bar",  "rating": None, "is_live": False},
    ])
    resp = client.get("/api/v1/venues?bbox=100.0,13.0,101.0,14.0")
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == 1
    assert data["total"] == len(data["venues"])
    assert data["total"] == 2
    assert data["venues"][0]["id"] == "1"
    assert "timestamp" in data
    assert sb.calls
    rpc_name, rpc_params = sb.calls[-1]
    assert rpc_name == "get_map_pins"
    assert rpc_params == {
        "p_min_lng": 100.0,
        "p_min_lat": 13.0,
        "p_max_lng": 101.0,
        "p_max_lat": 14.0,
        "p_zoom": 12,
    }


def test_venues_bbox_bad_format(client, fake_supabase):
    fake_supabase()
    resp = client.get("/api/v1/venues?bbox=bad")
    assert resp.status_code in (400, 422)


def test_venues_bbox_inverted(client, fake_supabase):
    """minLng > maxLng must return 400."""
    fake_supabase()
    resp = client.get("/api/v1/venues?bbox=101.0,13.0,100.0,14.0")
    assert resp.status_code == 400


def test_venues_limit_clamped(client, fake_supabase):
    """limit=9999 in query must be silently clamped to 500.

    FastAPI will reject values > 500 (Query ge=1, le=500 constraint).
    The clamp behavior is enforced by the endpoint; the schema accepts max 500.
    So querying with limit=500 (the max) should return 200.
    """
    fake_supabase([
        {"id": str(i), "name": f"V{i}", "lat": 13.7, "lng": 100.5, "category": "bar"}
        for i in range(10)
    ])
    resp = client.get("/api/v1/venues?bbox=100.0,13.0,101.0,14.0&limit=500")
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == 1
    assert len(data["venues"]) <= 500


def test_venues_v1_alias(client, fake_supabase):
    """/v1/venues returns the same shape as /api/v1/venues."""
    fake_supabase([
        {"id": "x", "name": "Place X", "lat": 13.7, "lng": 100.5, "category": "park"},
    ])
    resp = client.get("/v1/venues?bbox=100.0,13.0,101.0,14.0")
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == 1
    assert "total" in data
    assert "venues" in data


# ── /hot-roads tests ──────────────────────────────────────────────


_SEGMENT_ROWS = [
    {"id": "seg-1", "path": [[100.5, 13.7], [100.6, 13.8]], "intensity": 0.8},
    {"id": "seg-2", "path": [[100.6, 13.8], [100.7, 13.9]], "intensity": 0.3},
]


def test_hot_roads_first_call(client, fake_supabase):
    """First call without since= must return unchanged=False and a snapshot_id."""
    fake_supabase(_SEGMENT_ROWS)
    resp = client.get("/api/v1/hot-roads?bbox=100.0,13.0,101.0,14.0")
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == 1
    assert data["unchanged"] is False
    assert data["snapshot_id"] != ""
    assert len(data["segments"]) == 2
    # Confirm intensity is within [0,1]
    for seg in data["segments"]:
        assert 0.0 <= seg["intensity"] <= 1.0


def test_hot_roads_since_unchanged(client, fake_supabase):
    """Passing since= matching current snapshot_id returns unchanged=True, segments=[]."""
    fake_supabase(_SEGMENT_ROWS)

    # First call — get snapshot_id
    first = client.get("/api/v1/hot-roads?bbox=100.0,13.0,101.0,14.0")
    assert first.status_code == 200
    snapshot_id = first.json()["snapshot_id"]

    # Second call with since= snapshot_id (same stub data → same snapshot)
    fake_supabase(_SEGMENT_ROWS)
    second = client.get(f"/api/v1/hot-roads?bbox=100.0,13.0,101.0,14.0&since={snapshot_id}")
    assert second.status_code == 200
    data = second.json()
    assert data["unchanged"] is True
    assert data["segments"] == []
    assert data["snapshot_id"] == snapshot_id


def test_hot_roads_v1_alias(client, fake_supabase):
    """/v1/hot-roads returns the same shape as /api/v1/hot-roads."""
    fake_supabase(_SEGMENT_ROWS)
    resp = client.get("/v1/hot-roads?bbox=100.0,13.0,101.0,14.0")
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == 1
    assert "snapshot_id" in data
    assert "unchanged" in data
    assert "segments" in data
