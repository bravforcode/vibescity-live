from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app


def test_og_site_png():
    with TestClient(app) as client:
        response = client.get("/api/v1/seo/og/site.png")
    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith("image/png")
    assert len(response.content) > 100


def test_redirect_root_defaults_to_th():
    with TestClient(app) as client:
        response = client.get("/api/v1/seo/redirect/root", follow_redirects=False)
    assert response.status_code == 301
    assert response.headers.get("location") == "/th"
    assert "vibe_locale=th" in response.headers.get("set-cookie", "")


def test_redirect_public_uses_detected_locale():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/seo/redirect/public",
            params={"path": "/privacy"},
            headers={"x-vercel-ip-country": "US"},
            follow_redirects=False,
        )
    assert response.status_code == 301
    assert response.headers.get("location") == "/en/privacy"
    assert "vibe_locale=en" in response.headers.get("set-cookie", "")


def test_redirect_public_rejects_private_paths():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/seo/redirect/public",
            params={"path": "/admin"},
            follow_redirects=False,
        )
    assert response.status_code == 404


def test_redirect_venue_short_code_invalid_format():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/seo/redirect/venue/not-a-code",
            follow_redirects=False,
        )
    assert response.status_code == 404


def test_redirect_venue_short_code_found():
    with patch("app.api.routers.seo.supabase") as mock_supabase:
        mock_response = MagicMock()
        mock_response.data = [{"slug": "test-venue"}]
        (
            mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value
        ) = mock_response

        with TestClient(app) as client:
            response = client.get(
                "/api/v1/seo/redirect/venue/ABC2DEF",
                headers={"x-vercel-ip-country": "TH"},
                follow_redirects=False,
            )

    assert response.status_code == 301
    assert response.headers.get("location") == "/th/v/test-venue"
