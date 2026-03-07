from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path

import redis

from app.core.config import get_settings

settings = get_settings()
_redis_client: redis.Redis | None = None
_logger = logging.getLogger(__name__)


def _resolve_fallback_cache_path() -> Path:
    configured = str(getattr(settings, "REDIS_FALLBACK_CACHE_PATH", "") or "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[3] / ".cache" / "redis-fallback-cache.json"


DEFAULT_FALLBACK_CACHE_PATH = _resolve_fallback_cache_path()


class InMemoryCache:
    """Simple in-memory TTL-based cache with optional disk persistence."""

    def __init__(self, persistence_path: str | Path | None = None):
        self.data: dict[str, object] = {}
        self.ttl: dict[str, float] = {}
        self._lock = threading.RLock()
        self._persistence_path = (
            Path(persistence_path) if persistence_path else DEFAULT_FALLBACK_CACHE_PATH
        )
        self._load_from_disk()

    def _drop_expired_locked(self) -> bool:
        now = time.time()
        expired = [key for key, until in self.ttl.items() if now > until]
        if not expired:
            return False
        for key in expired:
            self.data.pop(key, None)
            self.ttl.pop(key, None)
        return True

    def _persist_locked(self) -> None:
        payload = {
            "version": 1,
            "saved_at": time.time(),
            "data": self.data,
            "ttl": self.ttl,
        }
        try:
            path = self._persistence_path
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            tmp.replace(path)
        except Exception as exc:
            _logger.warning("Failed to persist fallback cache: %s", exc)

    def _load_from_disk(self) -> None:
        path = self._persistence_path
        if not path.exists():
            return
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            data = payload.get("data", {})
            ttl = payload.get("ttl", {})
            if isinstance(data, dict):
                self.data = {str(k): v for k, v in data.items()}
            if isinstance(ttl, dict):
                parsed_ttl: dict[str, float] = {}
                for key, raw_until in ttl.items():
                    try:
                        parsed_ttl[str(key)] = float(raw_until)
                    except (TypeError, ValueError):
                        continue
                self.ttl = parsed_ttl
            with self._lock:
                if self._drop_expired_locked():
                    self._persist_locked()
        except Exception as exc:
            _logger.warning("Failed to restore fallback cache from disk: %s", exc)

    def flush(self) -> None:
        with self._lock:
            self._drop_expired_locked()
            self._persist_locked()

    def get(self, key):
        with self._lock:
            if key in self.ttl and time.time() > self.ttl[key]:
                self.data.pop(key, None)
                self.ttl.pop(key, None)
                self._persist_locked()
                return None
            return self.data.get(key)

    def set(self, key, value, ex=None):
        with self._lock:
            self.data[key] = value
            if ex is not None:
                ex_seconds = int(ex)
                if ex_seconds > 0:
                    self.ttl[key] = time.time() + ex_seconds
                else:
                    self.data.pop(key, None)
                    self.ttl.pop(key, None)
            else:
                self.ttl.pop(key, None)
            self._persist_locked()
            return True

    def setex(self, key, ex, value):
        return self.set(key, value, ex=ex)

    def expire(self, key, seconds):
        with self._lock:
            if key not in self.data:
                return 0
            ttl_seconds = int(seconds)
            if ttl_seconds <= 0:
                self.data.pop(key, None)
                self.ttl.pop(key, None)
                self._persist_locked()
                return 1
            self.ttl[key] = time.time() + ttl_seconds
            self._persist_locked()
            return 1

    def delete(self, *keys):
        with self._lock:
            count = 0
            for key in keys:
                if key in self.data:
                    self.data.pop(key, None)
                    self.ttl.pop(key, None)
                    count += 1
            if count:
                self._persist_locked()
            return count

    def lpush(self, key, *values):
        with self._lock:
            if self._drop_expired_locked():
                self._persist_locked()
            current = self.data.get(key)
            if not isinstance(current, list):
                current = [] if current is None else [current]
            for value in values:
                current.insert(0, value)
            self.data[key] = current
            self._persist_locked()
            return len(current)

    def keys(self, pattern):
        with self._lock:
            changed = self._drop_expired_locked()
            if pattern == "*":
                results = list(self.data.keys())
            elif pattern.endswith("*"):
                prefix = pattern[:-1]
                results = [k for k in self.data.keys() if k.startswith(prefix)]
            elif pattern in self.data:
                results = [pattern]
            else:
                results = []
            if changed:
                self._persist_locked()
            return results

    def ping(self):
        return True


_fallback_cache = InMemoryCache()


def get_redis() -> redis.Redis | InMemoryCache:
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    if not settings.REDIS_URL:
        _logger.warning("No REDIS_URL set, using fallback in-memory cache")
        _redis_client = _fallback_cache
        return _redis_client

    url = settings.REDIS_URL

    try:
        client = redis.from_url(url, decode_responses=True, socket_connect_timeout=5)
        client.ping()
        _logger.info("Redis connection established")
        _redis_client = client
        return _redis_client
    except Exception as exc:
        _logger.warning("Redis connection failed (%s), using fallback in-memory cache", exc)
        _redis_client = _fallback_cache
        return _redis_client
