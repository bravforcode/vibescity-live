from typing import Any, Dict, Optional


class VenueRepository:
    """
    Canonical venue access layer.
    Primary source: public.venues
    Compatibility fallback: public.shops (legacy view/table)
    """

    def __init__(self, client):
        self.client = client

    def list_pending(self):
        try:
            return (
                self.client.table("venues")
                .select("*")
                .eq("status", "pending")
                .order("created_at", desc=True)
                .execute()
            )
        except Exception:
            return (
                self.client.table("shops")
                .select("*")
                .eq("status", "pending")
                .order("created_at", desc=True)
                .execute()
            )

    def get_owner(self, venue_id: Any) -> Optional[str]:
        try:
            response = (
                self.client.table("venues")
                .select("owner_id")
                .eq("id", venue_id)
                .single()
                .execute()
            )
            if response and response.data:
                return response.data.get("owner_id")
        except Exception:
            pass

        try:
            response = (
                self.client.table("shops")
                .select("owner_id")
                .eq("id", venue_id)
                .single()
                .execute()
            )
            if response and response.data:
                return response.data.get("owner_id")
        except Exception:
            return None
        return None

    def approve(self, venue_id: Any):
        try:
            return (
                self.client.table("venues")
                .update({"status": "active", "is_verified": True})
                .eq("id", venue_id)
                .execute()
            )
        except Exception:
            return (
                self.client.table("shops")
                .update({"status": "active", "is_verified": True})
                .eq("id", venue_id)
                .execute()
            )

    def reject(self, venue_id: Any, reason: Optional[str] = None):
        payload: Dict[str, Any] = {
            "status": "rejected",
            "metadata": {"rejection_reason": reason},
        }
        try:
            return self.client.table("venues").update(payload).eq("id", venue_id).execute()
        except Exception:
            return self.client.table("shops").update(payload).eq("id", venue_id).execute()
