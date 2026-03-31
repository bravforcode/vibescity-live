import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# slowapi will try to auto-load ".env" (system-default encoding) when present.
# On Windows dev machines, UTF-8 .env files containing Thai can crash imports.
# We don't rely on slowapi's Config for app settings, so point it at a safe file.

# H3: Use Redis for distributed rate limiting so limits apply across multiple workers.
# Falls back to in-memory if REDIS_URL is not set (single-process dev mode).
_redis_url = os.environ.get("REDIS_URL", "")
_limiter_kwargs: dict = {"key_func": get_remote_address, "config_filename": "backend/.env.slowapi"}
if _redis_url:
    _limiter_kwargs["storage_uri"] = _redis_url

limiter = Limiter(**_limiter_kwargs)
