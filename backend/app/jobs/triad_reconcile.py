"""S3: TRIAD reconciliation repair loop.

Runs every 5 minutes (called from lifespan or a scheduler).
Finds venues whose vector index is stale/missing and re-upserts them to Qdrant.
This is NOT a queue — it is a background repair loop that prevents TRIAD split-brain.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

_INTERVAL_SECONDS = 300  # 5 minutes


async def _reconcile_once() -> None:
    """Single reconciliation pass — import lazily to avoid startup cost."""
    try:
        from app.core.supabase import supabase_admin
        from app.db.session import _qdrant_client
        from app.services.vector.places_vector_service import (
            COLLECTION_NAME,
            configure_genai_once,
            embed_text,
            upsert_points,
        )
    except ImportError as exc:
        logger.debug("triad_reconcile: optional deps missing, skipping — %s", exc)
        return

    if supabase_admin is None:
        logger.debug("triad_reconcile: supabase_admin not configured, skipping")
        return

    try:
        client = _qdrant_client.instance
    except Exception as exc:
        logger.debug("triad_reconcile: qdrant unavailable — %s", exc)
        return

    # 1. Find stale venues (missing or outdated vector index)
    try:
        res = await asyncio.to_thread(
            lambda: supabase_admin.table("venues")
            .select("id,name,category,description,updated_at")
            .or_("last_vector_sync.is.null,last_vector_sync.lt.updated_at")
            .limit(50)
            .execute()
        )
    except Exception as exc:
        logger.warning("triad_reconcile: DB query failed — %s", exc)
        return

    rows = res.data or []
    if not rows:
        return

    logger.info("triad_reconcile: %d stale venues found", len(rows))

    # 2. Re-upsert each venue to Qdrant
    try:
        await configure_genai_once()
    except Exception as exc:
        logger.warning("triad_reconcile: genai not available — %s", exc)
        return

    from qdrant_client.models import PointStruct  # type: ignore[import]

    synced_ids: list[str] = []
    for venue in rows:
        venue_id = str(venue["id"])
        text = f"{venue.get('name', '')} {venue.get('category', '')} {venue.get('description', '') or ''}"
        try:
            vector = await embed_text(text)
            point = PointStruct(
                id=venue_id,
                vector=vector,
                payload={
                    "id": venue_id,
                    "name": venue.get("name"),
                    "category": venue.get("category"),
                },
            )
            await upsert_points(client, [point])
            synced_ids.append(venue_id)
        except Exception as exc:
            logger.warning("triad_reconcile: upsert failed for %s — %s", venue_id, exc)

    if not synced_ids:
        return

    # 3. Stamp last_vector_sync on successfully synced venues
    now_iso = datetime.now(tz=UTC).isoformat()
    try:
        await asyncio.to_thread(
            lambda: supabase_admin.table("venues")
            .update({"last_vector_sync": now_iso})
            .in_("id", synced_ids)
            .execute()
        )
        logger.info("triad_reconcile: stamped %d venues", len(synced_ids))
    except Exception as exc:
        logger.warning("triad_reconcile: timestamp update failed — %s", exc)


async def run_forever() -> None:
    """Background task: reconcile every INTERVAL_SECONDS, resilient to errors."""
    while True:
        try:
            await _reconcile_once()
        except Exception as exc:
            logger.warning("triad_reconcile: unexpected error — %s", exc)
        await asyncio.sleep(_INTERVAL_SECONDS)
