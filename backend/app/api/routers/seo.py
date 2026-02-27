from __future__ import annotations

import io
import re
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from PIL import Image, ImageDraw, ImageOps

from app.core.supabase import supabase

router = APIRouter()

SHORT_CODE_RE = re.compile(r"^[A-Z2-7]{7}$")
SUPPORTED_LOCALES = {"th", "en"}
DEFAULT_LOCALE = "th"


def _normalize_locale(raw: str | None) -> str | None:
    if not raw:
        return None
    value = str(raw).strip().lower()
    if value in SUPPORTED_LOCALES:
        return value
    return None


def _detect_country(request: Request) -> str:
    return (
        request.headers.get("x-vercel-ip-country")
        or request.headers.get("cf-ipcountry")
        or ""
    ).strip().upper()


def _detect_locale(request: Request) -> str:
    cookie_locale = _normalize_locale(request.cookies.get("vibe_locale"))
    if cookie_locale:
        return cookie_locale

    country = _detect_country(request)
    if country == "TH":
        return "th"
    if country:
        return "en"
    return DEFAULT_LOCALE


def _with_locale_prefix(path: str, locale: str) -> str:
    safe_path = path if path.startswith("/") else f"/{path}"
    if safe_path in ("/", ""):
        return f"/{locale}"
    if safe_path.startswith(f"/{locale}/") or safe_path == f"/{locale}":
        return safe_path
    return f"/{locale}{safe_path}"


def _set_locale_cookie(response: Response, locale: str) -> None:
    # Keep cookie readable for Edge redirects and client routing.
    response.set_cookie(
        key="vibe_locale",
        value=locale,
        max_age=60 * 60 * 24 * 365,
        path="/",
        samesite="lax",
    )

def _pick_cover_url(row: dict) -> str | None:
    image_urls = row.get("image_urls") or []
    if isinstance(image_urls, list) and image_urls:
        first = image_urls[0]
        if isinstance(first, str) and first.strip():
            return first.strip()

    # Legacy fallbacks (some environments still use quoted CSV-style columns)
    for key in ("Image_URL1", "image_url_1", "image_url"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return None


async def _fetch_image_bytes(url: str, max_bytes: int = 5_000_000) -> bytes:
    timeout = httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", url, headers={"User-Agent": "VibeCityBot/1.0"}) as resp:
            resp.raise_for_status()
            chunks = []
            total = 0
            async for chunk in resp.aiter_bytes():
                if not chunk:
                    continue
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("image too large")
                chunks.append(chunk)
            return b"".join(chunks)


def _render_fallback_png(title: str) -> bytes:
    # Simple branded fallback (no external font deps).
    img = Image.new("RGB", (1200, 630), (11, 11, 18))
    draw = ImageDraw.Draw(img)

    # Accent bars
    draw.rectangle([0, 0, 1200, 18], fill=(34, 211, 238))  # cyan
    draw.rectangle([0, 612, 1200, 630], fill=(59, 130, 246))  # blue

    safe_title = (title or "VibeCity").strip()
    if len(safe_title) > 80:
        safe_title = safe_title[:79] + "…"

    draw.text((48, 72), "VibeCity", fill=(255, 255, 255))
    draw.text((48, 120), safe_title, fill=(210, 210, 210))

    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _fit_to_og(img: Image.Image) -> Image.Image:
    # Normalize + crop to 1200x630.
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    if img.mode == "RGBA":
        # Composite on dark background to avoid transparent PNGs looking bad.
        bg = Image.new("RGB", img.size, (11, 11, 18))
        bg.paste(img, mask=img.split()[-1])
        img = bg

    return ImageOps.fit(img, (1200, 630), method=Image.Resampling.LANCZOS)


@router.get("/og/venue/{slug}.png")
async def og_venue(slug: str):
    """
    Dynamic OG image for venue pages.
    Returns a 1200x630 PNG (cropped from the venue cover image when available).
    """
    safe_slug = (slug or "").strip().lower()
    if not safe_slug:
        raise HTTPException(status_code=400, detail="Missing slug")

    try:
        # Use public client (RLS applies). Slug should be unique by DB constraint.
        result = (
            supabase.table("venues")
            .select("name,slug,image_urls,Image_URL1")
            .eq("slug", safe_slug)
            .limit(1)
            .execute()
        )
        rows = getattr(result, "data", None) or []
        row = rows[0] if rows else None
        if not row:
            raise HTTPException(status_code=404, detail="Venue not found")

        cover_url = _pick_cover_url(row)
        if cover_url and cover_url.startswith(("http://", "https://")):
            try:
                raw = await _fetch_image_bytes(cover_url)
                img = Image.open(io.BytesIO(raw))
                img = _fit_to_og(img)
                out = io.BytesIO()
                img.save(out, format="PNG", optimize=True)
                png = out.getvalue()
            except Exception:
                png = _render_fallback_png(row.get("name") or "VibeCity")
        else:
            png = _render_fallback_png(row.get("name") or "VibeCity")

        return Response(
            content=png,
            media_type="image/png",
            headers={
                # Cache for a day; slug changes should redirect, and images can be refreshed later.
                "Cache-Control": "public, max-age=86400",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/og/site.png")
async def og_site():
    """
    Default OG image for the site (1200x630 PNG).
    """
    png = _render_fallback_png("Chiang Mai Entertainment Map")
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )


@router.get("/redirect/root")
async def redirect_root(request: Request):
    """
    Root redirect to locale path (/th or /en).
    Public-only; does not handle admin/api/callback routes.
    """
    locale = _detect_locale(request)
    target = _with_locale_prefix("/", locale)
    response = RedirectResponse(
        url=target,
        status_code=301,
        headers={
            "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60",
            "Vary": "Cookie, X-Vercel-IP-Country, CF-IPCountry",
        },
    )
    _set_locale_cookie(response, locale)
    return response


@router.get("/redirect/public")
async def redirect_public(
    request: Request,
    path: str = Query("/", min_length=1, max_length=512),
):
    """
    Public-only redirect for legacy paths to locale-aware URLs.
    """
    safe_path = str(path or "/").strip()
    if not safe_path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    # Block non-public routes.
    if (
        safe_path.startswith("/admin")
        or safe_path.startswith("/api")
        or safe_path.startswith("/callback")
    ):
        raise HTTPException(status_code=404, detail="Not found")

    allowed_prefixes = ("/v/", "/venue/", "/c/", "/privacy", "/terms", "/")
    if not any(safe_path == p or safe_path.startswith(p) for p in allowed_prefixes):
        raise HTTPException(status_code=404, detail="Not found")

    locale = _detect_locale(request)
    target = _with_locale_prefix(safe_path, locale)
    response = RedirectResponse(
        url=target,
        status_code=301,
        headers={
            "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60",
            "Vary": "Cookie, X-Vercel-IP-Country, CF-IPCountry",
        },
    )
    _set_locale_cookie(response, locale)
    return response


@router.get("/redirect/venue/{code}")
async def redirect_venue_short_code(request: Request, code: str):
    """
    Server-side canonical redirect for /v/<CODE> -> /v/<slug>.
    Accepts uppercase Base32 7-char codes only to avoid slug collisions.
    """
    normalized = (code or "").strip().upper()
    if not SHORT_CODE_RE.match(normalized):
        raise HTTPException(status_code=404, detail="Short code not found")

    try:
        result = (
            supabase.table("venues_public")
            .select("slug")
            .eq("short_code", normalized)
            .limit(1)
            .execute()
        )
        rows = getattr(result, "data", None) or []
        row = rows[0] if rows else None
        slug = (row or {}).get("slug")
        if not slug:
            raise HTTPException(status_code=404, detail="Venue not found")

        locale = _detect_locale(request)
        target = _with_locale_prefix(f"/v/{quote(str(slug).strip())}", locale)
        response = RedirectResponse(
            url=target,
            status_code=301,
            headers={
                # Edge-cache friendly (Vercel honors s-maxage).
                "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=300",
                "Vary": "Cookie, X-Vercel-IP-Country, CF-IPCountry",
            },
        )
        _set_locale_cookie(response, locale)
        return response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
