def test_health_contract_shape(client):
    response = client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert body.get("status") in {"ok", "degraded"}
    assert isinstance(body.get("version"), str)

    checks = body.get("checks")
    assert isinstance(checks, dict)
    for key in ("supabase", "redis", "qdrant"):
        assert key in checks


def test_health_response_includes_request_id(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")
