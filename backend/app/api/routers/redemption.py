from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import verify_user
from app.core.supabase import supabase

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
    except Exception as e:
        print(f"Redemption error: {e}")
        raise HTTPException(500, detail="Transaction failed")
