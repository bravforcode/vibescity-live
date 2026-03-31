"""TRIAD in-memory TTL cache — small, bounded, no Redis needed."""

from cachetools import TTLCache

user_profile_cache: TTLCache = TTLCache(maxsize=256, ttl=60)
vector_search_cache: TTLCache = TTLCache(maxsize=128, ttl=120)
