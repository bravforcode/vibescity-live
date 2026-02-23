from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from app.core.supabase import supabase

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

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

    except Exception as e:
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
    role = app_metadata.get("role", "")
    roles = app_metadata.get("roles", [])

    if role != "admin" and "admin" not in roles:
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
