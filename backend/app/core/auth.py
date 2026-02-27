from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.supabase import supabase

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)
settings = get_settings()


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

async def verify_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verifies the JWT token using Supabase Auth.
    Returns the user object if valid, raises 401 otherwise.
    """
    token = credentials.credentials
    try:
        # Get user details from Supabase (validates token)
        response = supabase.auth.get_user(token)

        if not response or not response.user:
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return response.user

    except Exception:
         # print(f"Auth Error: {e}")
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
