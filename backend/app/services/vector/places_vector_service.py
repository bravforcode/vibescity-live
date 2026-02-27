from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.core.concurrency import vector_sem
from app.core.config import get_settings

logger = logging.getLogger(__name__)

# C5: Simple circuit breaker — no external libs required
# Tracks failure timestamps; opens circuit after 5 failures in 30s for 60s
_cb_failures: list[float] = []
_cb_open_until: float = 0.0


def _is_circuit_open() -> bool:
    return time.monotonic() < _cb_open_until


def _record_cb_failure() -> None:
    global _cb_open_until, _cb_failures
    now = time.monotonic()
    _cb_failures = [t for t in _cb_failures if now - t < 30]
    _cb_failures.append(now)
    if len(_cb_failures) >= 5:
        _cb_open_until = now + 60
        logger.warning("qdrant_circuit_open", extra={"failure_count": len(_cb_failures)})


def _record_cb_success() -> None:
    global _cb_failures
    _cb_failures = []

try:
    import google.generativeai as genai

    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    genai = None

try:
    from qdrant_client.models import (
        Distance,
        FieldCondition,
        Filter,
        MatchValue,
        VectorParams,
    )

    QDRANT_MODELS_AVAILABLE = True
except ImportError:
    QDRANT_MODELS_AVAILABLE = False
    Distance = None
    FieldCondition = None
    Filter = None
    MatchValue = None
    VectorParams = None

COLLECTION_NAME = "places_authority_v1"
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 768

_genai_configured = False
_genai_lock = asyncio.Lock()
_collection_ready = False
_collection_lock = asyncio.Lock()


def _settings():
    return get_settings()


async def configure_genai_once() -> None:
    global _genai_configured
    if _genai_configured:
        return
    async with _genai_lock:
        if _genai_configured:
            return
        if not GENAI_AVAILABLE:
            raise RuntimeError("google-generativeai not installed")
        if not _settings().GOOGLE_API_KEY:
            raise RuntimeError("GOOGLE_API_KEY not set")
        genai.configure(api_key=_settings().GOOGLE_API_KEY)
        _genai_configured = True
        logger.info("Gemini configured once for places vectors")


def _ensure_collection_sync(client: Any) -> None:
    collections = client.get_collections().collections
    exists = any(collection.name == COLLECTION_NAME for collection in collections)
    if exists:
        return
    if not QDRANT_MODELS_AVAILABLE:
        raise RuntimeError("qdrant_client models not available")
    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
    )
    logger.info("Created Qdrant collection: %s", COLLECTION_NAME)


async def ensure_collection_once(client: Any) -> None:
    global _collection_ready
    if _collection_ready:
        return
    async with _collection_lock:
        if _collection_ready:
            return
        async with vector_sem:
            await asyncio.to_thread(_ensure_collection_sync, client)
        _collection_ready = True


async def embed_text(text: str) -> list[float]:
    if not GENAI_AVAILABLE:
        raise RuntimeError("google-generativeai not installed")
    await configure_genai_once()
    result = await asyncio.to_thread(genai.embed_content, model=EMBEDDING_MODEL, content=text)
    return result["embedding"]


def build_embedding_text(row: dict) -> str:
    parts = [
        (row.get("name") or ""),
        (row.get("category") or ""),
        (row.get("address") or ""),
        (row.get("province") or ""),
        (row.get("district") or ""),
    ]
    return " | ".join(part.strip().lower() for part in parts if part)


def make_point_id(authority_id: str) -> str:
    return f"auth-{authority_id}"


def make_payload(row: dict) -> dict:
    return {
        "authority_id": row.get("authority_id"),
        "name": row.get("name"),
        "category": row.get("category"),
        "province": row.get("province"),
        "district": row.get("district"),
        "address": row.get("address"),
        "lat": float(row.get("lat")),
        "lng": float(row.get("lng")),
        "updated_at": row.get("updated_at") or "",
        "status": row.get("status"),
        "source": row.get("source"),
        "source_ref": row.get("source_ref"),
    }


async def upsert_points(client: Any, points: list[Any]) -> None:
    async with vector_sem:
        await asyncio.to_thread(
            client.upsert,
            collection_name=COLLECTION_NAME,
            points=points,
        )


async def qdrant_search(
    client: Any,
    q: str,
    limit: int,
    province: str | None,
    category: str | None,
) -> Any:
    if not QDRANT_MODELS_AVAILABLE:
        raise RuntimeError("qdrant_client models not available")

    # C5: Circuit breaker — fail fast if Qdrant is consistently down
    if _is_circuit_open():
        raise RuntimeError("qdrant_circuit_open: vector search temporarily disabled")

    try:
        vector = await asyncio.wait_for(embed_text(q), timeout=2.5)
        must = []
        if province:
            must.append(FieldCondition(key="province", match=MatchValue(value=province)))
        if category:
            must.append(FieldCondition(key="category", match=MatchValue(value=category)))
        query_filter = Filter(must=must) if must else None

        async with vector_sem:
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    client.search,
                    collection_name=COLLECTION_NAME,
                    query_vector=vector,
                    query_filter=query_filter,
                    limit=limit,
                ),
                timeout=2.5,
            )
        _record_cb_success()
        return result
    except (TimeoutError, Exception) as exc:
        _record_cb_failure()
        raise RuntimeError(f"qdrant_search failed: {exc}") from exc
