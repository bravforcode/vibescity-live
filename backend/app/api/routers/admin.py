import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import verify_admin
from app.core.supabase import supabase_admin
from app.services.cache.redis_client import get_redis
from app.services.venue_repository import VenueRepository

logger = logging.getLogger("app.admin")

router = APIRouter()

# --- Schemas ---
class ReviewAction(BaseModel):
    reason: str | None = None


class BulkReviewAction(BaseModel):
    shop_ids: list[str]
    reason: str | None = None


def _normalize_shop_ids(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        shop_id = str(raw or "").strip()
        if not shop_id or shop_id in seen:
            continue
        seen.add(shop_id)
        out.append(shop_id)
    return out


def _ensure_repository() -> VenueRepository:
    if not supabase_admin:
        raise HTTPException(500, "Admin client not configured")
    return VenueRepository(supabase_admin)


def _invalidate_venue_cache() -> None:
    try:
        get_redis().delete("shops:all")
    except Exception:
        pass


async def _approve_shop_internal(repository: VenueRepository, shop_id: str) -> None:
    owner_id = repository.get_owner(shop_id)
    if not owner_id:
        raise HTTPException(404, "Shop not found")

    update_res = repository.approve(shop_id)
    if not update_res.data:
        raise HTTPException(500, "Failed to update shop status")

    if owner_id:
        try:
            supabase_admin.rpc("grant_rewards", {
                "target_user_id": owner_id,
                "reward_coins": 100,
                "reward_xp": 500,
                "action_name": "approve_shop"
            }).execute()

            from app.services.notifications import notify_shop_approved

            await notify_shop_approved(owner_id, shop_name="Your Shop", coins=100)
        except Exception:
            logger.warning("reward_grant_failed", extra={"shop_id": shop_id})

    _invalidate_venue_cache()


async def _reject_shop_internal(
    repository: VenueRepository,
    shop_id: str,
    reason: str | None = None,
) -> None:
    update_res = repository.reject(shop_id, reason)
    if not update_res.data:
        raise HTTPException(500, "Failed to reject shop")
    _invalidate_venue_cache()

# --- Endpoints ---

@router.get("/pending/shops")
async def list_pending_shops(user: dict = Depends(verify_admin)):
    """
    List all shops with status 'pending'.
    """
    try:
        repository = _ensure_repository()
        response = repository.list_pending()

        return {"success": True, "data": response.data}
    except Exception:
        logger.exception("list_pending_shops_error")
        raise HTTPException(500, "Internal error")

@router.post("/shops/{shop_id}/approve")
async def approve_shop(shop_id: str, user: dict = Depends(verify_admin)):
    """
    Approve a shop and award the submitter.
    """
    try:
        repository = _ensure_repository()
        await _approve_shop_internal(repository, shop_id)
        return {"success": True, "message": "Shop approved and rewards granted"}

    except HTTPException:
        raise
    except Exception:
        logger.exception("approve_shop_error", extra={"shop_id": shop_id})
        raise HTTPException(500, "Internal error")

@router.post("/shops/{shop_id}/reject")
async def reject_shop(shop_id: str, action: ReviewAction, user: dict = Depends(verify_admin)):
    """
    Reject a shop.
    """
    try:
        repository = _ensure_repository()
        await _reject_shop_internal(repository, shop_id, action.reason)
        return {"success": True, "message": "Shop rejected"}

    except HTTPException:
        raise
    except Exception:
        logger.exception("reject_shop_error", extra={"shop_id": shop_id})
        raise HTTPException(500, "Internal error")


@router.post("/shops/bulk-approve")
async def bulk_approve_shops(
    action: BulkReviewAction,
    user: dict = Depends(verify_admin),
):
    shop_ids = _normalize_shop_ids(action.shop_ids)
    if not shop_ids:
        raise HTTPException(400, "No shops selected")

    repository = _ensure_repository()
    approved: list[str] = []
    failed: list[dict] = []

    for shop_id in shop_ids:
        try:
            await _approve_shop_internal(repository, shop_id)
            approved.append(shop_id)
        except HTTPException as exc:
            failed.append({"shop_id": shop_id, "error": str(exc.detail)})
        except Exception:
            logger.exception("bulk_approve_shop_error", extra={"shop_id": shop_id})
            failed.append({"shop_id": shop_id, "error": "Internal error"})

    return {
        "success": len(failed) == 0,
        "processed": len(shop_ids),
        "approved": approved,
        "failed": failed,
        "message": f"Approved {len(approved)} of {len(shop_ids)} shops",
    }


@router.post("/shops/bulk-reject")
async def bulk_reject_shops(
    action: BulkReviewAction,
    user: dict = Depends(verify_admin),
):
    shop_ids = _normalize_shop_ids(action.shop_ids)
    if not shop_ids:
        raise HTTPException(400, "No shops selected")

    repository = _ensure_repository()
    rejected: list[str] = []
    failed: list[dict] = []

    for shop_id in shop_ids:
        try:
            await _reject_shop_internal(
                repository,
                shop_id,
                action.reason or "Policy violation",
            )
            rejected.append(shop_id)
        except HTTPException as exc:
            failed.append({"shop_id": shop_id, "error": str(exc.detail)})
        except Exception:
            logger.exception("bulk_reject_shop_error", extra={"shop_id": shop_id})
            failed.append({"shop_id": shop_id, "error": "Internal error"})

    return {
        "success": len(failed) == 0,
        "processed": len(shop_ids),
        "rejected": rejected,
        "failed": failed,
        "message": f"Rejected {len(rejected)} of {len(shop_ids)} shops",
    }
