import os
import socket
import sys
from pathlib import Path

import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient


def _has_network() -> bool:
    """Quick DNS probe — returns False if resolver is unreachable."""
    try:
        socket.getaddrinfo("pypi.org", 443, socket.AF_INET, socket.SOCK_STREAM)
        return True
    except (socket.gaierror, OSError):
        return False


_NETWORK_OK = _has_network()


def pytest_collection_modifyitems(config, items):
    """Auto-skip @pytest.mark.network tests when DNS is down."""
    if _NETWORK_OK:
        return
    skip_net = pytest.mark.skip(reason="network unavailable (DNS probe failed)")
    for item in items:
        if "network" in item.keywords:
            item.add_marker(skip_net)

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("ENV", "testing")
os.environ.setdefault("METRICS_ENABLED", "true")
os.environ.setdefault("OTEL_ENABLED", "false")
os.environ.setdefault("OTEL_EXPORTER_OTLP_ENDPOINT", "")

from app.main import app  # noqa: E402
from app.core.auth import verify_user  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def force_utf8_stdio():
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if not stream:
            continue
        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            # Keep tests fail-open if host stream does not support reconfiguration.
            pass


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
