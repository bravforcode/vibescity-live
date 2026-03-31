import pytest

from app.api.routers import places as places_router
from app.services.providers import osm_overpass as osm_module


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.store.get(key)

    def setex(self, key: str, ttl: int, value: str) -> bool:
        self.store[key] = value
        return True


@pytest.fixture()
def fake_redis(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(places_router.redis_client, "get_redis", lambda: redis)
    return redis


def test_nearby_cache_hit(client, fake_redis, monkeypatch):
    calls = {"n": 0}

    async def fake_search(self, lat, lng, radius, limit=50):
        calls["n"] += 1
        return [
            {
                "id": "osm-1",
                "name": "Cafe A",
                "category": "Cafe",
                "lat": lat,
                "lng": lng,
                "address": None,
                "open_now": None,
                "source": "osm",
                "updated_at": "2026-01-01T00:00:00Z",
            }
        ]

    monkeypatch.setattr(osm_module.OSMOverpassProvider, "search_nearby", fake_search)

    url = "/api/v1/places/nearby?lat=13.7563&lng=100.5018&radius=500&limit=10&provider=osm"
    first = client.get(url)
    assert first.status_code == 200
    assert first.headers["X-Cache"] == "MISS"
    assert calls["n"] == 1

    second = client.get(url)
    assert second.status_code == 200
    assert second.headers["X-Cache"] == "HIT"
    assert calls["n"] == 1
