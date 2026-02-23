# osm_sync_ultimate.py
"""
🇹🇭 VibeCity OSM Ultimate Sync — Enterprise Realtime (D-mode)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
D-mode heatmap strategy:
  (A) Inventory base: derived from Redis H3 index per tile (worker computes)
  (B) Activity rolling windows: 15m / 1h (worker computes from event buckets)
  (C) User density overlay: user:h3:density ZSET (worker merges)
  => tile-based invalidate triggers fast cache rebuild per tile

✅ Features:
- Tile-based bbox Overpass queries (z/x/y)
- Incremental best-effort: newer:"timestamp" per tile (auto fallback)
- Diff-based upsert (content_hash + osm_version + osm_timestamp)
- DB dedupe by unique(osm_type, legacy_shop_id)
- Redis Streams:
    venues:created / venues:updated
    heatmap:invalidate (tile-based)
- Scheduler:
    osm:tiles:priority / osm:tiles:next_run / osm:tiles:last_sync / osm:tiles:activity
- Prewarm tiles from user density (user:h3:density -> tile activity boost)

Env required:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  REDIS_URL (cloud ok)

Optional tuning:
  H3_RESOLUTION (default 9)
  TILE_Z (default 10)
  WORKERS (default 6)
  TILE_MIN_INTERVAL_SEC (default 120)    # 2 min
  TILE_MAX_INTERVAL_SEC (default 7200)   # 2 hr
  DENSITY_TOPK (default 3000)
  DENSITY_BOOST_WEIGHT (default 2.0)
"""

import os
import sys
import time
import json
import math
import hashlib
import random
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import requests
import redis
import h3
from supabase import create_client, Client
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed


# -----------------------------
# Logging
# -----------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("vibecity-osm-sync")


# -----------------------------
# Utils
# -----------------------------
def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def iso_now() -> str:
    return utc_now().isoformat()

def normalize_name(name: str) -> str:
    return "".join(c.lower() for c in name if c.isalnum())

def parse_osm_timestamp(ts: Any) -> Optional[str]:
    if not ts:
        return None
    try:
        s = str(ts).replace("Z", "+00:00")
        return datetime.fromisoformat(s).isoformat()
    except Exception:
        return None

def compute_content_hash(
    name: str,
    category: str,
    lat: float,
    lon: float,
    open_time: Optional[str],
    vibe: Optional[str],
) -> str:
    base = f"{normalize_name(name)}|{category}|{lat:.6f}|{lon:.6f}|{open_time or ''}|{(vibe or '')[:160]}"
    return hashlib.md5(base.encode("utf-8")).hexdigest()


# -----------------------------
# Config
# -----------------------------
class Config:
    def __init__(self):
        load_dotenv()

        self.SUPABASE_URL = os.getenv("SUPABASE_URL", "")
        self.SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

        self.REDIS_URL = os.getenv("REDIS_URL", "")
        env_name = os.getenv("ENV", "").strip().lower()
        ci_mode = os.getenv("CI", "").strip().lower() == "true"
        default_allow_fake_redis = "false" if ci_mode or env_name == "production" else "true"
        self.ALLOW_FAKE_REDIS = (
            os.getenv("ALLOW_FAKE_REDIS", default_allow_fake_redis).strip().lower()
            in ("1", "true", "yes", "on")
        )

        self.OVERPASS_URLS = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.nchc.org.tw/api/interpreter",
        ]
        self.OVERPASS_TIMEOUT = int(os.getenv("OVERPASS_TIMEOUT", "180"))
        self.MAX_RETRIES = int(os.getenv("MAX_RETRIES", "6"))

        self.H3_RESOLUTION = int(os.getenv("H3_RESOLUTION", "9"))
        self.TILE_Z = int(os.getenv("TILE_Z", "10"))

        # Thailand bounds (approx)
        self.TH_MIN_LAT = float(os.getenv("TH_MIN_LAT", "5.5"))
        self.TH_MAX_LAT = float(os.getenv("TH_MAX_LAT", "20.8"))
        self.TH_MIN_LON = float(os.getenv("TH_MIN_LON", "97.0"))
        self.TH_MAX_LON = float(os.getenv("TH_MAX_LON", "106.0"))

        self.WORKERS = int(os.getenv("WORKERS", "6"))
        self.TILE_MIN_INTERVAL_SEC = int(os.getenv("TILE_MIN_INTERVAL_SEC", "120"))   # faster realtime
        self.TILE_MAX_INTERVAL_SEC = int(os.getenv("TILE_MAX_INTERVAL_SEC", "7200"))

        # Density
        self.USER_HEX_DENSITY_ZSET = os.getenv("USER_HEX_DENSITY_ZSET", "user:h3:density")
        self.DENSITY_TOPK = int(os.getenv("DENSITY_TOPK", "3000"))
        self.DENSITY_BOOST_WEIGHT = float(os.getenv("DENSITY_BOOST_WEIGHT", "2.0"))

        # Redis keys (scheduler)
        self.Z_TILES_PRIORITY = "osm:tiles:priority"
        self.Z_TILES_NEXT_RUN = "osm:tiles:next_run"
        self.H_TILE_LASTSYNC = "osm:tiles:last_sync"
        self.Z_TILES_ACTIVITY = "osm:tiles:activity"

        # Streams
        self.STREAM_CREATED = "venues:created"
        self.STREAM_UPDATED = "venues:updated"
        self.STREAM_HEATMAP_INVALIDATE = "heatmap:invalidate"
        # Keep Redis Streams bounded; unlimited streams will OOM small Redis plans.
        self.STREAM_MAXLEN = int(os.getenv("STREAM_MAXLEN", "20000"))

    def validate(self):
        if not self.SUPABASE_URL or not self.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        if not self.REDIS_URL:
            raise RuntimeError("Missing REDIS_URL (use Redis Cloud url in .env)")


conf = Config()

REQUIRED_VENUES_COLUMNS = (
    "id",
    "name",
    "category",
    "location",
    "province",
    "status",
    "source",
    "vibe_info",
    "open_time",
    "social_links",
    "legacy_shop_id",
    "osm_type",
    "h3_cell",
    "content_hash",
    "source_hash",
    "osm_version",
    "osm_timestamp",
    "last_seen_at",
    "last_osm_sync",
)


# -----------------------------
# Tag mapping
# -----------------------------
TAG_MAPPING = {
    "amenity": {
        "restaurant": "Restaurant",
        "cafe": "Cafe",
        "bar": "Nightlife",
        "pub": "Nightlife",
        "nightclub": "Nightlife",
        "fast_food": "Food",
        "food_court": "Food",
        "cinema": "Entertainment",
        "theatre": "Entertainment",
        "arts_centre": "Art",
        "library": "Culture",
        "community_centre": "Community",
    },
    "leisure": {
        "park": "Nature",
        "garden": "Nature",
        "museum": "Culture",
        "sports_centre": "Sports",
        "fitness_centre": "Fitness",
        "playground": "Family",
    },
    "tourism": {
        "museum": "Culture",
        "artwork": "Art",
        "gallery": "Art",
        "theme_park": "Entertainment",
        "zoo": "Family",
        "aquarium": "Family",
        "viewpoint": "Landmark",
        "attraction": "Landmark",
        "hotel": "Accommodation",
        "hostel": "Accommodation",
    },
    "shop": {
        "mall": "Mall",
        "department_store": "Mall",
        "supermarket": "Shop",
        "convenience": "Shop",
        "clothes": "Fashion",
        "books": "Culture",
        "electronics": "Tech",
    },
}

def map_category(tags: Dict[str, Any]) -> str:
    for key, mapping in TAG_MAPPING.items():
        v = tags.get(key)
        if v and v in mapping:
            return mapping[v]
    return "Uncategorized"


# -----------------------------
# Slippy tile math
# -----------------------------
def lon2tilex(lon: float, z: int) -> int:
    return int((lon + 180.0) / 360.0 * (2 ** z))

def lat2tiley(lat: float, z: int) -> int:
    lat_rad = math.radians(lat)
    return int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * (2 ** z))

def tilex2lon(x: int, z: int) -> float:
    return x / (2 ** z) * 360.0 - 180.0

def tiley2lat(y: int, z: int) -> float:
    n = math.pi - 2.0 * math.pi * y / (2 ** z)
    return math.degrees(math.atan(math.sinh(n)))

def tile_bbox(z: int, x: int, y: int) -> Tuple[float, float, float, float]:
    west = tilex2lon(x, z)
    east = tilex2lon(x + 1, z)
    north = tiley2lat(y, z)
    south = tiley2lat(y + 1, z)
    return (south, west, north, east)

@dataclass(frozen=True)
class TileID:
    z: int
    x: int
    y: int
    def str(self) -> str:
        return f"{self.z}/{self.x}/{self.y}"

def generate_thailand_tiles() -> List[TileID]:
    z = conf.TILE_Z
    x_min = lon2tilex(conf.TH_MIN_LON, z)
    x_max = lon2tilex(conf.TH_MAX_LON, z)
    y_min = lat2tiley(conf.TH_MAX_LAT, z)
    y_max = lat2tiley(conf.TH_MIN_LAT, z)

    tiles: List[TileID] = []
    for x in range(min(x_min, x_max), max(x_min, x_max) + 1):
        for y in range(min(y_min, y_max), max(y_min, y_max) + 1):
            tiles.append(TileID(z=z, x=x, y=y))

    logger.info(f"🧩 Tiles generated for Thailand @z={z}: {len(tiles)}")
    return tiles


# -----------------------------
# Overpass query
# -----------------------------
def build_bbox_query(s: float, w: float, n: float, e: float, newer_iso: Optional[str]) -> str:
    tags_ql = ""
    for key, values in TAG_MAPPING.items():
        osm_vals = "|".join(values.keys())
        if newer_iso:
            tags_ql += f'node["{key}"~"^({osm_vals})$"]({s},{w},{n},{e})(newer:"{newer_iso}");'
            tags_ql += f'way["{key}"~"^({osm_vals})$"]({s},{w},{n},{e})(newer:"{newer_iso}");'
        else:
            tags_ql += f'node["{key}"~"^({osm_vals})$"]({s},{w},{n},{e});'
            tags_ql += f'way["{key}"~"^({osm_vals})$"]({s},{w},{n},{e});'

    return f"""
[out:json][timeout:{conf.OVERPASS_TIMEOUT}];
(
  {tags_ql}
);
out center meta;
"""

def fetch_overpass_bbox(s: float, w: float, n: float, e: float, newer_iso: Optional[str], session: Optional[requests.Session] = None) -> List[Dict[str, Any]]:
    query = build_bbox_query(s, w, n, e, newer_iso)
    urls = conf.OVERPASS_URLS[:]
    random.shuffle(urls)

    last_err = None
    for attempt in range(1, conf.MAX_RETRIES + 1):
        url = urls[(attempt - 1) % len(urls)]
        try:
            req_kwargs = {"data": {"data": query}, "timeout": conf.OVERPASS_TIMEOUT}
            if session:
                resp = session.post(url, **req_kwargs)
            else:
                resp = requests.post(url, **req_kwargs)

            # overload / temporary
            if resp.status_code in (429, 502, 503, 504):
                raise requests.HTTPError(f"{resp.status_code} overload")
            # some endpoints reject newer
            if newer_iso and resp.status_code == 400:
                raise ValueError("newer rejected by endpoint")

            resp.raise_for_status()
            return resp.json().get("elements", [])

        except Exception as e:
            last_err = e
            backoff = min((2 ** (attempt - 1)) * 1.5, 60.0) + random.uniform(0, 1.0)
            time.sleep(backoff)

    # fail: return empty list (caller will gate missing-detection etc.)
    logger.warning(f"⚠️ Overpass failed: {last_err}")
    return []


# -----------------------------
# Transform
# -----------------------------
@dataclass
class ProcessedVenue:
    key: Tuple[str, int]  # (osm_type, legacy_shop_id)
    record: Dict[str, Any]
    content_hash: str
    osm_version: int
    osm_timestamp: Optional[str]
    h3_cell: str
    tile: str

def transform_element(el: Dict[str, Any], tile_id: str) -> Optional[ProcessedVenue]:
    tags = el.get("tags", {})
    osm_id = el.get("id")
    osm_type = el.get("type") or "node"

    lat = el.get("lat") or el.get("center", {}).get("lat")
    lon = el.get("lon") or el.get("center", {}).get("lon")
    if lat is None or lon is None:
        return None

    name = tags.get("name:th") or tags.get("name:en") or tags.get("name")
    if not name or len(name) > 250:
        return None

    category = map_category(tags)
    h3_cell = h3.latlng_to_cell(float(lat), float(lon), conf.H3_RESOLUTION)

    vibe_info = tags.get("cuisine") or tags.get("description")
    open_time = tags.get("opening_hours")

    content_hash = compute_content_hash(name, category, float(lat), float(lon), open_time, vibe_info)
    source_hash = content_hash[:16]

    osm_version = int(el.get("version", 0) or 0)
    osm_timestamp = parse_osm_timestamp(el.get("timestamp"))

    now_iso = iso_now()
    province = tags.get("addr:province") or "Thailand"

    record = {
        # schema fields that exist
        "name": name,
        "category": category,
        "location": f"SRID=4326;POINT({lon} {lat})",
        "province": province[:32],
        "status": "active",
        "source": "osm",
        "vibe_info": vibe_info,
        "open_time": open_time,
        "social_links": {
            "website": tags.get("website"),
            "facebook": tags.get("contact:facebook"),
            "phone": tags.get("phone"),
        },
        "legacy_shop_id": int(osm_id),
        "osm_type": osm_type,
        "h3_cell": h3_cell,
        "content_hash": content_hash,
        "source_hash": source_hash,
        "osm_version": osm_version,
        "osm_timestamp": osm_timestamp,
        "last_seen_at": now_iso,
        "last_osm_sync": now_iso,
    }

    return ProcessedVenue(
        key=(osm_type, int(osm_id)),
        record=record,
        content_hash=content_hash,
        osm_version=osm_version,
        osm_timestamp=osm_timestamp,
        h3_cell=h3_cell,
        tile=tile_id,
    )


# -----------------------------
# Redis + Supabase Managers
# -----------------------------
class EventBus:
    def __init__(self, r: redis.Redis):
        self.r = r

    def publish(self, stream: str, payload: Dict[str, Any]) -> None:
        self.publish_batch(stream, [payload])

    def publish_batch(self, stream: str, payloads: List[Dict[str, Any]]) -> None:
        if not payloads:
            return
        pipe = self.r.pipeline()
        for p in payloads:
            msg = {}
            for k, v in p.items():
                if isinstance(v, (dict, list)):
                    msg[k] = json.dumps(v, ensure_ascii=False)
                elif v is None:
                    msg[k] = ""
                else:
                    msg[k] = str(v)
            pipe.xadd(stream, msg)
        # Prevent unbounded streams from filling Redis memory (common cause of OutOfMemoryError).
        if getattr(conf, "STREAM_MAXLEN", 0):
            pipe.xtrim(stream, maxlen=conf.STREAM_MAXLEN, approximate=True)
        pipe.execute()

class Scheduler:
    def __init__(self, r: redis.Redis):
        self.r = r

    def init_tiles(self, tiles: List[TileID]) -> None:
        now_ts = time.time()
        pipe = self.r.pipeline()
        for t in tiles:
            tid = t.str()
            pipe.zadd(conf.Z_TILES_PRIORITY, {tid: 1.0})
            pipe.zadd(conf.Z_TILES_NEXT_RUN, {tid: now_ts})
            pipe.hsetnx(conf.H_TILE_LASTSYNC, tid, "")
        pipe.execute()

    def ensure_initialized(self, tiles: List[TileID]) -> None:
        if self.r.zcard(conf.Z_TILES_PRIORITY) == 0:
            logger.info("🧠 Scheduler init...")
            self.init_tiles(tiles)

    def get_last_sync_iso(self, tid: str) -> Optional[str]:
        v = self.r.hget(conf.H_TILE_LASTSYNC, tid)
        return v or None

    def set_last_sync_iso(self, tid: str, iso: str) -> None:
        self.r.hset(conf.H_TILE_LASTSYNC, tid, iso)

    def pick_due_tiles(self, k: int) -> List[str]:
        now_ts = time.time()
        due = self.r.zrangebyscore(conf.Z_TILES_NEXT_RUN, 0, now_ts, start=0, num=max(k * 10, 50))
        if not due:
            return []

        scored = []
        for tid in due:
            base = float(self.r.zscore(conf.Z_TILES_PRIORITY, tid) or 1.0)
            act = float(self.r.zscore(conf.Z_TILES_ACTIVITY, tid) or 0.0)
            score = base + (act * 10.0)
            scored.append((score, tid))

        scored.sort(reverse=True, key=lambda x: x[0])
        return [t for _, t in scored[:k]]

    def compute_next_interval(self, tid: str) -> int:
        act = float(self.r.zscore(conf.Z_TILES_ACTIVITY, tid) or 0.0)
        interval = int(conf.TILE_MAX_INTERVAL_SEC / (1.0 + min(act, 60.0)))
        interval = max(conf.TILE_MIN_INTERVAL_SEC, min(interval, conf.TILE_MAX_INTERVAL_SEC))
        return interval

    def schedule_next(self, tid: str, success: bool) -> None:
        interval = self.compute_next_interval(tid)
        if not success:
            interval = min(max(60, conf.TILE_MIN_INTERVAL_SEC), 300)  # quicker retry but bounded
        self.r.zadd(conf.Z_TILES_NEXT_RUN, {tid: time.time() + interval})


class DBManager:
    def __init__(self, sb: Client):
        self.sb = sb

    def validate_required_columns(self) -> None:
        """Fail fast when venues contract does not include required OSM columns."""
        try:
            self.sb.table("venues").select(",".join(REQUIRED_VENUES_COLUMNS)).limit(1).execute()
        except Exception as e:
            raise RuntimeError(
                "Missing required public.venues columns for OSM sync. "
                f"Expected columns: {', '.join(REQUIRED_VENUES_COLUMNS)}"
            ) from e

    def fetch_existing(self, type_id_pairs: List[Tuple[str, int]]) -> Dict[Tuple[str, int], Dict[str, Any]]:
        if not type_id_pairs:
            return {}

        ids = list(set([pid for _, pid in type_id_pairs]))
        out: Dict[Tuple[str, int], Dict[str, Any]] = {}
        chunk = 1000

        for i in range(0, len(ids), chunk):
            part = ids[i:i + chunk]
            res = (
                self.sb.table("venues")
                .select("id,osm_type,legacy_shop_id,content_hash,osm_version,osm_timestamp,h3_cell")
                .in_("legacy_shop_id", part)
                .execute()
            )
            for row in (res.data or []):
                k = ((row.get("osm_type") or "node"), int(row.get("legacy_shop_id")))
                out[k] = row
        return out

    def upsert(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not records:
            return []
        out_rows: List[Dict[str, Any]] = []
        chunk = 1000  # optimize: larger batches for fewer HTTP roundtrips
        for i in range(0, len(records), chunk):
            part = records[i:i + chunk]
            res = (
                self.sb.table("venues")
                .upsert(part, on_conflict="osm_type,legacy_shop_id")
                # .select() removed as it is not supported on upsert() builder in current lib version
                .execute()
            )
            if res.data:
                out_rows.extend(res.data)
        return out_rows

    def touch_unchanged(self, venue_ids: List[str]) -> None:
        """
        Optional: if you created RPC bulk_touch_venues(venue_ids uuid[])
        This will keep last_seen_at fresh without upserting unchanged.
        If RPC does not exist -> fallback to doing nothing (safe).
        """
        if not venue_ids:
            return
        try:
            # expects: create function bulk_touch_venues(venue_ids uuid[]) returns void
            self.sb.rpc("bulk_touch_venues", {"venue_ids": venue_ids}).execute()
        except Exception:
            # safe fallback
            return


# -----------------------------
# Density -> prewarm tiles (enterprise)
# -----------------------------
class DensityPrewarmer:
    def __init__(self, r: redis.Redis):
        self.r = r

    def prewarm(self) -> None:
        dens = self.r.zrevrange(conf.USER_HEX_DENSITY_ZSET, 0, conf.DENSITY_TOPK - 1, withscores=True)
        if not dens:
            return

        z = conf.TILE_Z
        pipe = self.r.pipeline()
        boosted = 0
        for cell, score in dens:
            try:
                lat, lon = h3.cell_to_latlng(cell)
            except Exception:
                continue
            x = lon2tilex(lon, z)
            y = lat2tiley(lat, z)
            tid = f"{z}/{x}/{y}"

            boost = float(score) * conf.DENSITY_BOOST_WEIGHT
            pipe.zincrby(conf.Z_TILES_ACTIVITY, boost, tid)
            # schedule immediate run if not already due soon
            pipe.zadd(conf.Z_TILES_NEXT_RUN, {tid: time.time()})
            boosted += 1

        pipe.execute()
        logger.info(f"🧲 Prewarm tiles from density | h3_cells={len(dens)} boosted~={boosted}")


# -----------------------------
# Main App
# -----------------------------
def connect_redis_with_scheme_fallback(redis_url: str) -> redis.Redis:
    """
    Connect to Redis and auto-retry with swapped URL scheme when TLS mode is mismatched.
    This keeps scheduled jobs resilient to redis:// vs rediss:// configuration drift.
    """
    candidates = [redis_url]
    if redis_url.startswith("rediss://"):
        candidates.append(f"redis://{redis_url[len('rediss://'):]}")
    elif redis_url.startswith("redis://"):
        candidates.append(f"rediss://{redis_url[len('redis://'):]}")

    last_error: Exception | None = None
    for idx, candidate in enumerate(candidates):
        try:
            client = redis.from_url(candidate, decode_responses=True)
            client.ping()
            if candidate != redis_url:
                logger.warning(f"⚠️ Redis connected using fallback URL scheme: {candidate.split(':', 1)[0]}://")
            return client
        except Exception as exc:
            last_error = exc
            is_ssl_mismatch = "WRONG_VERSION_NUMBER" in str(exc)
            has_next = idx < len(candidates) - 1
            if has_next:
                if is_ssl_mismatch:
                    logger.warning(
                        "⚠️ Redis SSL mismatch detected; retrying with alternate URL scheme."
                    )
                else:
                    logger.warning(
                        f"⚠️ Redis connect attempt failed ({exc}); retrying alternate URL scheme."
                    )

    if last_error:
        raise last_error
    raise RuntimeError("Redis connection failed before any candidate URL was attempted.")


class UltimateSync:
    def __init__(self):
        conf.validate()

        try:
            self.redis = connect_redis_with_scheme_fallback(conf.REDIS_URL)
            logger.info("🔌 Connected to Real Redis")
        except Exception as e:
            if not conf.ALLOW_FAKE_REDIS:
                raise RuntimeError(
                    f"Redis connection failed and ALLOW_FAKE_REDIS=false: {e}"
                ) from e
            logger.warning(f"⚠️ Real Redis failed ({e}). Falling back to fakeredis.")
            try:
                import fakeredis
                logger.warning("⚠️ Using vanilla FakeRedis (ignoring REDIS_URL credentials) for local testing.")
                self.redis = fakeredis.FakeRedis(decode_responses=True)
            except ImportError:
                logger.error("❌ Redis unavailable and fakeredis not installed.")
                raise e

        self.sb = create_client(conf.SUPABASE_URL, conf.SUPABASE_SERVICE_ROLE_KEY)
        self.db = DBManager(self.sb)
        self.db.validate_required_columns()

        self.bus = EventBus(self.redis)
        self.scheduler = Scheduler(self.redis)
        self.prewarmer = DensityPrewarmer(self.redis)

        # Persistent HTTP session for Overpass
        self.session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=conf.WORKERS, pool_maxsize=conf.WORKERS, max_retries=1)
        self.session.mount("https://", adapter)

        self.tiles = generate_thailand_tiles()
        self.scheduler.ensure_initialized(self.tiles)

    @staticmethod
    def _new_summary(mode: str, iterations: int) -> Dict[str, Any]:
        return {
            "mode": mode,
            "iterations": iterations,
            "tiles_processed": 0,
            "tiles_failed": 0,
            "created": 0,
            "updated": 0,
            "unchanged": 0,
            "elements": 0,
            "incoming": 0,
        }

    @staticmethod
    def _apply_summary(summary: Dict[str, Any], result: Dict[str, Any]) -> None:
        summary["tiles_processed"] += 1
        if not result.get("ok"):
            summary["tiles_failed"] += 1
            return
        summary["created"] += int(result.get("created", 0))
        summary["updated"] += int(result.get("updated", 0))
        summary["unchanged"] += int(result.get("unchanged", 0))
        summary["elements"] += int(result.get("elements", 0))
        summary["incoming"] += int(result.get("incoming", 0))

    def sync_tile(self, tid: str, full: bool) -> Dict[str, Any]:
        started = utc_now()

        try:
            z, x, y = map(int, tid.split("/"))
            s, w, n, e = tile_bbox(z, x, y)

            newer_iso = None if full else self.scheduler.get_last_sync_iso(tid)

            elements: List[Dict[str, Any]] = []
            used_newer = False

            if newer_iso:
                elements = fetch_overpass_bbox(s, w, n, e, newer_iso=newer_iso, session=self.session)
                used_newer = True
                # fallback if endpoint rejected newer or returned suspicious empty while older has data:
                if elements == []:
                    # fallback to non-newer to reduce missed changes
                    elements = fetch_overpass_bbox(s, w, n, e, newer_iso=None, session=self.session)
                    used_newer = False
            else:
                elements = fetch_overpass_bbox(s, w, n, e, newer_iso=None, session=self.session)

            # Transform
            incoming: List[ProcessedVenue] = []
            keys: List[Tuple[str, int]] = []
            for el in elements:
                pv = transform_element(el, tid)
                if pv:
                    incoming.append(pv)
                    keys.append(pv.key)

            # Existing
            existing = self.db.fetch_existing(keys)

            # Diff
            upserts: List[Dict[str, Any]] = []
            unchanged_ids: List[str] = []
            action_by_key: Dict[Tuple[str, int], str] = {}

            for pv in incoming:
                old = existing.get(pv.key)
                if not old:
                    action_by_key[pv.key] = "created"
                    upserts.append(pv.record)
                    continue

                old_hash = old.get("content_hash") or ""
                old_ver = old.get("osm_version")
                old_ts = old.get("osm_timestamp")

                changed = False
                if pv.osm_version and old_ver and int(pv.osm_version) != int(old_ver):
                    changed = True
                elif pv.osm_timestamp and old_ts and str(pv.osm_timestamp) != str(old_ts):
                    changed = True
                elif pv.content_hash != old_hash:
                    changed = True

                if changed:
                    action_by_key[pv.key] = "updated"
                    upserts.append(pv.record)
                else:
                    action_by_key[pv.key] = "unchanged"
                    if old.get("id"):
                        unchanged_ids.append(old["id"])

            # Write
            upserted_rows = self.db.upsert(upserts)
            self.db.touch_unchanged(unchanged_ids)

            # Build final uuid map
            uuid_map: Dict[Tuple[str, int], str] = {}
            for k, row in existing.items():
                if row.get("id"):
                    uuid_map[k] = row["id"]
            for row in upserted_rows:
                uuid_map[(row["osm_type"], int(row["legacy_shop_id"]))] = row["id"]

            created = 0
            updated = 0

            # Publish events (created/updated) and tile-based heatmap invalidate
            created_payloads = []
            updated_payloads = []

            for pv in incoming:
                act = action_by_key.get(pv.key, "unchanged")
                if act not in ("created", "updated"):
                    continue

                venue_id = uuid_map.get(pv.key)
                if not venue_id:
                    continue

                payload = {
                    "type": act,
                    "venue_id": venue_id,
                    "osm_type": pv.key[0],
                    "legacy_shop_id": pv.key[1],
                    "h3_cell": pv.h3_cell,
                    "tile": tid,
                    "ts": iso_now(),
                }

                if act == "created":
                    created += 1
                    created_payloads.append(payload)
                else:
                    updated += 1
                    updated_payloads.append(payload)

            # Pipeline publish
            if created_payloads:
                self.bus.publish_batch(conf.STREAM_CREATED, created_payloads)
            if updated_payloads:
                self.bus.publish_batch(conf.STREAM_UPDATED, updated_payloads)

            # 🔥 Tile-based invalidate (ละเอียดมาก + เร็ว)
            # Worker จะ rebuild heatmap cache เฉพาะ tile นี้
            self.bus.publish(conf.STREAM_HEATMAP_INVALIDATE, {
                "type": "invalidate_tile",
                "tile": tid,
                "bbox": {"s": s, "w": w, "n": n, "e": e},
                "ts": iso_now(),
            })

            # Update scheduler
            self.scheduler.set_last_sync_iso(tid, iso_now())
            self.scheduler.schedule_next(tid, success=True)

            elapsed = (utc_now() - started).total_seconds()
            return {
                "tile": tid,
                "ok": True,
                "created": created,
                "updated": updated,
                "unchanged": len(unchanged_ids),
                "elements": len(elements),
                "incoming": len(incoming),
                "used_newer": used_newer,
                "elapsed_s": round(elapsed, 2),
            }

        except Exception as e:
            self.scheduler.schedule_next(tid, success=False)
            return {"tile": tid, "ok": False, "error": str(e)}

    def run_full(self) -> Dict[str, Any]:
        logger.info("🚀 FULL SYNC START (all tiles)")
        self.prewarmer.prewarm()
        summary = self._new_summary(mode="full", iterations=1)

        with ThreadPoolExecutor(max_workers=conf.WORKERS) as ex:
            futures = [ex.submit(self.sync_tile, t.str(), True) for t in self.tiles]
            for f in as_completed(futures):
                r = f.result()
                self._apply_summary(summary, r)
                if r.get("ok"):
                    logger.info(f"✅ {r['tile']} | +{r['created']} ~{r['updated']} ={r['unchanged']} | {r['elapsed_s']}s")
                else:
                    logger.warning(f"❌ {r['tile']} | {r.get('error')}")

        logger.info("🏁 FULL SYNC DONE")
        summary["ok"] = summary["tiles_failed"] == 0
        logger.info("OSM_SYNC_SUMMARY=%s", json.dumps(summary, ensure_ascii=False, sort_keys=True))
        return summary

    def run_loop(self, iterations: int) -> Dict[str, Any]:
        logger.info(f"⚡ INCREMENTAL LOOP START | iterations={iterations} workers={conf.WORKERS}")
        summary = self._new_summary(mode="loop", iterations=iterations)
        for i in range(iterations):
            # prewarm every tick
            self.prewarmer.prewarm()

            due = self.scheduler.pick_due_tiles(k=max(conf.WORKERS * 2, 10))
            if not due:
                time.sleep(2)
                continue

            logger.info(f"🔁 tick {i+1}/{iterations} | tiles={len(due)}")
            with ThreadPoolExecutor(max_workers=conf.WORKERS) as ex:
                futures = [ex.submit(self.sync_tile, tid, False) for tid in due]
                for f in as_completed(futures):
                    r = f.result()
                    self._apply_summary(summary, r)
                    if r.get("ok"):
                        logger.info(f"✅ {r['tile']} | +{r['created']} ~{r['updated']} ={r['unchanged']} | newer={r['used_newer']}")
                    else:
                        logger.warning(f"❌ {r['tile']} | {r.get('error')}")

        logger.info("🏁 LOOP DONE")
        summary["ok"] = summary["tiles_failed"] == 0
        logger.info("OSM_SYNC_SUMMARY=%s", json.dumps(summary, ensure_ascii=False, sort_keys=True))
        return summary


def main():
    # Windows emoji safety
    if sys.platform.startswith("win"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    app = UltimateSync()

    if "--full" in sys.argv:
        app.run_full()
        return

    loop_n = 1
    for a in sys.argv:
        if a.startswith("--loop="):
            try:
                loop_n = int(a.split("=", 1)[1])
            except Exception:
                loop_n = 1

    app.run_loop(loop_n)


if __name__ == "__main__":
    main()
