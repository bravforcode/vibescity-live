import asyncio
import logging
import time
from typing import Any

from app.core.supabase import supabase

logger = logging.getLogger(__name__)


class AnalyticsBuffer:
    """
    Buffers analytics events in memory and flushes them to Supabase
    periodically or when buffer size limit is reached.
    """

    def __init__(self, flush_interval: int = 5, buffer_size: int = 100):
        self.flush_interval = flush_interval
        self.buffer_size = buffer_size
        self._buffer: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self._running = False
        self._last_flush = time.time()

    async def start(self):
        """Starts the periodic flush loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._cron_flush())
        logger.info("AnalyticsBuffer service started.")

    async def stop(self):
        """Stops the loop and performs a final flush."""
        logger.info("Stopping AnalyticsBuffer service...")
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        # Force flush remaining items
        await self.flush()
        logger.info("AnalyticsBuffer service stopped.")

    async def log(self, event_type: str, data: dict[str, Any], user_id: str | None = None):
        """Standard entry point: queues an event."""
        payload = {
            "event_type": event_type,
            "data": data,
            "user_id": user_id,
        }
        async with self._lock:
            self._buffer.append(payload)
            should_flush = len(self._buffer) >= self.buffer_size

        if should_flush:
            await self.flush()

    async def flush(self):
        """Flushes buffered events to Supabase."""
        async with self._lock:
            if not self._buffer:
                return
            items_to_flush = list(self._buffer)
            self._buffer.clear()
            self._last_flush = time.time()

        if not items_to_flush:
            return

        try:
            # Run blocking DB call in thread
            await asyncio.to_thread(self._persist_batch, items_to_flush)
            logger.debug(f"Flushed {len(items_to_flush)} analytics events.")
        except Exception as e:
            logger.error(f"Analytics flush failed: {e}")
            # We drop events on failure to prevent memory leaks during outage.

    def _persist_batch(self, items: list[dict[str, Any]]):
        """Synchronous DB insert."""
        supabase.table("analytics_logs").insert(items).execute()

    async def _cron_flush(self):
        """Background task to flush periodically."""
        while self._running:
            await asyncio.sleep(self.flush_interval)
            await self.flush()


# Global singleton
analytics_buffer = AnalyticsBuffer()
