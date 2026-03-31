"""
Phase 2: Gamification endpoints.
SAFE-01: All claim endpoints are IP-hash rate-limited.
"""
import hashlib
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.rate_limit import limiter
from app.core.supabase import supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter()


class ClaimRequest(BaseModel):
    venue_id: str = Field(..., max_length=100)
    visitor_id: str = Field(..., max_length=100)


def _extract_ip(req: Request) -> str:
    forwarded = req.headers.get("x-forwarded-for") or ""
    real_ip = req.headers.get("x-real-ip") or ""
    candidate = forwarded or real_ip
    if not candidate:
        return ""
    return candidate.split(",")[0].strip()


def _hash_ip(ip: str) -> str:
    if not ip:
        return ""
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


@router.post("/claim")
@limiter.limit("20/hour")
async def claim_vibe(request: Request, body: ClaimRequest):
    """
    Claim a venue vibe. Awards coins if not already claimed today.
    Rate limited to 20/hour per IP (SAFE-01).
    Uses 20/hour (not 5/hour) to accommodate NAT/shared-IP environments
    (hotels, cafes) per research pitfall #6.
    """
    if not supabase_admin:
        raise HTTPException(status_code=503, detail="Database not configured")

    ip_address = _extract_ip(request)
    ip_hash = _hash_ip(ip_address)

    logger.info(
        "claim_vibe_attempt",
        extra={
            "visitor_id": body.visitor_id[:8] + "...",  # truncate for privacy
            "venue_id": body.venue_id,
            "ip_hash": ip_hash[:16] + "..." if ip_hash else "",
        },
    )

    try:
        result = supabase_admin.rpc(
            "claim_vibe",
            {"p_visitor_id": body.visitor_id, "p_venue_id": body.venue_id},
        ).execute()
    except Exception as e:
        logger.error("claim_vibe_rpc_failed", extra={"error": str(e)})
        raise HTTPException(status_code=500, detail="Claim service unavailable") from e

    if not result.data:
        raise HTTPException(status_code=500, detail="Empty RPC response")

    return result.data


@router.get("/my-claims")
@limiter.limit("30/minute")
async def get_my_claims(request: Request, visitor_id: str):
    """
    Get venue IDs claimed today by this visitor + current balance.
    Used on page load for MAP-02 glow ring and GAME-06 coin sync.
    """
    if not supabase_admin:
        raise HTTPException(status_code=503, detail="Database not configured")

    if not visitor_id or len(visitor_id) > 100:
        raise HTTPException(status_code=400, detail="Invalid visitor_id")

    try:
        result = supabase_admin.rpc(
            "get_my_claims",
            {"p_visitor_id": visitor_id},
        ).execute()
    except Exception as e:
        logger.error("get_my_claims_failed", extra={"error": str(e)})
        raise HTTPException(status_code=500, detail="Claims service unavailable") from e

    if not result.data:
        return {"venue_ids": [], "balance": 0}

    return result.data
