import time

from app.services.cache.redis_client import InMemoryCache


def test_fallback_cache_persists_values_to_disk(tmp_path):
    store_file = tmp_path / "fallback-cache.json"

    first = InMemoryCache(persistence_path=store_file)
    first.setex("session:1", 120, "session-data")
    first.lpush("events:1", "event-a")
    first.expire("events:1", 120)

    restored = InMemoryCache(persistence_path=store_file)
    assert restored.get("session:1") == "session-data"
    assert restored.get("events:1") == ["event-a"]


def test_fallback_cache_drops_expired_values_after_reload(tmp_path):
    store_file = tmp_path / "fallback-cache.json"

    first = InMemoryCache(persistence_path=store_file)
    first.setex("expiring:key", 60, "stale")
    first.ttl["expiring:key"] = time.time() - 10
    first.flush()

    restored = InMemoryCache(persistence_path=store_file)
    assert restored.get("expiring:key") is None
    assert restored.keys("expiring:*") == []
