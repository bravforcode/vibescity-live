from types import SimpleNamespace

import pytest

from app.core.auth import verify_admin
from app.main import app
from app.services.cache.redis_client import get_redis


class _FakeRedis:
    def __init__(self, session_count: int):
        self._keys = [f"session:{idx}" for idx in range(session_count)]

    def keys(self, pattern: str):
        if pattern == "session:*":
            return list(self._keys)
        return []


@pytest.fixture(autouse=True)
def _override_dashboard_dependencies():
    app.dependency_overrides[get_redis] = lambda: _FakeRedis(session_count=4)
    yield


def test_admin_dashboard_with_object_admin_user(client):
    app.dependency_overrides[verify_admin] = lambda: SimpleNamespace(
        id="admin-1",
        app_metadata={"role": "admin"},
        email="admin@example.com",
    )

    response = client.get("/api/v1/admin/dashboard")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_sessions"] == 4
    assert payload["admin_user"] == "admin@example.com"


def test_admin_dashboard_with_dict_admin_user(client):
    app.dependency_overrides[verify_admin] = lambda: {
        "id": "admin-2",
        "app_metadata": {"role": "admin"},
        "email": "dict-admin@example.com",
    }

    response = client.get("/api/v1/admin/dashboard")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_sessions"] == 4
    assert payload["admin_user"] == "dict-admin@example.com"
