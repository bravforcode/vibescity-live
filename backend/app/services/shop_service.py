from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class ShopService:
    def __init__(self):
        self.supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    def get_all_shops(self):
        try:
            if not settings.SUPABASE_URL or "your-project" in settings.SUPABASE_URL:
                return []

            # Canonical source of truth: venues
            response = self.supabase.table("venues").select("*").execute()
            return response.data or []
        except Exception as e:
            logger.error(f"Error fetching shops: {e}")
            return []

    def get_shop_by_id(self, shop_id: int):
        try:
            if not settings.SUPABASE_URL or "your-project" in settings.SUPABASE_URL:
                return None

            response = self.supabase.table("venues").select("*").eq("id", shop_id).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error fetching shop {shop_id}: {e}")
            return None

shop_service = ShopService()
