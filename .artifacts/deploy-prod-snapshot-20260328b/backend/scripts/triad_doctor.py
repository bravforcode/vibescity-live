"""
TRIAD Doctor - Readiness checks and diagnostic tool.

Usage:
    python scripts/triad_doctor.py           # Check config only (no network)
    python scripts/triad_doctor.py --ping    # Include network probes
"""

import sys
from importlib.util import find_spec
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402

# Check optional dependencies
GENAI_INSTALLED = find_spec("google.genai") is not None
QDRANT_INSTALLED = find_spec("qdrant_client") is not None
ASYNCPG_INSTALLED = find_spec("asyncpg") is not None


def redact(value: str) -> str:
    """Redact sensitive values safely."""
    if not value:
        return "***"

    # URLs: show scheme + host only
    if value.startswith(("postgresql://", "postgres://", "http://", "https://")):
        from urllib.parse import urlparse
        try:
            parsed = urlparse(value)
            # Keep scheme + netloc (host:port), mask everything else
            return f"{parsed.scheme}://{parsed.hostname or 'unknown'}:{parsed.port or '***'}/***"
        except Exception:
            return "***"

    # API keys: first 6 + *** + last 4 (if length >= 12)
    if len(value) >= 12:
        return f"{value[:6]}***{value[-4:]}"
    return "***"


def is_missing(value: str | None) -> bool:
    """Check if a value is missing (None, empty, or whitespace-only)."""
    return value is None or (isinstance(value, str) and not value.strip())


def _setting(name: str, default=None):
    return getattr(settings, name, default)


def check_config() -> None:
    """Check TRIAD environment variables."""
    print("=== TRIAD Configuration ===\n")

    triad_vars = [
        ("DATABASE_URL", _setting("DATABASE_URL")),
        ("SUPABASE_DIRECT_URL", _setting("SUPABASE_DIRECT_URL")),
        ("NEON_DATABASE_URL", _setting("NEON_DATABASE_URL")),
        ("NEON_DIRECT_DATABASE_URL", _setting("NEON_DIRECT_DATABASE_URL")),
        ("QDRANT_URL", _setting("QDRANT_URL")),
        ("QDRANT_API_KEY", _setting("QDRANT_API_KEY")),
        ("QDRANT_GRPC_PORT", str(_setting("QDRANT_GRPC_PORT", ""))),
        ("GOOGLE_API_KEY", _setting("GOOGLE_API_KEY", "") or ""),
    ]

    missing = []
    for name, value in triad_vars:
        status = "[MIS]" if is_missing(value) else "[OK] "
        display = redact(value) if "KEY" in name or "URL" in name else value
        print(f"{status} {name}: {display}")
        if is_missing(value):
            missing.append(name)

    safe_mode = bool(_setting("SAFE_MODE", False))
    memory_enabled = bool(_setting("MEMORY_ENABLED", False))
    print(f"\n{'[OK] ' if safe_mode else '[OFF]'} SAFE_MODE: {safe_mode}")
    print(f"{'[OK] ' if memory_enabled else '[OFF]'} MEMORY_ENABLED: {memory_enabled}")

    print("\n=== Dependencies ===\n")
    print(f"{'[OK] ' if GENAI_INSTALLED else '[MIS]'} google-genai: {'installed' if GENAI_INSTALLED else 'NOT INSTALLED'}")
    print(f"{'[OK] ' if QDRANT_INSTALLED else '[MIS]'} qdrant-client: {'installed' if QDRANT_INSTALLED else 'NOT INSTALLED'}")
    print(f"{'[OK] ' if ASYNCPG_INSTALLED else '[MIS]'} asyncpg: {'installed' if ASYNCPG_INSTALLED else 'NOT INSTALLED'}")

    if missing:
        print(f"\n[WARN] Missing/default TRIAD vars: {', '.join(missing)}")
        print("   Set these in .env for production use.\n")

    print("\n=== Next Steps ===\n")
    print("1. python scripts/bootstrap_new_db.py --dry-run")
    print("2. python scripts/bootstrap_new_db.py")
    print("3. python scripts/ingest_knowledge.py .")
    print("4. pytest -q tests/test_triad.py")
    print("5. python -m compileall app -q")
    print("\nOptional: python scripts/triad_doctor.py --ping (network probes)")


async def ping_services() -> None:
    """Minimal network probes to verify connectivity."""
    import asyncpg

    print("\n=== Network Probes ===\n")

    # Supabase
    try:
        conn = await asyncpg.connect(_setting("SUPABASE_DIRECT_URL"), timeout=5)
        result = await conn.fetchval("SELECT 1")
        await conn.close()
        print(f"[OK]  Supabase CORE: connected (SELECT 1 = {result})")
    except Exception as e:
        print(f"[ERR] Supabase CORE: {e}")

    # Neon
    try:
        conn = await asyncpg.connect(_setting("NEON_DIRECT_DATABASE_URL"), timeout=5)
        result = await conn.fetchval("SELECT 1")
        await conn.close()
        print(f"[OK]  Neon HISTORY: connected (SELECT 1 = {result})")
    except Exception as e:
        print(f"[ERR] Neon HISTORY: {e}")

    # Qdrant
    if QDRANT_INSTALLED:
        try:
            from qdrant_client import QdrantClient
            client = QdrantClient(
                url=_setting("QDRANT_URL"),
                api_key=_setting("QDRANT_API_KEY"),
                timeout=5,
                prefer_grpc=True,
                grpc_port=_setting("QDRANT_GRPC_PORT"),
            )
            collections = client.get_collections()
            print(f"[OK]  Qdrant MEMORY: connected ({len(collections.collections)} collections)")
        except Exception as e:
            print(f"[ERR] Qdrant MEMORY: {e}")
    else:
        print("[ERR] Qdrant: qdrant-client not installed")


def main() -> None:
    check_config()

    if "--ping" in sys.argv:
        import asyncio
        asyncio.run(ping_services())
    else:
        print("\n(Use --ping to test network connectivity)")


if __name__ == "__main__":
    main()
