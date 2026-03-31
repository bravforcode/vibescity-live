
import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from postgrest import APIError
from pydantic import BaseModel, Field

from app.core.rate_limit import limiter
from app.core.supabase import supabase, supabase_admin
from app.services.shop_service import shop_service
from app.services.venue_media_service import venue_media_service

router = APIRouter()
logger = logging.getLogger("app.shops")
REVIEW_SELECT_PRIMARY = "id,venue_id,rating,comment,user_name,created_at"
REVIEW_SELECT_FALLBACK = "id,venue_id,rating,content,user_id,status,created_at"


class ReviewCreatePayload(BaseModel):
    rating: float | None = Field(default=None, ge=0, le=5)
    comment: str = Field(default="", max_length=500)
    userName: str | None = Field(default=None, max_length=80)


def _normalize_review_row(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "venue_id": row.get("venue_id"),
        "rating": row.get("rating"),
        "comment": row.get("comment") or row.get("content") or "",
        "userName": row.get("user_name") or row.get("userName") or "Vibe Explorer",
        "created_at": row.get("created_at"),
    }


def _reviews_db():
    return supabase_admin or supabase


def _fetch_review_rows(db, shop_id: str, limit: int) -> list[dict]:
    last_error = None
    for select_columns in (REVIEW_SELECT_PRIMARY, REVIEW_SELECT_FALLBACK):
        try:
            response = (
                db.table("reviews")
                .select(select_columns)
                .eq("venue_id", shop_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return response.data or []
        except APIError as exc:  # pragma: no cover - defensive fallback
            last_error = exc
    if last_error:
        raise last_error
    return []


def _insert_review_row(
    db,
    shop_id: str,
    rating: float | None,
    comment: str,
    user_name: str,
) -> dict:
    primary_insert = {
        "venue_id": shop_id,
        "rating": rating,
        "comment": comment,
        "user_name": user_name,
    }
    fallback_insert = {
        "venue_id": shop_id,
        "rating": rating,
        "content": comment,
    }
    attempts = (
        (primary_insert, REVIEW_SELECT_PRIMARY),
        (fallback_insert, REVIEW_SELECT_FALLBACK),
    )

    last_error = None
    for payload, select_columns in attempts:
        try:
            response = (
                db.table("reviews")
                .insert(payload)
                .select(select_columns)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            return rows[0] if rows else payload
        except APIError as exc:  # pragma: no cover - defensive fallback
            last_error = exc
    if last_error:
        raise last_error
    return primary_insert

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


@router.get("/media", response_model=dict)
@limiter.limit("30/minute")
async def read_shop_media_index(
    request: Request,
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    include_missing: bool = Query(default=True),
):
    """
    Retrieve normalized real media coverage for all shops.
    """
    payload = await asyncio.to_thread(
        venue_media_service.list_shop_media,
        limit=limit,
        offset=offset,
        include_missing=include_missing,
    )
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60"},
    )


@router.get("/{shop_id}/media", response_model=dict)
@limiter.limit("60/minute")
async def read_shop_media(
    request: Request,
    shop_id: str,
    hydrate_missing_image: bool = Query(default=False),
):
    """
    Retrieve normalized real media for a single shop.
    """
    payload = await venue_media_service.get_shop_media(
        shop_id,
        hydrate_missing_image=hydrate_missing_image,
    )
    if not payload:
        raise HTTPException(status_code=404, detail="Shop media not found")
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=30"},
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
        rows = _fetch_review_rows(db, shop_id, limit)
        return JSONResponse(
            content=[_normalize_review_row(row) for row in rows],
            headers={"Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=30"},
        )
    except APIError as exc:
        logger.warning("shop_reviews_fetch_failed", extra={"shop_id": shop_id, "err": str(exc)})
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
    normalized_user = str(payload.userName or "Vibe Explorer").strip() or "Vibe Explorer"

    try:
        created = _insert_review_row(
            db=db,
            shop_id=shop_id,
            rating=payload.rating if has_rating else None,
            comment=comment,
            user_name=normalized_user,
        )
        return _normalize_review_row(created)
    except APIError as exc:
        logger.error("shop_review_create_failed", extra={"shop_id": shop_id, "err": str(exc)})
        raise HTTPException(status_code=500, detail="Failed to create review") from exc
