"""
TRIAD async database sessions.

Rules:
- Runtime uses pooled connections (Supabase port 6543 / Neon pooler).
- SQLAlchemy uses NullPool everywhere to prevent connection storms.
- All access guarded by semaphores from app.core.concurrency.
"""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.concurrency import core_db_sem, history_db_sem, vector_sem
from app.core.config import settings
from app.core.lazy import LazyClient

_REMOVED_ASYNCPG_QUERY_PARAMS = {
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "channel_binding",
}

_SSL_REQUIRE_MODES = {"require", "verify-full"}


def normalize_asyncpg_dsn(url: str) -> tuple[str, dict[str, object]]:
    """Strip sslmode/sslrootcert/etc from a DSN for raw asyncpg.connect().

    Returns (cleaned_url, connect_kwargs).  Does NOT alter the URL scheme.
    """
    parsed = urlsplit(url)
    if not parsed.query:
        return url, {}

    kwargs: dict[str, object] = {}
    query_items = parse_qsl(parsed.query, keep_blank_values=True)
    filtered: list[tuple[str, str]] = []
    for key, value in query_items:
        if key.lower() in _REMOVED_ASYNCPG_QUERY_PARAMS:
            if key.lower() == "sslmode" and value.lower() in _SSL_REQUIRE_MODES:
                kwargs["ssl"] = "require"
            continue
        filtered.append((key, value))

    if len(filtered) == len(query_items):
        return url, kwargs

    cleaned = urlunsplit((parsed.scheme, parsed.netloc, parsed.path,
                          urlencode(filtered), parsed.fragment))
    return cleaned, kwargs


def _to_async_url(url: str) -> str:
    """Convert postgresql:// to postgresql+asyncpg:// and strip unsupported query params."""
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    parsed = urlsplit(url)
    if not parsed.query:
        return url

    query_items = parse_qsl(parsed.query, keep_blank_values=True)
    filtered_items = [
        (key, value)
        for key, value in query_items
        if key.lower() not in _REMOVED_ASYNCPG_QUERY_PARAMS
    ]
    if len(filtered_items) == len(query_items):
        return url

    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(filtered_items),
            parsed.fragment,
        )
    )


def _connect_args_for_url(url: str) -> dict[str, str]:
    """Derive asyncpg connect args from URL query params."""
    parsed = urlsplit(url)
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key.lower() == "sslmode" and value.lower() in _SSL_REQUIRE_MODES:
            return {"ssl": "require"}
    return {}


_core_engine = LazyClient(
    lambda: create_async_engine(
        _to_async_url(settings.DATABASE_URL),
        poolclass=NullPool,
        connect_args=_connect_args_for_url(settings.DATABASE_URL),
    )
)

_history_engine = LazyClient(
    lambda: create_async_engine(
        _to_async_url(settings.NEON_DATABASE_URL),
        poolclass=NullPool,
        connect_args=_connect_args_for_url(settings.NEON_DATABASE_URL),
    )
)

_core_session_maker = LazyClient(
    lambda: async_sessionmaker(
        _core_engine.instance, class_=AsyncSession, expire_on_commit=False
    )
)

_history_session_maker = LazyClient(
    lambda: async_sessionmaker(
        _history_engine.instance, class_=AsyncSession, expire_on_commit=False
    )
)


def get_core_engine():
    """Return the Supabase (core) async engine."""
    return _core_engine.instance


def get_history_engine():
    """Return the Neon (history) async engine."""
    return _history_engine.instance


async def get_core_db():
    """Yield an AsyncSession against Supabase, guarded by core_db_sem."""
    async with core_db_sem:
        async with _core_session_maker.instance() as session:
            yield session


async def get_history_db():
    """Yield an AsyncSession against Neon, guarded by history_db_sem."""
    async with history_db_sem:
        async with _history_session_maker.instance() as session:
            yield session


# Backward-compatible exports expected by health checks and legacy imports.
def AsyncSessionLocal(*args, **kwargs):
    return _core_session_maker.instance(*args, **kwargs)


async_engine = get_core_engine()


# ── Optional: Qdrant vector client ──

from qdrant_client import QdrantClient  # noqa: E402

_qdrant_client = LazyClient(
    lambda: QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY,
        prefer_grpc=True,
        grpc_port=settings.QDRANT_GRPC_PORT,
    )
)


async def get_vector_client():
    """Yield a sync QdrantClient, guarded by vector_sem."""
    async with vector_sem:
        yield _qdrant_client.instance
