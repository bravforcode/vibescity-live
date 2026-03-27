from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from urllib.parse import urlsplit, urlunsplit

from postgrest import APIError

from app.core.supabase import supabase, supabase_admin

logger = logging.getLogger("app.shop_media")


class VenueMediaService:
    _VENUE_SELECT_PRIMARY = (
        'id,name,slug,category,status,province,district,latitude,longitude,'
        'image_urls,"Image_URL1","Image_URL2",image_url_1,image_url_2,'
        'video_url,"Video_URL",cinematic_video_url,ig_url,fb_url,tiktok_url,social_links'
    )
    _VENUE_SELECT_FALLBACK = (
        'id,name,slug,category,status,province,district,latitude,longitude,'
        'image_urls,"Image_URL1","Image_URL2",video_url,"Video_URL",'
        'ig_url,fb_url,tiktok_url,social_links'
    )
    _VENUE_TABLES = ("venues", "shops")
    _IMAGE_SOURCE_KEYS = (
        ("Image_URL1", "venues.Image_URL1"),
        ("Image_URL2", "venues.Image_URL2"),
        ("image_url_1", "venues.image_url_1"),
        ("image_url_2", "venues.image_url_2"),
        ("image_url", "venues.image_url"),
        ("cover_image", "venues.cover_image"),
    )
    _VIDEO_SOURCE_KEYS = (
        ("video_url", "venues.video_url"),
        ("Video_URL", "venues.Video_URL"),
        ("cinematic_video_url", "venues.cinematic_video_url"),
        ("video", "venues.video"),
    )
    def __init__(self, client=None):
        self.client = client or supabase_admin or supabase

    def _normalize_url(self, value) -> str:
        if value is None:
            return ""
        raw = str(value).strip()
        if not raw:
            return ""
        try:
            parsed = urlsplit(raw)
        except ValueError:
            return ""
        if parsed.scheme not in {"http", "https"}:
            return ""
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))

    def _coerce_float(self, value):
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number

    def _normalize_social_links(self, row: dict) -> dict[str, str]:
        raw = row.get("social_links")
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                raw = {}
        if not isinstance(raw, dict):
            raw = {}

        social = {
            "instagram": self._normalize_url(raw.get("instagram") or row.get("ig_url")),
            "facebook": self._normalize_url(raw.get("facebook") or row.get("fb_url")),
            "tiktok": self._normalize_url(raw.get("tiktok") or row.get("tiktok_url")),
            "website": self._normalize_url(raw.get("website")),
            "youtube": self._normalize_url(raw.get("youtube")),
        }
        return {key: value for key, value in social.items() if value}

    def _normalize_text_list(self, value) -> list[str]:
        if isinstance(value, list):
            return [self._normalize_url(item) for item in value if self._normalize_url(item)]
        if isinstance(value, str):
            normalized = self._normalize_url(value)
            return [normalized] if normalized else []
        return []

    def _is_direct_video_link(self, url: str) -> bool:
        normalized = self._normalize_url(url)
        if not normalized:
            return False
        lowered = normalized.lower()
        if lowered.endswith((".mp4", ".webm", ".ogg", ".mov", ".m3u8")):
            return True

        parsed = urlsplit(normalized)
        host = parsed.netloc.lower().split("@")[-1]
        if host.startswith("www."):
            host = host[4:]
        if host.startswith("m."):
            host = host[2:]

        path = parsed.path.lower().rstrip("/")
        query = parsed.query.lower()

        if host == "youtu.be":
            return bool(path.strip("/"))
        if host == "youtube.com":
            if path == "/watch":
                return "v=" in query
            return path.startswith("/shorts/") or path.startswith("/embed/")
        if host == "instagram.com":
            return (
                path.startswith("/reel/")
                or path.startswith("/reels/")
                or path.startswith("/tv/")
            )
        if host == "tiktok.com":
            return "/video/" in path
        if host == "facebook.com":
            if path == "/watch":
                return "v=" in query
            return path.startswith("/reel/") or "/videos/" in path
        if host == "fb.watch":
            return bool(path.strip("/"))
        if host == "vimeo.com":
            return bool(path.strip("/"))
        return False

    def _append_media_item(
        self,
        items: list[dict],
        seen: set[tuple[str, str]],
        media_type: str,
        url,
        source: str,
    ) -> None:
        normalized = self._normalize_url(url)
        if not normalized:
            return
        key = (media_type, normalized)
        if key in seen:
            return
        seen.add(key)
        items.append(
            {
                "type": media_type,
                "url": normalized,
                "source": source,
                "is_real": True,
            }
        )

    def _fetch_venue_rows(self, shop_id: str | None = None) -> list[dict]:
        if self.client is None:
            return []

        last_error = None
        for table_name in self._VENUE_TABLES:
            for select_columns in (self._VENUE_SELECT_PRIMARY, self._VENUE_SELECT_FALLBACK, "*"):
                try:
                    query = self.client.table(table_name).select(select_columns)
                    if table_name == "venues":
                        query = query.is_("deleted_at", "null")
                    if shop_id is not None:
                        response = query.eq("id", shop_id).limit(1).execute()
                    else:
                        response = query.order("id").execute()
                    data = response.data or []
                    if isinstance(data, dict):
                        return [data]
                    return list(data)
                except APIError as exc:
                    last_error = exc
                    continue
        if last_error:
            logger.warning("shop_media_fetch_failed", extra={"err": str(last_error)})
        return []

    def _fetch_approved_photos(self, venue_ids: list[str]) -> dict[str, list[dict]]:
        if self.client is None or not venue_ids:
            return {}

        sources = (
            ("venue_photos", "venue_id", "image_url", "ugc.venue_photos"),
            ("shop_photos", "shop_id", "url", "ugc.shop_photos"),
        )
        for table_name, foreign_key, url_key, source_name in sources:
            try:
                response = (
                    self.client.table(table_name)
                    .select(f"id,{foreign_key},{url_key},caption,created_at,status")
                    .in_(foreign_key, venue_ids)
                    .eq("status", "approved")
                    .order("created_at", desc=True)
                    .execute()
                )
                grouped: dict[str, list[dict]] = defaultdict(list)
                for row in response.data or []:
                    venue_id = row.get(foreign_key)
                    if venue_id is None:
                        continue
                    grouped[str(venue_id)].append(
                        {
                            "url": row.get(url_key),
                            "caption": row.get("caption"),
                            "created_at": row.get("created_at"),
                            "source": source_name,
                        }
                    )
                return grouped
            except APIError:
                continue
        return {}

    def _build_payload(
        self,
        row: dict,
        photo_rows: list[dict] | None = None,
    ) -> dict:
        photo_rows = photo_rows or []
        media_items: list[dict] = []
        seen: set[tuple[str, str]] = set()

        for image_url in self._normalize_text_list(row.get("image_urls")):
            self._append_media_item(media_items, seen, "image", image_url, "venues.image_urls")

        for key, source in self._IMAGE_SOURCE_KEYS:
            self._append_media_item(media_items, seen, "image", row.get(key), source)

        for photo in photo_rows:
            self._append_media_item(
                media_items,
                seen,
                "image",
                photo.get("url"),
                str(photo.get("source") or "ugc.venue_photos"),
            )

        for key, source in self._VIDEO_SOURCE_KEYS:
            self._append_media_item(media_items, seen, "video", row.get(key), source)

        social_links = self._normalize_social_links(row)
        for platform, url in social_links.items():
            if self._is_direct_video_link(url):
                self._append_media_item(
                    media_items,
                    seen,
                    "video",
                    url,
                    f"social_links.{platform}",
                )

        images = [item["url"] for item in media_items if item["type"] == "image"]
        videos = [item["url"] for item in media_items if item["type"] == "video"]

        return {
            "shop_id": str(row.get("id")),
            "name": row.get("name") or "",
            "slug": row.get("slug") or "",
            "category": row.get("category") or "",
            "status": row.get("status") or "",
            "province": row.get("province") or "",
            "district": row.get("district") or "",
            "latitude": self._coerce_float(row.get("latitude")),
            "longitude": self._coerce_float(row.get("longitude")),
            "images": images,
            "videos": videos,
            "video_url": videos[0] if videos else "",
            "media": media_items,
            "social_links": social_links,
            "counts": {
                "images": len(images),
                "videos": len(videos),
                "total": len(media_items),
            },
            "coverage": {
                "has_images": bool(images),
                "has_videos": bool(videos),
                "has_media": bool(media_items),
                "missing_images": not bool(images),
                "missing_videos": not bool(videos),
            },
        }

    def list_shop_media(
        self,
        *,
        limit: int = 1000,
        offset: int = 0,
        include_missing: bool = True,
    ) -> dict:
        rows = self._fetch_venue_rows()
        venue_ids = [str(row.get("id")) for row in rows if row.get("id") is not None]
        approved_photos = self._fetch_approved_photos(venue_ids)

        payloads = [
            self._build_payload(row, approved_photos.get(str(row.get("id")), []))
            for row in rows
            if row.get("id") is not None
        ]

        if not include_missing:
            payloads = [item for item in payloads if item["coverage"]["has_media"]]

        total = len(payloads)
        sliced = payloads[offset : offset + limit]

        return {
            "data": sliced,
            "pagination": {
                "offset": offset,
                "limit": limit,
                "total": total,
                "returned": len(sliced),
                "has_more": offset + len(sliced) < total,
            },
            "summary": {
                "total_shops": total,
                "shops_with_images": sum(1 for item in payloads if item["coverage"]["has_images"]),
                "shops_with_videos": sum(1 for item in payloads if item["coverage"]["has_videos"]),
                "shops_with_media": sum(1 for item in payloads if item["coverage"]["has_media"]),
            },
        }

    async def get_shop_media(
        self,
        shop_id: str,
        *,
        hydrate_missing_image: bool = False,
    ) -> dict | None:
        rows = await asyncio.to_thread(self._fetch_venue_rows, shop_id)
        if not rows:
            return None

        row = rows[0]
        venue_id = str(row.get("id"))
        approved_photos = await asyncio.to_thread(self._fetch_approved_photos, [venue_id])
        payload = self._build_payload(row, approved_photos.get(venue_id, []))
        # Keep the query flag for backward compatibility, but do not hydrate from
        # external fallbacks. This endpoint is authoritative real media only.
        _ = hydrate_missing_image
        return payload


venue_media_service = VenueMediaService()
