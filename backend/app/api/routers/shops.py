
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.rate_limit import limiter
from app.core.supabase import supabase, supabase_admin
from app.services.shop_service import shop_service

router = APIRouter()


class ReviewCreatePayload(BaseModel):
    rating: float | None = Field(default=None, ge=0, le=5)
    comment: str = Field(default="", max_length=500)
    userName: str | None = Field(default=None, max_length=80)


def _normalize_review_row(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "venue_id": row.get("venue_id"),
        "rating": row.get("rating"),
        "comment": row.get("comment") or "",
        "userName": row.get("user_name") or row.get("userName") or "Vibe Explorer",
        "created_at": row.get("created_at"),
    }


def _reviews_db():
    return supabase_admin or supabase

@router.get("/", response_model=list[dict])
@limiter.limit("60/minute")
async def read_shops(request: Request):
    """
    Retrieve all shops.
    """
    data = shop_service.get_all_shops()
    return JSONResponse(
        content=data,
        headers={"Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60"},
    )

@router.get("/{shop_id}", response_model=dict)
@limiter.limit("120/minute")
async def read_shop(request: Request, shop_id: str):
    """
    Retrieve a specific shop by ID.
    """
    shop = shop_service.get_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    return shop


@router.get("/{shop_id}/reviews", response_model=list[dict])
@limiter.limit("90/minute")
async def read_shop_reviews(
    request: Request,
    shop_id: str,
    limit: int = Query(default=50, ge=1, le=100),
):
    """
    Public reviews endpoint (anonymous-safe). Uses service role when available
    to avoid frontend RLS/CORS coupling on direct Supabase REST calls.
    """
    db = _reviews_db()
    try:
        response = (
            db.table("reviews")
            .select("id,venue_id,rating,comment,user_name,created_at")
            .eq("venue_id", shop_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = response.data or []
        return JSONResponse(
            content=[_normalize_review_row(row) for row in rows],
            headers={"Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=30"},
        )
    except Exception:
        # Fail-open for UI smoothness.
        return []


@router.post("/{shop_id}/reviews", response_model=dict)
@limiter.limit("30/minute")
async def create_shop_review(
    request: Request,
    shop_id: str,
    payload: ReviewCreatePayload,
):
    """
    Anonymous review/reaction ingest endpoint.
    """
    comment = str(payload.comment or "").strip()
    has_rating = payload.rating is not None
    if not has_rating and not comment:
        raise HTTPException(status_code=400, detail="Review payload is empty")

    db = _reviews_db()
    insert_row = {
        "venue_id": shop_id,
        "rating": payload.rating if has_rating else None,
        "comment": comment,
        "user_name": str(payload.userName or "Vibe Explorer").strip() or "Vibe Explorer",
    }

    try:
        response = (
            db.table("reviews")
            .insert(insert_row)
            .select("id,venue_id,rating,comment,user_name,created_at")
            .limit(1)
            .execute()
        )
        created = (response.data or [insert_row])[0]
        return _normalize_review_row(created)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create review: {exc}") from exc
