"""
VibeCity Memory Service — mem0 + Supabase pgvector integration.

Feature-flagged: when MEMORY_ENABLED=false (default), all methods are no-ops.
If enabled but missing prerequisites, auto-disables with a warning (no crash).
"""

import logging
from pathlib import Path
from typing import Optional

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
        metadata: Optional[dict] = None,
        user_id: str = "system",
    ) -> Optional[str]:
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
