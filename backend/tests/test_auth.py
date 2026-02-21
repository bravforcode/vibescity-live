import pytest
from types import SimpleNamespace
from fastapi.security import HTTPAuthorizationCredentials
from fastapi import HTTPException

import app.core.auth as auth


@pytest.mark.asyncio
async def test_verify_user_success(monkeypatch):
    class Resp:
        user = SimpleNamespace(id="user-1", app_metadata={})

    monkeypatch.setattr(
        auth,
        "supabase",
        SimpleNamespace(auth=SimpleNamespace(get_user=lambda token: Resp())),
    )

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")
    user = await auth.verify_user(creds)
    assert user.id == "user-1"


@pytest.mark.asyncio
async def test_verify_user_invalid(monkeypatch):
    class Resp:
        user = None

    monkeypatch.setattr(
        auth,
        "supabase",
        SimpleNamespace(auth=SimpleNamespace(get_user=lambda token: Resp())),
    )

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")
    with pytest.raises(HTTPException):
        await auth.verify_user(creds)


@pytest.mark.asyncio
async def test_verify_admin(monkeypatch):
    admin_user = SimpleNamespace(app_metadata={"role": "admin"})
    assert await auth.verify_admin(admin_user) == admin_user
