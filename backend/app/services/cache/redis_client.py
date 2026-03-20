from __future__ import annotations

import logging
import time

import redis

from app.core.config import get_settings

settings = get_settings()
_redis_client: redis.Redis | None = None
_logger = logging.getLogger(__name__)

# Fallback in-memory cache for when Redis is unavailable
class InMemoryCache:
    """Simple in-memory TTL-based cache with LRU eviction as fallback"""
    MAX_ENTRIES = 5000

    def __init__(self):
        self.data = {}
        self.ttl = {}

    def _evict_if_needed(self):
        if len(self.data) < self.MAX_ENTRIES:
            return
        now = time.time()
        # First pass: remove expired entries
        expired = [k for k, exp in self.ttl.items() if exp < now]
        for k in expired:
            self.data.pop(k, None)
            self.ttl.pop(k, None)
        if len(self.data) < self.MAX_ENTRIES:
            return
        # Second pass: evict oldest 10% by TTL
        by_ttl = sorted(self.ttl.items(), key=lambda x: x[1])
        evict_count = max(1, self.MAX_ENTRIES // 10)
        for k, _ in by_ttl[:evict_count]:
            self.data.pop(k, None)
            self.ttl.pop(k, None)

    def get(self, key):
        if key in self.ttl and time.time() > self.ttl[key]:
            del self.data[key]
            del self.ttl[key]
            return None
        return self.data.get(key)

    def set(self, key, value, ex=None):
        self._evict_if_needed()
        self.data[key] = value
        if ex:
            self.ttl[key] = time.time() + ex
        return True

    def setex(self, key, ex, value):
        return self.set(key, value, ex=ex)

    def expire(self, key, seconds):
        if key in self.data:
            self.ttl[key] = time.time() + seconds
        return 1 if key in self.data else 0

    def delete(self, *keys):
        count = 0
        for key in keys:
            if key in self.data:
                del self.data[key]
                if key in self.ttl:
                    del self.ttl[key]
                count += 1
        return count

    def lpush(self, key, *values):
        if key not in self.data:
            self.data[key] = []
        self.data[key].extend(values)
        return len(self.data[key])

    def keys(self, pattern):
        """Simple pattern matching (only supports 'key:*' patterns)"""
        if pattern.endswith("*"):
            prefix = pattern[:-1]
            return [k for k in self.data.keys() if k.startswith(prefix)]
        return []

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
        # Test connection
        client.ping()
        _logger.info("Redis connection established")
        _redis_client = client
        return _redis_client
    except Exception as e:
        _logger.warning(f"Redis connection failed ({e}), using fallback in-memory cache")
        _redis_client = _fallback_cache
        return _redis_client
