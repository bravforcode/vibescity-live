import os
import sys
from pathlib import Path

import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("ENV", "testing")
os.environ.setdefault("METRICS_ENABLED", "true")
os.environ.setdefault("OTEL_ENABLED", "false")
os.environ.setdefault("OTEL_EXPORTER_OTLP_ENDPOINT", "")

from app.main import app  # noqa: E402
from app.core.auth import verify_user  # noqa: E402


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


@pytest.fixture()
def fake_user():
    return SimpleNamespace(id="user-123", app_metadata={})


@pytest.fixture()
def override_auth(fake_user):
    app.dependency_overrides[verify_user] = lambda: fake_user
    return fake_user
