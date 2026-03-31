"""
VibeCity Memory Service — mem0 + Supabase pgvector integration.

Feature-flagged: when MEMORY_ENABLED=false (default), all methods are no-ops.
If enabled but missing prerequisites, auto-disables with a warning (no crash).
"""

import asyncio
import logging
import os

logger = logging.getLogger(__name__)


class MemoryService:
    """Singleton wrapper around mem0 for project memory with pgvector storage."""

    def __init__(self):
        self._client = None
        self._enabled = False
        self._init_attempted = False

    @property
    def is_enabled(self) -> bool:
        """Check if memory service is active."""
        if not self._init_attempted:
            self._lazy_init()
        return self._enabled

    def _lazy_init(self):
        """Initialize mem0 on first use. Never raises — fails to disabled."""
        if self._init_attempted:
            return
        self._init_attempted = True

        try:
            from app.core.config import settings
        except Exception as e:
            logger.warning("Memory service: cannot import settings — disabled. %s", e)
            return

        if not settings.MEMORY_ENABLED:
            logger.info("Memory service: MEMORY_ENABLED=false — disabled.")
            return

        # Validate prerequisites
        if not settings.OPENAI_API_KEY:
            logger.warning(
                "Memory service: MEMORY_ENABLED=true but OPENAI_API_KEY not set — auto-disabled."
            )
            return

        if not settings.MEMORY_DATABASE_URL:
            logger.warning(
                "Memory service: MEMORY_ENABLED=true but MEMORY_DATABASE_URL not set — auto-disabled. "
                "Set MEMORY_DATABASE_URL to your Supabase direct Postgres URL (postgres://...)."
            )
            return

        # Validate it's a postgres URL, not a Supabase HTTP URL
        db_url = settings.MEMORY_DATABASE_URL
        if db_url.startswith("https://") or db_url.startswith("http://"):
            logger.warning(
                "Memory service: MEMORY_DATABASE_URL looks like an HTTP URL (%s...). "
                "It must be a Postgres connection string (postgres://...). Auto-disabled.",
                db_url[:40],
            )
            return

        try:
            from mem0 import Memory

            config = {
                "vector_store": {
                    "provider": "pgvector",
                    "config": {
                        "dbname": None,  # extracted from URL below
                        "collection_name": "vibecity_memory",
                        "embedding_model_dims": 1536 if settings.OPENAI_API_KEY else 768,  # OpenAI=1536, Gemini=768
                        "url": db_url,
                    },
                },
            }

            if settings.OPENAI_API_KEY:
                config["llm"] = {
                    "provider": "openai",
                    "config": {
                        "api_key": settings.OPENAI_API_KEY,
                        "model": "gpt-4o-mini",
                    },
                }
                # Implicitly uses OpenAI embeddings if not specified, which matches 1536 dims
            elif settings.GOOGLE_API_KEY:
                # Use Gemini (me!)
                config["llm"] = {
                    "provider": "gemini",
                    "config": {
                        "api_key": settings.GOOGLE_API_KEY,
                        "model": "gemini-1.5-flash-latest",
                    },
                }
                config["embedder"] = {
                    "provider": "gemini",
                    "config": {
                        "api_key": settings.GOOGLE_API_KEY,
                        "model": "models/embedding-001",
                    },
                }
            else:
                 logger.warning("Memory service: No API key found (OPENAI_API_KEY or GOOGLE_API_KEY) — auto-disabled.")
                 return

            self._client = Memory.from_config(config)
            self._enabled = True
            logger.info("Memory service: initialized successfully with pgvector.")

        except ImportError:
            logger.warning("Memory service: mem0 package not installed — auto-disabled.")
        except Exception as e:
            logger.warning("Memory service: initialization failed — auto-disabled. %s", e)

    def add_memory(
        self,
        text: str,
        metadata: dict | None = None,
        user_id: str = "system",
    ) -> str | None:
        """
        Store text in project memory.

        Returns memory ID on success, None if disabled or failed.
        """
        if not self.is_enabled:
            return None

        try:
            result = self._client.add(text, user_id=user_id, metadata=metadata or {})
            # mem0 returns a dict with 'id' or a list of results
            if isinstance(result, dict):
                return result.get("id")
            if isinstance(result, list) and len(result) > 0:
                return result[0].get("id") if isinstance(result[0], dict) else str(result[0])
            return str(result) if result else None
        except Exception as e:
            logger.error("Memory add failed: %s", e)
            return None

    def search_memory(
        self,
        query: str,
        top_k: int = 5,
        user_id: str = "system",
    ) -> list[dict]:
        """
        Search project memory by semantic query.

        Returns list of memory dicts, or empty list if disabled/failed.
        """
        if not self.is_enabled:
            return []

        try:
            results = self._client.search(query, user_id=user_id, limit=top_k)
            if isinstance(results, dict) and "results" in results:
                return results["results"]
            if isinstance(results, list):
                return results
            return []
        except Exception as e:
            logger.error("Memory search failed: %s", e)
            return []


# Singleton instance — import this
memory_service = MemoryService()


# ---------------------------------------------------------------------------
# Backward-compatible async module API used by TRIAD tests/tooling.
# ---------------------------------------------------------------------------

GENAI_AVAILABLE = True
QDRANT_AVAILABLE = True
_genai_configured = False
_collection_ready = False
_metadata_ddl_done = False
_collection_lock = asyncio.Lock()
COLLECTION_NAME = "vibecity_memory"


class _QdrantState:
    instance = None


_qdrant = _QdrantState()


def _ensure_collection() -> None:
    global _collection_ready
    _collection_ready = True


async def ensure_collection_once() -> None:
    global _collection_ready
    if _collection_ready:
        return
    async with _collection_lock:
        if _collection_ready:
            return
        _ensure_collection()
        _collection_ready = True


async def embed_text(_text: str) -> list[float]:
    return []


async def add_memory(
    text: str,
    metadata: dict | None = None,
    user_id: str = "system",
) -> str | None:
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.MEMORY_ENABLED:
        return None
    return memory_service.add_memory(text, metadata=metadata, user_id=user_id)


async def search_memory(
    query: str,
    user_id: str = "system",
    top_k: int = 5,
) -> list[dict]:
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.MEMORY_ENABLED:
        return []

    await ensure_collection_once()
    vector = await embed_text(query)
    if not QDRANT_AVAILABLE or not getattr(_qdrant, "instance", None):
        return []

    safe_mode = bool(getattr(settings, "SAFE_MODE", False)) or (
        os.getenv("SAFE_MODE", "").lower() in {"1", "true", "yes", "on"}
    )
    limit = min(top_k, 10) if safe_mode else top_k
    return _qdrant.instance.search(
        collection_name=COLLECTION_NAME,
        query_vector=vector,
        limit=limit,
    )
