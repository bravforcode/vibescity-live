from slowapi import Limiter
from slowapi.util import get_remote_address

# slowapi will try to auto-load ".env" (system-default encoding) when present.
# On Windows dev machines, UTF-8 .env files containing Thai can crash imports.
# We don't rely on slowapi's Config for app settings, so point it at a safe file.
limiter = Limiter(key_func=get_remote_address, config_filename="backend/.env.slowapi")
