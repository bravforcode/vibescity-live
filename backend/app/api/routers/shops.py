import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.auth import get_optional_user
from app.core.rate_limit import limiter
from app.core.supabase import supabase, supabase_admin
from app.core.visitor_auth import require_valid_visitor
from app.services.cache.redis_client import get_redis
from app.services.shop_service import shop_service

logger = logging.getLogger("app.shops")

router = APIRouter()
REVIEW_SELECT_CANDIDATES = (
	"id,venue_id,rating,comment,user_name,user_id,visitor_id,status,metadata,created_at",
	"id,venue_id,rating,comment,user_name,user_id,visitor_id,status,created_at",
	"id,venue_id,rating,content,user_id,visitor_id,status,metadata,created_at",
	"id,venue_id,rating,content,user_id,visitor_id,status,created_at",
	"id,venue_id,rating,comment,user_name,created_at",
	"id,venue_id,rating,content,created_at",
)
HIDDEN_REVIEW_STATUSES = {"flagged", "rejected", "deleted"}


class ReviewCreatePayload(BaseModel):
    rating: float | None = Field(default=None, ge=0, le=5)
    comment: str = Field(default="", max_length=500)
    userName: str | None = Field(default=None, max_length=80)


class ReviewReportPayload(BaseModel):
    reason: str | None = Field(default="reported_from_ui", max_length=200)


def _normalize_review_row(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "venue_id": row.get("venue_id"),
        "rating": row.get("rating"),
        "comment": row.get("comment") or row.get("content") or "",
        "userName": row.get("user_name") or row.get("userName") or "Vibe Explorer",
        "user_id": row.get("user_id"),
        "visitor_id": row.get("visitor_id"),
        "status": row.get("status") or "approved",
        "created_at": row.get("created_at"),
    }


def _reviews_db():
    return supabase_admin or supabase


def _fetch_review_rows(db, shop_id: str, limit: int) -> list[dict]:
    last_error = None
    for select_columns in REVIEW_SELECT_CANDIDATES:
        try:
            response = (
                db.table("reviews")
                .select(select_columns)
                .eq("venue_id", shop_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = response.data or []
            return [
                row
                for row in rows
                if str(row.get("status") or "approved").strip().lower()
                not in HIDDEN_REVIEW_STATUSES
            ]
        except Exception as exc:  # pragma: no cover - defensive fallback
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
    user_id: str | None = None,
    visitor_id: str | None = None,
) -> dict:
    primary_insert = {
        "venue_id": shop_id,
        "rating": rating,
        "comment": comment,
        "user_name": user_name,
    }
    if user_id:
        primary_insert["user_id"] = user_id
    if visitor_id:
        primary_insert["visitor_id"] = visitor_id
    fallback_insert = {
        "venue_id": shop_id,
        "rating": rating,
        "content": comment,
    }
    if user_id:
        fallback_insert["user_id"] = user_id
    if visitor_id:
        fallback_insert["visitor_id"] = visitor_id
    attempts = (
        (primary_insert, REVIEW_SELECT_CANDIDATES[0]),
        (fallback_insert, REVIEW_SELECT_CANDIDATES[2]),
        (
            {
                "venue_id": shop_id,
                "rating": rating,
                "comment": comment,
                "user_name": user_name,
            },
            REVIEW_SELECT_CANDIDATES[4],
        ),
        (
            {
                "venue_id": shop_id,
                "rating": rating,
                "content": comment,
            },
            REVIEW_SELECT_CANDIDATES[5],
        ),
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
        except Exception as exc:  # pragma: no cover - defensive fallback
            last_error = exc
    if last_error:
        raise last_error
    return primary_insert


def _fetch_review_row(db, shop_id: str, review_id: str) -> dict | None:
    last_error = None
    for select_columns in REVIEW_SELECT_CANDIDATES:
        try:
            response = (
                db.table("reviews")
                .select(select_columns)
                .eq("venue_id", shop_id)
                .eq("id", review_id)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            return rows[0] if rows else None
        except Exception as exc:  # pragma: no cover - defensive fallback
            last_error = exc
    if last_error:
        raise last_error
    return None


def _resolve_review_actor(
    user,
    x_visitor_id: str | None,
    x_visitor_token: str | None,
    *,
    require_actor: bool,
) -> dict[str, str | None]:
    actor_user_id = str(getattr(user, "id", "") or "").strip() or None
    actor_visitor_id = None
    if x_visitor_id:
        if x_visitor_token:
            actor_visitor_id = require_valid_visitor(x_visitor_id, x_visitor_token)
        elif require_actor:
            raise HTTPException(status_code=401, detail="Authentication required")
    if require_actor and not actor_user_id and not actor_visitor_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return {
        "user_id": actor_user_id,
        "visitor_id": actor_visitor_id,
    }


def _review_matches_actor(row: dict, actor: dict[str, str | None]) -> bool:
    row_user_id = str(row.get("user_id") or "").strip()
    row_visitor_id = str(row.get("visitor_id") or "").strip()
    if actor.get("user_id") and row_user_id == str(actor["user_id"]).strip():
        return True
    if actor.get("visitor_id") and row_visitor_id == str(actor["visitor_id"]).strip():
        return True
    return False


def _update_review_with_fallbacks(
    db,
    *,
    shop_id: str,
    review_id: str,
    payloads: list[dict],
) -> dict | None:
    last_error = None
    for payload in payloads:
        try:
            (
                db.table("reviews")
                .update(payload)
                .eq("venue_id", shop_id)
                .eq("id", review_id)
                .execute()
            )
            return _fetch_review_row(db, shop_id, review_id)
        except Exception as exc:  # pragma: no cover - defensive fallback
            last_error = exc
    if last_error:
        raise last_error
    return None


def _coerce_review_metadata(value: object) -> dict:
    return value if isinstance(value, dict) else {}

@router.get("/", response_model=list[dict])
@limiter.limit("60/minute")
async def read_shops(
    request: Request,
    limit: int = Query(default=500, ge=1, le=2000),
):
    """
    Retrieve all shops.
    """
    data = shop_service.get_all_shops(limit=limit)
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
        rows = _fetch_review_rows(db, shop_id, limit)
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
    user=Depends(get_optional_user),
    x_visitor_id: str | None = Header(default=None, alias="X-Visitor-Id"),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
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
    actor = _resolve_review_actor(
        user,
        x_visitor_id,
        x_visitor_token,
        require_actor=False,
    )

    try:
        created = _insert_review_row(
            db=db,
            shop_id=shop_id,
            rating=payload.rating if has_rating else None,
            comment=comment,
            user_name=normalized_user,
            user_id=actor["user_id"],
            visitor_id=actor["visitor_id"],
        )
        # Invalidate cached review data for this venue
        try:
            get_redis().delete(f"reviews:{shop_id}")
        except Exception:
            pass
        return _normalize_review_row(created)
    except Exception:
        logger.exception("create_review_error", extra={"shop_id": shop_id})
        raise HTTPException(status_code=500, detail="Failed to create review")


@router.delete("/{shop_id}/reviews/{review_id}", response_model=dict)
@limiter.limit("30/minute")
async def delete_shop_review(
    request: Request,
    shop_id: str,
    review_id: str,
    user=Depends(get_optional_user),
    x_visitor_id: str | None = Header(default=None, alias="X-Visitor-Id"),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    db = _reviews_db()
    actor = _resolve_review_actor(
        user,
        x_visitor_id,
        x_visitor_token,
        require_actor=True,
    )

    try:
        existing = _fetch_review_row(db, shop_id, review_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Review not found")
        if not _review_matches_actor(existing, actor):
            raise HTTPException(status_code=403, detail="Review ownership mismatch")

        try:
            deleted = _update_review_with_fallbacks(
                db,
                shop_id=shop_id,
                review_id=review_id,
                payloads=[
                    {"status": "deleted"},
                    {"status": "deleted", "comment": "[deleted]"},
                    {"status": "deleted", "content": "[deleted]"},
                ],
            )
        except Exception:
            deleted = None
        if deleted is None:
            (
                db.table("reviews")
                .delete()
                .eq("venue_id", shop_id)
                .eq("id", review_id)
                .execute()
            )
        try:
            get_redis().delete(f"reviews:{shop_id}")
        except Exception:
            pass
        return {
            "success": True,
            "review": _normalize_review_row(deleted or existing),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "delete_review_error",
            extra={"shop_id": shop_id, "review_id": review_id},
        )
        raise HTTPException(status_code=500, detail="Failed to delete review")


@router.post("/{shop_id}/reviews/{review_id}/report", response_model=dict)
@limiter.limit("20/minute")
async def report_shop_review(
    request: Request,
    shop_id: str,
    review_id: str,
    payload: ReviewReportPayload,
    user=Depends(get_optional_user),
    x_visitor_id: str | None = Header(default=None, alias="X-Visitor-Id"),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    db = _reviews_db()
    actor = _resolve_review_actor(
        user,
        x_visitor_id,
        x_visitor_token,
        require_actor=True,
    )

    try:
        existing = _fetch_review_row(db, shop_id, review_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Review not found")
        if _review_matches_actor(existing, actor):
            raise HTTPException(
                status_code=400,
                detail="Use delete to remove your own review",
            )

        metadata = {
            **_coerce_review_metadata(existing.get("metadata")),
            "report_reason": str(payload.reason or "reported_from_ui"),
            "reported_by_user_id": actor["user_id"],
            "reported_by_visitor_id": actor["visitor_id"],
        }
        updated = _update_review_with_fallbacks(
            db,
            shop_id=shop_id,
            review_id=review_id,
            payloads=[
                {"status": "flagged", "metadata": metadata},
                {"status": "flagged"},
                {"metadata": metadata},
            ],
        )
        if updated is None:
            raise HTTPException(status_code=500, detail="Failed to report review")
        try:
            get_redis().delete(f"reviews:{shop_id}")
        except Exception:
            pass
        return {
            "success": True,
            "review": _normalize_review_row(updated),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "report_review_error",
            extra={"shop_id": shop_id, "review_id": review_id},
        )
        raise HTTPException(status_code=500, detail="Failed to report review")
