from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class ShopService:
    def __init__(self):
        self.supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    def get_all_shops(self):
        try:
            # Try fetching from Supabase
            if settings.SUPABASE_URL and "your-project" not in settings.SUPABASE_URL:
                response = self.supabase.table("shops").select("*").execute()
                return response.data
            else:
                return self._get_mock_shops()
        except Exception as e:
            logger.error(f"Error fetching shops: {e}")
            return self._get_mock_shops()

    def get_shop_by_id(self, shop_id: int):
        try:
            if settings.SUPABASE_URL and "your-project" not in settings.SUPABASE_URL:
                response = self.supabase.table("shops").select("*").eq("id", shop_id).execute()
                if response.data:
                    return response.data[0]

            # Fallback
            shops = self._get_mock_shops()
            return next((s for s in shops if s["id"] == shop_id), None)
        except Exception as e:
            logger.error(f"Error fetching shop {shop_id}: {e}")
            return None

    def _get_mock_shops(self):
        return [
            {"id": 1, "name": "Vibe Verify Cafe", "lat": 18.7883, "lng": 98.9853, "category": "Cafe"},
            {"id": 2, "name": "Neon Night Club", "lat": 18.7900, "lng": 98.9900, "category": "Club"}
        ]

shop_service = ShopService()
