import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.rate_limit import limiter
from app.core.supabase import supabase, supabase_admin

logger = logging.getLogger("app.media")

router = APIRouter()


def _normalize_url(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    if text.startswith(("http://", "https://", "/")):
        return text
    return ""


def _append_media(items: list[dict], seen: set[str], media_type: str, url: str, source: str):
    normalized = _normalize_url(url)
    if not normalized or normalized in seen:
        return
    seen.add(normalized)
    items.append(
        {
            "type": media_type,
            "url": normalized,
            "source": source,
        }
    )


async def _fetch_venue_media_row(venue_id: str) -> dict:
    client = supabase_admin or supabase
    if client is None:
        return {}

    def _run():
        return (
            client.table("venues")
            .select("id,image_urls,video_url")
            .eq("id", venue_id)
            .limit(1)
            .execute()
        )

    try:
        response = await asyncio.to_thread(_run)
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning("Failed to fetch venue media row for %s: %s", venue_id, exc)
        return {}
    rows = response.data or []
    return rows[0] if rows else {}


async def _fetch_video_candidates(venue_id: str) -> list[dict]:
    client = supabase_admin or supabase
    if client is None:
        return []

    def _run():
        return (
            client.table("venue_video_candidates")
            .select("video_url,status,confidence_score")
            .eq("venue_id", venue_id)
            .order("confidence_score", desc=True)
            .limit(5)
            .execute()
        )

    try:
        response = await asyncio.to_thread(_run)
    except Exception as exc:  # pragma: no cover - optional table/compat fallback
        logger.debug("Video candidates unavailable for %s: %s", venue_id, exc)
        return []
    return list(response.data or [])


@router.options("/{venue_id}/real")
async def media_real_options(venue_id: str):
    """
    Handle CORS preflight requests for real media endpoint.
    """
    return JSONResponse(
        content={},
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Visitor-Id, X-Visitor-Token, X-Admin-Secret",
        },
    )


@router.get("/{venue_id}/real")
@limiter.limit("60/minute")
async def get_real_venue_media(request: Request, venue_id: str):
    """
    Retrieve real venue media (photos and videos) from scraped sources.
    
    This endpoint returns actual venue media content to replace AI-generated placeholders.
    CORS is configured to allow frontend origins to access this endpoint.
    """
    logger.info("Real media requested for venue_id=%s", venue_id)

    venue_row, candidate_rows = await asyncio.gather(
        _fetch_venue_media_row(venue_id),
        _fetch_video_candidates(venue_id),
    )

    items: list[dict] = []
    seen: set[str] = set()

    for row in candidate_rows:
        status = str(row.get("status") or "").strip().lower()
        if status not in {"approved", "applied"}:
            continue
        _append_media(
            items,
            seen,
            "video",
            row.get("video_url"),
            "venue_video_candidates",
        )

    _append_media(
        items,
        seen,
        "video",
        venue_row.get("video_url"),
        "venues.video_url",
    )

    for image_url in venue_row.get("image_urls") or []:
        _append_media(items, seen, "image", image_url, "venues.image_urls")

    return JSONResponse(
        content=items,
        headers={
            "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=300"
        },
    )
