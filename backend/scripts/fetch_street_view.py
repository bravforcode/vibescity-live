import asyncio
import logging

import httpx

from app.core.config import settings
from app.core.supabase import supabase_admin as supabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("scripts.fetch_street_view")

GOOGLE_STREETVIEW_URL = "https://maps.googleapis.com/maps/api/streetview"

async def fetch_street_view_for_venues():
    api_key = settings.GOOGLE_MAPS_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        logger.error("GOOGLE_MAPS_API_KEY or GOOGLE_API_KEY is not set. Skipping...")
        return

    # 1. Fetch venues that don't have storefront_image_url
    try:
        response = supabase.table("venues") \
            .select("id, latitude, longitude") \
            .is_("storefront_image_url", "null") \
            .is_("deleted_at", "null") \
            .execute()
        
        venues = response.data or []
        logger.info(f"Found {len(venues)} venues without storefront image.")
    except Exception as e:
        logger.error(f"Error fetching venues: {e}")
        return

    async with httpx.AsyncClient() as client:
        for venue in venues:
            venue_id = venue["id"]
            lat = venue.get("latitude")
            lng = venue.get("longitude")

            if lat is None or lng is None:
                continue

            # 2. Construct Google Street View URL
            # size=640x480 is standard, fov=90 for wide angle
            # 3. Check if Street View is available (Metadata API is free)
            metadata_url = f"{GOOGLE_STREETVIEW_URL}/metadata"
            try:
                # Add retry logic and rate limit handling for Enterprise stability
                for attempt in range(3):
                    meta_resp = await client.get(metadata_url, params={"location": f"{lat},{lng}", "key": api_key})
                    meta_data = meta_resp.json()
                    
                    if meta_data.get("status") == "OVER_QUERY_LIMIT":
                        logger.error("❌ Google Street View API Quota Exceeded. Stopping backfill.")
                        return
                    elif meta_data.get("status") == "OK":
                        break
                    elif meta_data.get("status") == "ZERO_RESULTS":
                        logger.info(f"ℹ️ No Street View found for venue {venue_id}. Skipping.")
                        break
                    else:
                        logger.warning(f"⚠️ Unexpected status {meta_data.get('status')} for {venue_id}. Retrying...")
                        await asyncio.sleep(1 * (attempt + 1))
                else:
                    logger.warning(f"❌ Failed to get valid metadata for {venue_id} after 3 attempts.")
                    continue
                    
                if meta_data.get("status") != "OK":
                    continue

            except Exception as e:
                logger.error(f"Error checking metadata for {venue_id}: {e}")
                continue

            # 4. Use the Street View URL as fallback
            # We don't download it to save storage, just use Google's signed URL or public URL
            street_view_url = f"{GOOGLE_STREETVIEW_URL}?size=640x480&location={lat},{lng}&key={api_key}"
            
            try:
                supabase.table("venues").update({
                    "storefront_image_url": street_view_url,
                    "storefront_image_metadata": {
                        "source": "google_streetview",
                        "updated_at": "now()",
                        "status": "auto_generated"
                    }
                }).eq("id", venue_id).execute()
                logger.info(f"Updated storefront for venue {venue_id}")
            except Exception as e:
                logger.error(f"Error updating venue {venue_id}: {e}")

            # Sleep to respect rate limits if needed
            await asyncio.sleep(0.1)

if __name__ == "__main__":
    asyncio.run(fetch_street_view_for_venues())
