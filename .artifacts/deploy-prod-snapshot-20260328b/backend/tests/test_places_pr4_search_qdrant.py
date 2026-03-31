import pytest

from app.api.routers import places as places_router
from app.db.session import get_vector_client
from app.main import app
from app.services.vector import places_vector_service as vector_service


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.store.get(key)

    def setex(self, key: str, ttl: int, value: str) -> bool:
        self.store[key] = value
        return True


class FakeHit:
    def __init__(self, payload, score=0.9):
        self.payload = payload
        self.score = score
        self.id = "auth-auth-0001"


class FakeQdrant:
    def get_collections(self):
        class Response:
            pass

        response = Response()
        response.collections = [type("Collection", (), {"name": "places_authority_v1"})()]
        return response

    def search(self, *args, **kwargs):
        return [
            FakeHit(
                {
                    "authority_id": "auth-0001",
                    "name": "Chiang Mai City Office",
                    "category": "municipal",
                    "province": "เชียงใหม่",
                    "lat": 18.7883,
                    "lng": 98.9853,
                    "address": "123 ถนน...",
                    "updated_at": "2026-02-17T10:00:00Z",
                }
            )
        ]


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    monkeypatch.setattr(places_router.redis_client, "get_redis", lambda: FakeRedis())


async def fake_get_vector_client():
    yield FakeQdrant()


def test_search_endpoint_override_qdrant(client, monkeypatch):
    async def fake_embed_text(_text: str):
        return [0.1] * 768

    monkeypatch.setattr(vector_service, "embed_text", fake_embed_text)
    app.dependency_overrides[get_vector_client] = fake_get_vector_client

    response = client.get(
        "/api/v1/places/search?"
        "q=city%20office&lat=18.7883&lng=98.9853&radius=5000&limit=10"
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["source"] == "authority"
    assert response.headers["X-Provider"] == "qdrant"
