def test_api_contract_headers_present_for_api_routes(client):
    response = client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    assert response.headers.get("X-API-Version")
    assert response.headers.get("X-Request-ID")


def test_api_contract_envelope_opt_in(client):
    response = client.get("/api/v1/openapi.json", headers={"X-API-Envelope": "1"})
    assert response.status_code == 200

    payload = response.json()
    assert "data" in payload
    assert "meta" in payload
    assert "errors" in payload
    assert payload["meta"].get("version")
    assert isinstance(payload["errors"], list)
