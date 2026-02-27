from supabase import Client, create_client

from app.core.config import settings

url: str = settings.SUPABASE_URL
key: str = settings.SUPABASE_KEY
service_role: str = settings.SUPABASE_SERVICE_ROLE_KEY

supabase: Client = create_client(url, key)
supabase_admin: Client = create_client(url, service_role) if service_role else None
