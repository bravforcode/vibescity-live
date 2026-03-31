"""Tests for UGC reward atomicity and daily limit enforcement."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.routers.ugc import REWARDS, grant_rewards
from app.core.auth import verify_user
from app.main import app


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def fake_user():
    return SimpleNamespace(id="user-test-rewards", app_metadata={})


@pytest.fixture(autouse=True)
def _override_auth(fake_user):
    app.dependency_overrides[verify_user] = lambda: fake_user
    yield
    app.dependency_overrides = {}


class TestGrantRewardsReturn:
    """grant_rewards returns data on success, None on failure/limit."""

    @patch("app.api.routers.ugc.supabase")
    def test_success_returns_data(self, mock_sb):
        mock_sb.rpc.return_value.execute.return_value = MagicMock(
            data={"success": True, "new_coins": 10, "new_xp": 50, "daily_count": 1, "daily_max": 5}
        )
        result = grant_rewards("user-1", "submit_shop")
        assert result is not None
        assert result["success"] is True

    @patch("app.api.routers.ugc.supabase")
    def test_daily_limit_returns_none(self, mock_sb):
        mock_sb.rpc.return_value.execute.return_value = MagicMock(
            data={"success": False, "error": "daily_limit_exceeded", "daily_count": 5, "daily_max": 5}
        )
        result = grant_rewards("user-1", "submit_shop")
        assert result is None

    @patch("app.api.routers.ugc.supabase")
    def test_exception_returns_none(self, mock_sb):
        mock_sb.rpc.side_effect = Exception("connection error")
        result = grant_rewards("user-1", "submit_shop")
        assert result is None

    @patch("app.api.routers.ugc.supabase")
    def test_correct_params_sent(self, mock_sb):
        mock_sb.rpc.return_value.execute.return_value = MagicMock(
            data={"success": True, "new_coins": 5, "new_xp": 25}
        )
        grant_rewards("user-abc", "check_in")
        mock_sb.rpc.assert_called_once_with(
            "grant_rewards",
            {
                "target_user_id": "user-abc",
                "reward_coins": REWARDS["check_in"]["coins"],
                "reward_xp": REWARDS["check_in"]["xp"],
                "action_name": "check_in",
            },
        )


class TestEndpointRewardMessaging:
    """Endpoints report accurate reward status to client."""

    @patch("app.api.routers.ugc.supabase")
    def test_submit_shop_rewarded(self, mock_sb, client):
        mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": 1, "name": "Test Shop"}]
        )
        mock_sb.rpc.return_value.execute.return_value = MagicMock(
            data={"success": True, "new_coins": 10, "new_xp": 50}
        )
        resp = client.post("/api/v1/ugc/shops", json={
            "name": "Test Shop", "category": "food",
            "latitude": 13.7, "longitude": 100.5,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "+10 Coins" in body["message"]
        assert body["rewards"]["coins"] == 10

    @patch("app.api.routers.ugc.supabase")
    def test_submit_shop_limit_reached(self, mock_sb, client):
        mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": 2, "name": "Test Shop 2"}]
        )
        mock_sb.rpc.return_value.execute.return_value = MagicMock(
            data={"success": False, "error": "daily_limit_exceeded"}
        )
        resp = client.post("/api/v1/ugc/shops", json={
            "name": "Test Shop 2", "category": "food",
            "latitude": 13.7, "longitude": 100.5,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "daily reward limit reached" in body["message"]
        assert body["rewards"]["coins"] == 0

    @patch("app.api.routers.ugc.supabase")
    def test_photo_upload_limit_reached(self, mock_sb, client):
        mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": 3, "image_url": "https://example.com/img.jpg"}]
        )
        mock_sb.rpc.return_value.execute.return_value = MagicMock(
            data={"success": False, "error": "daily_limit_exceeded"}
        )
        resp = client.post("/api/v1/ugc/photos", json={
            "venue_id": 1, "image_url": "https://example.com/img.jpg",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "daily reward limit reached" in body["message"]
        assert body["rewards"]["coins"] == 0
