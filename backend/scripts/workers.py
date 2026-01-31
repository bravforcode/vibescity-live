# workers.py
import os
import sys
import json
import time
import math
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional

from dotenv import load_dotenv
load_dotenv()

import redis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("vibecity-workers-enterprise")


# =========================
# Config
# =========================
class Config:
    REDIS_URL = os.getenv("REDIS_URL", "")
    if not REDIS_URL:
        raise RuntimeError("Missing REDIS_URL in env/.env")

    # Streams
    STREAM_CREATED = "venues:created"
    STREAM_UPDATED = "venues:updated"
    STREAM_HEATMAP_INVALIDATE = "heatmap:invalidate"

    # Groups
    GROUP_ACTIVITY = "heat-activity-group"
    GROUP_INVALIDATE = "heat-invalidate-group"
    GROUP_INDEXER = "indexer-group"
    GROUP_ANALYTICS = "analytics-group"

    # Consumer names
    CONSUMER_ACTIVITY = os.getenv("CONSUMER_ACTIVITY", "heat-activity-1")
    CONSUMER_INVALIDATE = os.getenv("CONSUMER_INVALIDATE", "heat-invalidate-1")
    CONSUMER_INDEXER = os.getenv("CONSUMER_INDEXER", "indexer-1")
    CONSUMER_ANALYTICS = os.getenv("CONSUMER_ANALYTICS", "analytics-1")

    # Rolling windows
    WINDOW_15M_MINUTES = 15
    WINDOW_1H_MINUTES = 60

    # Bucketing
    BUCKET_SEC = 60  # per-minute bucket
    BUCKET_TTL_SEC = int(os.getenv("BUCKET_TTL_SEC", "9000"))  # 2.5h

    # Heatmap cache
    HEATMAP_TILE_TTL_SEC = int(os.getenv("HEATMAP_TILE_TTL_SEC", "120"))  # cache 2 minutes

    # Inventory base derived from Redis H3 index
    # indexer will maintain:
    #   set tile:h3cells:<tile> = {h3_cell}
    #   zset h3:venues:<h3_cell> = {venue_uuid -> timestamp}
    TILE_H3_SET_PREFIX = "tile:h3cells:"
    H3_VENUES_PREFIX = "h3:venues:"

    # User density overlay
    USER_HEX_DENSITY_ZSET = os.getenv("USER_HEX_DENSITY_ZSET", "user:h3:density")

    # D-mode scoring weights (tuneได้)
    W_INV = float(os.getenv("W_INV", "0.40"))
    W_A15 = float(os.getenv("W_A15", "0.35"))
    W_A1H = float(os.getenv("W_A1H", "0.15"))
    W_UD  = float(os.getenv("W_UD",  "0.10"))

    # Safety
    DLQ_PREFIX = "dlq:"  # dlq:<stream>
    MAX_EVENT_BYTES = int(os.getenv("MAX_EVENT_BYTES", "20000"))

    # Prewarm tiles (optional worker mode)
    PREWARM_TOPK = int(os.getenv("PREWARM_TOPK", "2000"))
    PREWARM_ACTIVITY_BOOST = float(os.getenv("PREWARM_ACTIVITY_BOOST", "10.0"))
    # scheduler keys (same as sync)
    Z_TILES_NEXT_RUN = "osm:tiles:next_run"
    Z_TILES_ACTIVITY = "osm:tiles:activity"
    TILE_Z = int(os.getenv("TILE_Z", "10"))


# =========================
# Redis helpers
# =========================
def get_redis() -> redis.Redis:
    try:
        r = redis.from_url(Config.REDIS_URL, decode_responses=True)
        r.ping()
        logger.info(f"🔌 Connected to Real Redis")
        return r
    except Exception as e:
        logger.warning(f"⚠️ Real Redis failed ({e}). Falling back to fakeredis (in-memory).")
        try:
            import fakeredis
            logger.warning("⚠️ Using vanilla FakeRedis (ignoring REDIS_URL credentials) for local testing.")
            return fakeredis.FakeRedis(decode_responses=True)
        except ImportError:
            logger.error("❌ Redis unavailable and fakeredis not installed.")
            raise e

def ensure_group(r: redis.Redis, stream: str, group: str) -> None:
    try:
        r.xgroup_create(stream, group, id="0", mkstream=True)
        logger.info(f"✅ ensure group {group} on {stream}")
    except redis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise

def safe_json_load(s: str) -> Any:
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        return None

def now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()

def minute_bucket(ts: Optional[float] = None) -> int:
    t = ts if ts is not None else now_ts()
    return int(t // Config.BUCKET_SEC)

def bucket_key(tile: str, bucket: int) -> str:
    # hash: heat:bucket:<bucket>:<tile> field=h3_cell value=count
    return f"heat:bucket:{bucket}:{tile}"

def heat_cache_key(tile: str) -> str:
    return f"heatmap:tile:{tile}"

def normalize_log1p(x: float) -> float:
    # stable normalization: 0..1-ish
    return math.log1p(max(0.0, x))

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


# =========================
# Base Consumer
# =========================
class BaseConsumer:
    def __init__(self, r: redis.Redis, stream: str, group: str, name: str):
        self.r = r
        self.stream = stream
        self.group = group
        self.name = name

    def handle(self, event: Dict[str, Any]) -> bool:
        raise NotImplementedError

    def run(self) -> None:
        logger.info(f"🎧 {self.name} listening {self.stream} [{self.group}]")

        while True:
            try:
                resp = self.r.xreadgroup(
                    groupname=self.group,
                    consumername=self.name,
                    streams={self.stream: ">"},
                    count=50,
                    block=5000,
                )
                if not resp:
                    continue

                for _stream_name, messages in resp:
                    for msg_id, fields in messages:
                        try:
                            e = dict(fields)  # decode_responses=True already
                            # simple guard: prevent giant payloads killing worker
                            approx_size = sum(len(str(k)) + len(str(v)) for k, v in e.items())
                            if approx_size > Config.MAX_EVENT_BYTES:
                                raise ValueError(f"event too large: {approx_size} bytes")

                            ok = self.handle(e)
                            if ok:
                                self.r.xack(self.stream, self.group, msg_id)

                        except Exception as ex:
                            logger.error(f"❌ {self.name} failed msg {msg_id}: {ex}")
                            # DLQ
                            try:
                                dlq_stream = f"{Config.DLQ_PREFIX}{self.stream}"
                                self.r.xadd(dlq_stream, {"error": str(ex), "event": json.dumps(fields, ensure_ascii=False)})
                                self.r.xack(self.stream, self.group, msg_id)
                            except Exception:
                                pass

            except Exception as loop_ex:
                logger.error(f"❌ loop error {self.name}: {loop_ex}")
                time.sleep(2)


# =========================
# Analytics (optional)
# =========================
class AnalyticsConsumer(BaseConsumer):
    def handle(self, event: Dict[str, Any]) -> bool:
        etype = event.get("type", "")
        if etype not in ("created", "updated"):
            return True
        province = event.get("province", "Unknown")
        self.r.hincrby("metrics:venues:by_province", province, 1)
        self.r.incr(f"metrics:events:{etype}")
        return True


# =========================
# Indexer (maintain tile->h3 cells + h3->venues)
# =========================
class SpatialIndexerConsumer(BaseConsumer):
    """
    Inputs are events from venues:created/updated
    Fields:
      venue_id, h3_cell, tile, ts
    Maintains:
      ZSET h3:venues:<h3_cell> = {venue_uuid -> last_ts}
      SET  tile:h3cells:<tile> = {h3_cell}
      STR  venue:h3:<venue_uuid> = h3_cell (reverse)
      STR  venue:tile:<venue_uuid> = tile
    """
    def handle(self, event: Dict[str, Any]) -> bool:
        venue_id = event.get("venue_id")
        h3_cell = event.get("h3_cell")
        tile = event.get("tile")
        ts = event.get("ts")

        if not venue_id or not h3_cell or not tile:
            return True

        score = now_ts()

        # remove old cell if moved
        old_cell = self.r.get(f"venue:h3:{venue_id}")
        if old_cell and old_cell != h3_cell:
            self.r.zrem(f"{Config.H3_VENUES_PREFIX}{old_cell}", venue_id)

        pipe = self.r.pipeline()
        pipe.zadd(f"{Config.H3_VENUES_PREFIX}{h3_cell}", {venue_id: score})
        pipe.set(f"venue:h3:{venue_id}", h3_cell, ex=60 * 60 * 24 * 14)
        pipe.set(f"venue:tile:{venue_id}", tile, ex=60 * 60 * 24 * 14)
        pipe.sadd(f"{Config.TILE_H3_SET_PREFIX}{tile}", h3_cell)
        pipe.expire(f"{Config.TILE_H3_SET_PREFIX}{tile}", 60 * 60 * 24 * 14)
        pipe.execute()

        return True


# =========================
# Activity Aggregator (rolling buckets per tile+h3)
# =========================
class ActivityBucketConsumer(BaseConsumer):
    """
    Consumes venues:created and venues:updated and increments per-minute buckets:
      HINCRBY heat:bucket:<minute>:<tile> <h3_cell> +1
    TTL buckets ~ 2.5h so we can build 15m/1h windows fast.
    """
    def handle(self, event: Dict[str, Any]) -> bool:
        etype = event.get("type", "")
        if etype not in ("created", "updated"):
            return True

        tile = event.get("tile")
        cell = event.get("h3_cell")
        if not tile or not cell:
            return True

        b = minute_bucket()
        k = bucket_key(tile, b)

        pipe = self.r.pipeline()
        pipe.hincrby(k, cell, 1)
        pipe.expire(k, Config.BUCKET_TTL_SEC)
        pipe.execute()

        return True


# =========================
# Heatmap Builder (tile-based invalidate)
# =========================
class HeatmapInvalidateConsumer(BaseConsumer):
    """
    On event: heatmap:invalidate
      type=invalidate_tile, tile=..., bbox=..., ts=...
    Build D-mode heatmap cache for that tile:
      inventory = zcard per h3_cell in tile set
      activity_15m = sum last 15 bucket hashes
      activity_1h  = sum last 60 bucket hashes
      user_density = zscore from user:h3:density for cells in tile
      final_score = weighted normalized sum
    Store to:
      heatmap:tile:<tile> (json) TTL=HEATMAP_TILE_TTL_SEC
    """
    def handle(self, event: Dict[str, Any]) -> bool:
        etype = event.get("type", "")
        if etype != "invalidate_tile":
            return True

        tile = event.get("tile")
        if not tile:
            return True

        cache_key = heat_cache_key(tile)

        # Fast path: if cache fresh, skip rebuild
        if self.r.ttl(cache_key) and self.r.ttl(cache_key) > 0:
            return True

        # 1) Get cells for tile
        cells = list(self.r.smembers(f"{Config.TILE_H3_SET_PREFIX}{tile}"))
        if not cells:
            # still store empty
            payload = {"tile": tile, "generated_at": time.time(), "cells": {}, "mode": "D"}
            self.r.setex(cache_key, Config.HEATMAP_TILE_TTL_SEC, json.dumps(payload))
            return True

        # 2) Inventory base
        inv: Dict[str, int] = {}
        pipe = self.r.pipeline()
        for c in cells:
            pipe.zcard(f"{Config.H3_VENUES_PREFIX}{c}")
        inv_counts = pipe.execute()
        for c, cnt in zip(cells, inv_counts):
            inv[c] = int(cnt or 0)

        # 3) Activity rolling buckets
        now_b = minute_bucket()
        a15 = self._sum_buckets(tile, now_b, Config.WINDOW_15M_MINUTES)
        a1h = self._sum_buckets(tile, now_b, Config.WINDOW_1H_MINUTES)

        # 4) User density overlay (only for cells in tile)
        ud: Dict[str, float] = {}
        pipe2 = self.r.pipeline()
        for c in cells:
            pipe2.zscore(Config.USER_HEX_DENSITY_ZSET, c)
        dens_scores = pipe2.execute()
        for c, sc in zip(cells, dens_scores):
            ud[c] = float(sc or 0.0)

        # 5) Normalize + final score
        # Use log1p normalization, then scale by max in tile to stabilize
        inv_n = self._normalize_map(inv)
        a15_n = self._normalize_map(a15)
        a1h_n = self._normalize_map(a1h)
        ud_n = self._normalize_map(ud)

        cells_out: Dict[str, Dict[str, float]] = {}
        for c in cells:
            score = (
                Config.W_INV * inv_n.get(c, 0.0)
                + Config.W_A15 * a15_n.get(c, 0.0)
                + Config.W_A1H * a1h_n.get(c, 0.0)
                + Config.W_UD  * ud_n.get(c, 0.0)
            )
            cells_out[c] = {
                "inv": inv.get(c, 0),
                "a15": a15.get(c, 0),
                "a1h": a1h.get(c, 0),
                "ud": ud.get(c, 0.0),
                "score": round(float(score), 6),
            }

        payload = {
            "tile": tile,
            "generated_at": time.time(),
            "mode": "D",
            "weights": {"inv": Config.W_INV, "a15": Config.W_A15, "a1h": Config.W_A1H, "ud": Config.W_UD},
            "cells": cells_out,
        }

        self.r.setex(cache_key, Config.HEATMAP_TILE_TTL_SEC, json.dumps(payload))
        logger.info(f"🔥 heatmap rebuilt tile={tile} cells={len(cells)} ttl={Config.HEATMAP_TILE_TTL_SEC}s")
        return True

    def _sum_buckets(self, tile: str, now_bucket: int, minutes: int) -> Dict[str, int]:
        agg: Dict[str, int] = {}
        pipe = self.r.pipeline()
        keys = []
        for i in range(minutes):
            b = now_bucket - i
            k = bucket_key(tile, b)
            keys.append(k)
            pipe.hgetall(k)
        rows = pipe.execute()

        for row in rows:
            if not row:
                continue
            for cell, val in row.items():
                try:
                    agg[cell] = agg.get(cell, 0) + int(val)
                except Exception:
                    continue
        return agg

    def _normalize_map(self, m: Dict[str, Any]) -> Dict[str, float]:
        if not m:
            return {}
        # log1p to reduce spikes
        logged = {k: normalize_log1p(float(v)) for k, v in m.items()}
        mx = max(logged.values()) if logged else 1.0
        if mx <= 0:
            mx = 1.0
        return {k: clamp01(v / mx) for k, v in logged.items()}


# =========================
# Prewarm Worker (auto push tiles to run now)
# =========================
class PrewarmTilesWorker:
    """
    Reads top user density h3 cells and:
      - bump osm:tiles:activity
      - set osm:tiles:next_run = now
    This makes sync loop prioritize tiles where users are active.
    """
    def __init__(self, r: redis.Redis):
        self.r = r

    def run_forever(self, sleep_sec: int = 10):
        logger.info("🧲 prewarm worker running...")
        while True:
            try:
                self.tick()
            except Exception as e:
                logger.error(f"prewarm tick error: {e}")
            time.sleep(sleep_sec)

    def tick(self):
        dens = self.r.zrevrange(Config.USER_HEX_DENSITY_ZSET, 0, Config.PREWARM_TOPK - 1, withscores=True)
        if not dens:
            return

        # Convert h3 -> tile using h3_to_geo then your slippy math.
        # To avoid bringing in h3 + heavy math here, we use a shortcut:
        # we require the app to also write "user:tile:density" if you want perfect.
        # BUT we still can infer tile from stored mapping venue:tile etc.
        #
        # Enterprise approach: maintain a second ZSET "user:tile:density".
        # If exists -> use it. else -> do nothing.
        if self.r.exists("user:tile:density"):
            td = self.r.zrevrange("user:tile:density", 0, 5000, withscores=True)
            pipe = self.r.pipeline()
            for tid, score in td:
                pipe.zincrby(Config.Z_TILES_ACTIVITY, float(score) * Config.PREWARM_ACTIVITY_BOOST, tid)
                pipe.zadd(Config.Z_TILES_NEXT_RUN, {tid: time.time()})
            pipe.execute()
            logger.info(f"🧲 prewarm from user:tile:density tiles={len(td)}")
        else:
            # safe no-op
            return


# =========================
# main
# =========================
def main():
    # Windows emoji safety
    if sys.platform.startswith("win"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    r = get_redis()

    # Ensure groups
    ensure_group(r, Config.STREAM_CREATED, Config.GROUP_INDEXER)
    ensure_group(r, Config.STREAM_UPDATED, Config.GROUP_INDEXER)

    ensure_group(r, Config.STREAM_CREATED, Config.GROUP_ACTIVITY)
    ensure_group(r, Config.STREAM_UPDATED, Config.GROUP_ACTIVITY)

    ensure_group(r, Config.STREAM_HEATMAP_INVALIDATE, Config.GROUP_INVALIDATE)

    # Consumers
    mode = sys.argv[1] if len(sys.argv) > 1 else "heat"

    if mode == "indexer":
        SpatialIndexerConsumer(r, Config.STREAM_CREATED, Config.GROUP_INDEXER, Config.CONSUMER_INDEXER).run()

    elif mode == "indexer_updated":
        SpatialIndexerConsumer(r, Config.STREAM_UPDATED, Config.GROUP_INDEXER, f"{Config.CONSUMER_INDEXER}-u").run()

    elif mode == "activity":
        ActivityBucketConsumer(r, Config.STREAM_CREATED, Config.GROUP_ACTIVITY, Config.CONSUMER_ACTIVITY).run()

    elif mode == "activity_updated":
        ActivityBucketConsumer(r, Config.STREAM_UPDATED, Config.GROUP_ACTIVITY, f"{Config.CONSUMER_ACTIVITY}-u").run()

    elif mode == "invalidate":
        HeatmapInvalidateConsumer(r, Config.STREAM_HEATMAP_INVALIDATE, Config.GROUP_INVALIDATE, Config.CONSUMER_INVALIDATE).run()

    elif mode == "prewarm":
        PrewarmTilesWorker(r).run_forever()

    else:
        logger.info("Usage:")
        logger.info("  python workers.py indexer")
        logger.info("  python workers.py indexer_updated")
        logger.info("  python workers.py activity")
        logger.info("  python workers.py activity_updated")
        logger.info("  python workers.py invalidate")
        logger.info("  python workers.py prewarm")


if __name__ == "__main__":
    main()
