"""
Analytics event buffer — buffers analytics events in memory and flushes
to Supabase in batches for performance.
"""
import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)

_FLUSH_THRESHOLD = 50
_FLUSH_INTERVAL_SECONDS = 30


class AnalyticsBuffer:
    """Thread-safe, async-compatible analytics event buffer."""

    def __init__(self, flush_threshold: int = _FLUSH_THRESHOLD):
        self._buffer: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._flush_threshold = flush_threshold
        self._flush_task: asyncio.Task | None = None

    async def log(
        self,
        event_type: str,
        data: dict[str, Any] | None = None,
        user_id: str | None = None,
    ) -> None:
        """Append an event to the buffer. Flushes automatically when threshold is reached."""
        event = {
            "event_type": event_type,
            "data": data or {},
            "user_id": user_id,
            "created_at": datetime.now(UTC).isoformat(),
        }
        async with self._lock:
            self._buffer.append(event)
            if len(self._buffer) >= self._flush_threshold:
                await self._flush_locked()

    async def flush(self) -> None:
        """Manually flush all buffered events to Supabase."""
        async with self._lock:
            await self._flush_locked()

    async def _flush_locked(self) -> None:
        """Internal flush — must be called while holding ``self._lock``."""
        if not self._buffer:
            return

        events = list(self._buffer)
        self._buffer.clear()

        try:
            from app.core.supabase import supabase

            if supabase:
                supabase.table("analytics_events").insert(events).execute()
                logger.debug("Flushed %d analytics events", len(events))
            else:
                logger.warning("Supabase not configured — dropping %d analytics events", len(events))
        except Exception:
            logger.exception("Failed to flush %d analytics events", len(events))
            # Put events back so they aren't lost
            self._buffer = events + self._buffer

    async def start_periodic_flush(self) -> None:
        """Start a background task that periodically flushes the buffer."""
        if self._flush_task is not None:
            return

        async def _loop() -> None:
            while True:
                await asyncio.sleep(_FLUSH_INTERVAL_SECONDS)
                try:
                    await self.flush()
                except Exception:
                    logger.exception("Periodic analytics flush failed")

        self._flush_task = asyncio.create_task(_loop())

    async def stop(self) -> None:
        """Stop the periodic flush and drain remaining events."""
        if self._flush_task:
            self._flush_task.cancel()
            self._flush_task = None
        await self.flush()


# Module-level singleton
analytics_buffer = AnalyticsBuffer()
