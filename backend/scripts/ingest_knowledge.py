"""
TRIAD Knowledge Ingestion — recursive scan, chunk, dedup, async upload.

Vectors → Qdrant | Metadata → Neon
Usage: python scripts/ingest_knowledge.py [root_dir]
"""

import asyncio
import hashlib
import logging
import os
import sys
from pathlib import Path

# Ensure backend root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.core.limits import MAX_INGEST_BATCH  # noqa: E402
from app.services.memory_service import (  # noqa: E402
    COLLECTION_NAME,
    _qdrant,
    add_memory,
    ensure_collection_once,
)

try:
    from qdrant_client.models import FieldCondition, Filter, MatchValue
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False

logger = logging.getLogger(__name__)

EXTENSIONS = {".md", ".py", ".ts"}
IGNORE_DIRS = {"node_modules", ".git", "dist", "build", ".venv", "__pycache__"}
MAX_CONCURRENCY = 5
CHUNK_SIZE = 1000  # chars
SAFE_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
SAFE_MODE_VALUES = {"1", "true", "yes", "on"}


def _is_safe_mode() -> bool:
    return bool(getattr(settings, "SAFE_MODE", False)) or (
        os.getenv("SAFE_MODE", "").lower() in SAFE_MODE_VALUES
    )


def scan_files(root: Path) -> list[Path]:
    return [
        p
        for p in root.rglob("*")
        if p.suffix in EXTENSIONS
        and p.is_file()
        and not any(part in IGNORE_DIRS for part in p.parts)
    ]


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE) -> list[str]:
    """Split text into chunks by line boundaries."""
    lines = text.split("\n")
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for line in lines:
        if current_len + len(line) > chunk_size and current:
            chunks.append("\n".join(current))
            current = []
            current_len = 0
        current.append(line)
        current_len += len(line) + 1

    if current:
        chunks.append("\n".join(current))
    return chunks


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _hash_exists_in_qdrant(h: str) -> bool:
    """Check if a hash already exists in Qdrant via scroll+filter."""
    if not QDRANT_AVAILABLE:
        return False
    try:
        results, _ = _qdrant.instance.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=Filter(
                must=[FieldCondition(key="hash", match=MatchValue(value=h))]
            ),
            limit=1,
        )
        return len(results) > 0
    except Exception:
        return False


async def ingest_file(
    path: Path,
    sem: asyncio.Semaphore,
) -> int:
    """Ingest a single file. Returns number of chunks upserted."""
    async with sem:
        # SAFE_MODE: skip files > 5MB
        if _is_safe_mode() and path.stat().st_size > SAFE_MAX_FILE_SIZE:
            logger.warning("SAFE_MODE: skipping large file %s (%d bytes)", path, path.stat().st_size)
            return 0

        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError as e:
            logger.error("Cannot read %s: %s", path, e)
            return 0

        raw_chunks = chunk_text(content)
        batch_limit = MAX_INGEST_BATCH  # always ≤50

        count = 0
        try:
            for chunk in raw_chunks[:batch_limit]:
                h = sha256(chunk)

                # Dedup via Qdrant scroll+filter
                exists = await asyncio.to_thread(_hash_exists_in_qdrant, h)
                if exists:
                    continue

                point_id = await add_memory(
                    text=chunk,
                    user_id="ingest",
                    metadata={"source": str(path), "hash": h},
                )
                if point_id:
                    count += 1
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Ingest failed for %s after %d chunks: %s", path, count, exc)
            return count

        if count:
            logger.info("Ingested %d chunks from %s", count, path)
        return count


async def main(root_dir: str = ".") -> None:
    if not settings.MEMORY_ENABLED:
        logger.info("MEMORY_ENABLED is false; ingestion skipped (default-safe, no network).")
        return

    root = Path(root_dir)
    files = scan_files(root)
    logger.info("Found %d files to ingest", len(files))

    await ensure_collection_once()

    sem = asyncio.Semaphore(MAX_CONCURRENCY)
    tasks = [asyncio.create_task(ingest_file(f, sem)) for f in files]
    try:
        results = await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        logger.info("Ingestion cancelled")
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        return

    total = sum(results)
    logger.info("Ingestion complete — %d total chunks across %d files", total, len(files))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    try:
        asyncio.run(main(target))
    except KeyboardInterrupt:
        logger.info("Ingestion interrupted by user")
        raise SystemExit(130)
