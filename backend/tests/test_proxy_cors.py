"""Tests for proxy endpoint CORS configuration."""

import pytest
from fastapi.testclient import TestClient


def test_mapbox_directions_options_preflight(client: TestClient):
    """Test that OPTIONS preflight request returns 200 with CORS headers."""
    response = client.options(
        "/api/v1/proxy/mapbox-directions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type,X-Mapbox-Token",
        },
    )
    
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers
    assert "access-control-allow-methods" in response.headers
    assert "access-control-allow-headers" in response.headers


def test_mapbox_directions_cors_headers_present(client: TestClient):
    """Test that GET request includes CORS headers in response."""
    # This will fail with 422 due to missing required params, but we can check CORS headers
    response = client.get(
        "/api/v1/proxy/mapbox-directions",
        headers={"Origin": "http://localhost:5173"},
    )
    
    # Should have CORS headers even on error responses
    assert "access-control-allow-origin" in response.headers


def test_mapbox_directions_allows_lan_origin(client: TestClient):
    """Test that LAN IP origins are allowed in non-production."""
    response = client.options(
        "/api/v1/proxy/mapbox-directions",
        headers={
            "Origin": "http://172.27.16.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers


def test_mapbox_directions_allows_x_mapbox_token_header(client: TestClient):
    """Test that X-Mapbox-Token header is in allowed headers."""
    response = client.options(
        "/api/v1/proxy/mapbox-directions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "X-Mapbox-Token",
        },
    )
    
    assert response.status_code == 200
    # The CORS middleware should allow the X-Mapbox-Token header
    allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "x-mapbox-token" in allowed_headers or "*" in allowed_headers
