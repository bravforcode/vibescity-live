from app.core.config import settings


def test_metrics_endpoint(client):
    client.get("/health")
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "http_requests_total" in response.text


def test_metrics_auth_token(client):
    original = settings.METRICS_AUTH_TOKEN
    settings.METRICS_AUTH_TOKEN = "secret"
    try:
        response = client.get("/metrics")
        assert response.status_code == 401
        authed = client.get("/metrics", headers={"Authorization": "Bearer secret"})
        assert authed.status_code == 200
    finally:
        settings.METRICS_AUTH_TOKEN = original


def test_metrics_requires_token_in_production(client):
    original_env = settings.ENV
    original_token = settings.METRICS_AUTH_TOKEN
    settings.ENV = "production"
    settings.METRICS_AUTH_TOKEN = ""
    try:
        response = client.get("/metrics")
        assert response.status_code == 401
    finally:
        settings.ENV = original_env
        settings.METRICS_AUTH_TOKEN = original_token
