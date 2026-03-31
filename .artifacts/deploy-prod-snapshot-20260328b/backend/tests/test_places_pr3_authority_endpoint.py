from app.db.session import get_core_db
from app.main import app


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class FakeAsyncSession:
    async def execute(self, *args, **kwargs):
        return FakeResult(
            [
                {
                    "authority_id": "auth-0001",
                    "name": "Chiang Mai City Office",
                    "category": "municipal",
                    "lat": 18.7883,
                    "lng": 98.9853,
                    "address": "123 ถนน...",
                    "updated_at": None,
                }
            ]
        )


async def fake_get_core_db():
    yield FakeAsyncSession()


def test_authority_endpoint_override_db(client):
    app.dependency_overrides[get_core_db] = fake_get_core_db
    response = client.get("/api/v1/places/authority?province=เชียงใหม่&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["source"] == "authority"
    assert data[0]["id"] == "auth-0001"
