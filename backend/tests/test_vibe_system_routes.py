from __future__ import annotations

import pytest

from app.api.routers import vibes as vibes_module


@pytest.fixture(autouse=True)
def clear_vibe_state():
    vibes_module.zone_vibes.clear()
    vibes_module.place_vibes.clear()
    vibes_module.user_last_claim.clear()
    vibes_module.user_scores.clear()
    yield
    vibes_module.zone_vibes.clear()
    vibes_module.place_vibes.clear()
    vibes_module.user_last_claim.clear()
    vibes_module.user_scores.clear()


def test_vibe_alias_routes_expose_zone_snapshot(client):
    primary = client.get("/api/v1/vibe/zones")
    alias = client.get("/api/v1/vibes/zones")

    assert primary.status_code == 200
    assert alias.status_code == 200

    rows = primary.json()
    assert isinstance(rows, list)
    assert len(rows) >= 3
    assert {"zone_id", "name", "description", "current_vibe", "active_users"}.issubset(
        rows[0].keys()
    )


def test_vibe_claim_updates_leaderboard_and_status(client):
    claim_response = client.post(
        "/api/v1/vibe/claim",
        json={
            "user_id": "tester-1",
            "vibe_type": "zone",
            "zone_id": "bangkok-night-core",
        },
    )
    assert claim_response.status_code == 200
    claim_payload = claim_response.json()
    assert claim_payload["success"] is True
    assert claim_payload["vibe_points"] == 25

    leaderboard_response = client.get("/api/v1/vibe/leaderboard")
    assert leaderboard_response.status_code == 200
    leaderboard_payload = leaderboard_response.json()
    assert leaderboard_payload["leaderboard"][0]["user_id"] == "tester-1"
    assert leaderboard_payload["leaderboard"][0]["contributions"] == 25

    status_response = client.get("/api/v1/vibe/status")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["status"] == "online"
    assert status_payload["active_zones"] >= 1
    assert status_payload["total_claims_today"] >= 1


def test_vibe_batch_update_updates_zone_and_place(client):
    response = client.post(
        "/api/v1/vibes/batch-update",
        json={
            "updates": [
                {"zone_id": "chiang-mai-nimman", "vibes": 2, "user_id": "user-a"},
                {"place_id": "venue-123", "delta": 3, "user_id": "user-a"},
            ]
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["processed"] == 2

    zones = client.get("/api/v1/vibe/zones").json()
    nimman = next(zone for zone in zones if zone["zone_id"] == "chiang-mai-nimman")
    assert nimman["active_users"] == 1
    assert nimman["current_vibe"] > 0

    place = client.get("/api/v1/vibe/places/venue-123")
    assert place.status_code == 200
    place_payload = place.json()
    assert place_payload["user_vibes"] == 3
