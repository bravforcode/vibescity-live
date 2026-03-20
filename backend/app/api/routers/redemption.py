import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import verify_user
from app.core.supabase import supabase, supabase_admin

logger = logging.getLogger("app.redemption")
router = APIRouter()

@router.post("/claim/{coupon_id}")
def claim_coupon(coupon_id: int, user: dict = Depends(verify_user)):
    """
    Claim a coupon. Dedusts coins atomatically.
    """
    try:
        # Call RPC 'redeem_coupon(p_user_id, p_coupon_id)'
        response = supabase.rpc("redeem_coupon", {
            "p_user_id": user.id,
            "p_coupon_id": coupon_id
        }).execute()

        result = response.data

        if not result or not result.get("success"):
            raise HTTPException(400, detail=result.get("error", "Redemption failed"))

        return {
            "success": True,
            "data": result,
            "message": "Coupon redeemed successfully!"
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("redemption_error", extra={"coupon_id": coupon_id})
        raise HTTPException(500, detail="Transaction failed")


@router.get("/history")
def get_redemption_history(
    limit: int = Query(default=5, ge=1, le=25),
    user: dict = Depends(verify_user),
):
    """
    Return recent coupon redemption history for the authenticated user.
    """
    db = supabase_admin or supabase
    try:
        response = (
            db.table("user_coupons")
            .select(
                "id,coupon_id,code,status,redeemed_at,used_at,coupon:coupons(id,title,cost,image_url)"
            )
            .eq("user_id", user.id)
            .order("redeemed_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = response.data or []
        return {
            "success": True,
            "data": [
                {
                    "id": row.get("id"),
                    "coupon_id": row.get("coupon_id"),
                    "code": row.get("code"),
                    "status": row.get("status") or "valid",
                    "redeemed_at": row.get("redeemed_at"),
                    "used_at": row.get("used_at"),
                    "coupon_title": (row.get("coupon") or {}).get("title"),
                    "coupon_cost": (row.get("coupon") or {}).get("cost"),
                    "coupon_image_url": (row.get("coupon") or {}).get("image_url"),
                }
                for row in rows
            ],
        }
    except Exception:
        logger.exception("redemption_history_error", extra={"user_id": user.id})
        raise HTTPException(500, detail="Failed to fetch redemption history")
