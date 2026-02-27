from types import SimpleNamespace

import pytest

from app.api.routers import places as places_router
from app.services.places import provider_manager
from app.services.providers import google_places as google_module
from app.services.providers import osm_overpass as osm_module


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.store.get(key)

    def setex(self, key: str, ttl: int, value: str) -> bool:
        self.store[key] = value
        return True


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    monkeypatch.setattr(places_router.redis_client, "get_redis", lambda: FakeRedis())


def test_auto_fallback_when_google_fails(client, monkeypatch):
    async def fake_google(self, lat, lng, radius, limit=50):
        raise RuntimeError("quota")

    async def fake_osm(self, lat, lng, radius, limit=50):
        return [
            {
                "id": "osm-1",
                "name": "OSM Place",
                "category": "Cafe",
                "lat": lat,
                "lng": lng,
                "address": None,
                "open_now": None,
                "source": "osm",
                "updated_at": "2026-01-01T00:00:00Z",
            }
        ]

    monkeypatch.setattr(google_module.GooglePlacesProvider, "search_nearby", fake_google)
    monkeypatch.setattr(osm_module.OSMOverpassProvider, "search_nearby", fake_osm)
    monkeypatch.setattr(
        provider_manager,
        "get_settings",
        lambda: SimpleNamespace(GOOGLE_API_KEY="test-google-key"),
    )

    response = client.get("/api/v1/places/nearby?lat=13&lng=100&radius=500&limit=10&provider=auto")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["source"] == "osm"
    assert response.headers["X-Provider"] == "osm"
