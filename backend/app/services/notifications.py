import httpx
from typing import List, Optional
from app.core.config import get_settings

settings = get_settings()

async def send_push_notification(
    user_ids: List[str],
    title: str,
    message: str,
    data: Optional[dict] = None
):
    """
    Send push notification via OneSignal to specific users.
    """
    if not settings.ONESIGNAL_APP_ID or not settings.ONESIGNAL_API_KEY:
        print("⚠️ OneSignal not configured. Skipping notification.")
        return False

    url = "https://onesignal.com/api/v1/notifications"

    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Basic {settings.ONESIGNAL_API_KEY}"
    }

    payload = {
        "app_id": settings.ONESIGNAL_APP_ID,
        "include_external_user_ids": user_ids, # Target by Supabase UUID
        "headings": {"en": title},
        "contents": {"en": message},
        "data": data or {}
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                return True
            else:
                print(f"OneSignal Error: {response.text}")
                return False
        except Exception as e:
            print(f"Notification Exception: {e}")
            return False

async def notify_shop_approved(user_id: str, shop_name: str, coins: int):
    return await send_push_notification(
        user_ids=[user_id],
        title="Shop Approved! 🎉",
        message=f"Your shop '{shop_name}' is live! You earned {coins} coins.",
        data={"type": "shop_approved"}
    )
