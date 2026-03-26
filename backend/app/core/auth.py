import asyncio
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.supabase import supabase

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)
settings = get_settings()

# In-memory JWT cache: token → (user, expires_at)
# Caches for 60s — well within Supabase token expiry (~1h)
# Prevents a remote Supabase Auth call on every authenticated request.
_TOKEN_CACHE: dict[str, tuple[object, float]] = {}
_TOKEN_CACHE_TTL = 60.0
_TOKEN_CACHE_MAX = 2048  # Evict oldest when full


def _normalize_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def _admin_email_allowlist() -> set[str]:
    raw = str(getattr(settings, "ADMIN_EMAIL_ALLOWLIST", "") or "")
    out: set[str] = set()
    for item in raw.split(","):
        normalized = _normalize_email(item)
        if normalized:
            out.add(normalized)
    return out


def _cache_get(token: str) -> object | None:
    entry = _TOKEN_CACHE.get(token)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    _TOKEN_CACHE.pop(token, None)
    return None


def _cache_set(token: str, user: object) -> None:
    if len(_TOKEN_CACHE) >= _TOKEN_CACHE_MAX:
        # Evict ~10% oldest entries to bound memory
        cutoff = time.monotonic()
        expired = [k for k, v in _TOKEN_CACHE.items() if v[1] < cutoff]
        for k in expired[:max(1, _TOKEN_CACHE_MAX // 10)]:
            _TOKEN_CACHE.pop(k, None)
    _TOKEN_CACHE[token] = (user, time.monotonic() + _TOKEN_CACHE_TTL)


async def verify_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verifies the JWT token using Supabase Auth.
    Returns the user object if valid, raises 401 otherwise.
    Results are cached for 60s to avoid a remote call on every request.
    """
    token = credentials.credentials

    cached = _cache_get(token)
    if cached is not None:
        return cached

    try:
        # Remote call only on cache miss (~once per minute per user)
        response = await asyncio.to_thread(supabase.auth.get_user, token)

        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        _cache_set(token, response.user)
        return response.user

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def verify_admin(user = Depends(verify_user)):
    """
    Verifies that the user has admin privileges.
    Checks app_metadata for 'admin' role.
    """
    # Check for 'admin' in app_metadata roles or role field
    # Supabase specific: app_metadata is usually where roles live
    app_metadata = getattr(user, "app_metadata", {})
    role = str(app_metadata.get("role", "")).strip().lower()
    roles = [
        str(r).strip().lower()
        for r in (app_metadata.get("roles", []) if isinstance(app_metadata.get("roles", []), list) else [])
        if str(r).strip()
    ]
    email = _normalize_email(getattr(user, "email", None))
    allowlist = _admin_email_allowlist()

    has_admin_role = role in {"admin", "super_admin"} or "admin" in roles or "super_admin" in roles
    is_allowlisted = bool(email and email in allowlist)

    if not has_admin_role and not is_allowlisted:
         raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_optional),
):
    """
    Returns the user if a valid token is provided, otherwise None.
    """
    if not credentials:
        return None
    return await verify_user(credentials)
