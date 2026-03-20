import logging

from supabase import Client, create_client

from app.core.config import settings

logger = logging.getLogger(__name__)

class ShopService:
    # Columns served to map/feed; excludes heavy/internal fields (no select("*"))
    _VENUE_COLUMNS = (
        "id,name,category,latitude,longitude,province,district,status,"
        "pin_type,rating,review_count,image_urls,Image_URL1,is_verified,"
        "slug,short_code,vibe_info,open_time,metadata,pin_metadata,"
        "boost_until,glow_until,giant_until,verified_until,video_url,"
        "building_id,floor,ig_url,fb_url,tiktok_url"
    )

    def __init__(self):
        self.supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    def get_all_shops(self, limit: int = 500):
        try:
            if not settings.SUPABASE_URL or "your-project" in settings.SUPABASE_URL:
                return []

            response = (
                self.supabase.table("venues")
                .select(self._VENUE_COLUMNS)
                .is_("deleted_at", "null")
                .eq("status", "active")
                .limit(limit)
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error(f"Error fetching shops: {e}")
            return []

    def get_shop_by_id(self, shop_id: int):
        try:
            if not settings.SUPABASE_URL or "your-project" in settings.SUPABASE_URL:
                return None

            response = (
                self.supabase.table("venues")
                .select(self._VENUE_COLUMNS)
                .eq("id", shop_id)
                .is_("deleted_at", "null")
                .limit(1)
                .execute()
            )
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error fetching shop {shop_id}: {e}")
            return None

shop_service = ShopService()
