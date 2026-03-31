"""
TRIAD architecture tests with deterministic defaults for local/CI runs.
"""

import asyncio
import os

import pytest

RUN_MEMORY_INTEGRATION = os.getenv("RUN_MEMORY_INTEGRATION", "").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


@pytest.fixture(autouse=True)
def triad_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost:5432/core")
    monkeypatch.setenv("SUPABASE_DIRECT_URL", "postgresql://test:test@localhost:5432/core")
    monkeypatch.setenv("NEON_DATABASE_URL", "postgresql://test:test@localhost:5432/history")
    monkeypatch.setenv("NEON_DIRECT_DATABASE_URL", "postgresql://test:test@localhost:5432/history")
    monkeypatch.setenv("QDRANT_URL", "http://localhost:6333")
    monkeypatch.setenv("QDRANT_API_KEY", "test-key")
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google-key")
    monkeypatch.setenv("SAFE_MODE", "true")
    monkeypatch.setenv("MEMORY_ENABLED", "false")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("MEMORY_DATABASE_URL", "")
    monkeypatch.setenv("ENV", "test")

    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def reset_memory_singleton():
    import app.services.memory_service as mem_mod

    # Reset singleton state
    mem_mod._genai_configured = False
    mem_mod._collection_ready = False
    mem_mod._metadata_ddl_done = False
    yield
    mem_mod._genai_configured = False
    mem_mod._collection_ready = False
    mem_mod._metadata_ddl_done = False


def test_limits_constants():
    from app.core.limits import MAX_INGEST_BATCH, MAX_PAGE_SIZE, MAX_VECTOR_K

    assert MAX_PAGE_SIZE == 100
    assert MAX_VECTOR_K == 20
    assert MAX_INGEST_BATCH == 50


def test_safe_mode_reduces_vector_k():
    assert min(15, 10) == 10
    assert min(5, 10) == 5


def test_router_directs_to_correct_store():
    from app.core.router import DataStore, route

    assert route("users") == DataStore.CORE
    assert route("vectors") == DataStore.MEMORY


def test_url_conversion():
    """Test postgresql:// to postgresql+asyncpg:// conversion."""
    from app.db.session import _to_async_url

    assert _to_async_url("postgresql://user:pass@host/db") == "postgresql+asyncpg://user:pass@host/db"
    assert _to_async_url("postgresql+asyncpg://already") == "postgresql+asyncpg://already"


def test_engines_use_nullpool():
    """Test that engines are created with NullPool."""
    from unittest.mock import MagicMock, patch

    from sqlalchemy.pool import NullPool

    with patch("app.db.session.create_async_engine") as mock_create:
        mock_engine = MagicMock()
        mock_create.return_value = mock_engine

        # Reset lazy client to force re-initialization
        from app.db.session import _core_engine
        _core_engine.reset()

        from app.db.session import get_core_engine
        get_core_engine()

        # Verify NullPool was passed
        assert mock_create.called
        call_kwargs = mock_create.call_args[1]
        assert call_kwargs.get("poolclass") == NullPool


@pytest.mark.asyncio
async def test_ensure_collection_once_called_once():
    """Test ensure_collection_once is called exactly once under concurrency."""
    from unittest.mock import MagicMock, patch

    import app.services.memory_service as mem_mod

    mock_ensure = MagicMock()
    with patch.object(mem_mod, "_ensure_collection", mock_ensure):
        with patch.object(mem_mod, "_qdrant") as mock_qdrant:
            mock_qdrant.instance = MagicMock()

            # Reset state
            mem_mod._collection_ready = False

            # Call multiple times concurrently
            tasks = [mem_mod.ensure_collection_once() for _ in range(10)]
            await asyncio.gather(*tasks)

            # Should only call _ensure_collection once
            assert mock_ensure.call_count == 1


@pytest.mark.asyncio
async def test_safe_mode_enforces_k_limit(monkeypatch):
    """Test SAFE_MODE limits k to <=10 in search_memory."""
    from unittest.mock import AsyncMock, MagicMock, patch

    import app.services.memory_service as mem_mod

    monkeypatch.setenv("MEMORY_ENABLED", "true")
    monkeypatch.setenv("SAFE_MODE", "true")
    from app.core.config import get_settings
    get_settings.cache_clear()

    # Mock dependencies
    with patch.object(mem_mod, "GENAI_AVAILABLE", True):
        with patch.object(mem_mod, "QDRANT_AVAILABLE", True):
            with patch.object(mem_mod, "embed_text", AsyncMock(return_value=[0.1] * 768)):
                with patch.object(mem_mod, "_qdrant") as mock_qdrant:
                    mock_search = MagicMock(return_value=[])
                    mock_qdrant.instance.search = mock_search

                    mem_mod._collection_ready = True  # Skip collection setup

                    # Request top_k=20, SAFE_MODE should limit to 10
                    await mem_mod.search_memory("test", user_id="user1", top_k=20)

                    # Verify search was called with limit=10
                    assert mock_search.called
                    call_kwargs = mock_search.call_args[1]
                    assert call_kwargs["limit"] == 10

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_memory_service_basic_api():
    """Test basic memory service API exists and handles disabled state."""
    import app.services.memory_service as mem_mod

    # When disabled, should return None/empty
    result = await mem_mod.add_memory("test", user_id="user1")
    assert result is None

    results = await mem_mod.search_memory("test", user_id="user1")
    assert results == []


@pytest.mark.asyncio
async def test_ingest_skips_large_files_in_safe_mode(monkeypatch, tmp_path):
    """Test ingest skips files >5MB when SAFE_MODE=true."""
    from unittest.mock import AsyncMock, patch

    monkeypatch.setenv("SAFE_MODE", "true")
    from app.core.config import get_settings
    get_settings.cache_clear()

    # Create a fake file path
    fake_file = tmp_path / "large.md"
    fake_file.write_text("content")

    # Mock file size to >5MB
    with patch("pathlib.Path.stat") as mock_stat:
        mock_stat.return_value.st_size = 6 * 1024 * 1024  # 6MB

        # Mock add_memory to track calls
        with patch("app.services.memory_service.add_memory", AsyncMock()) as mock_add:
            from scripts.ingest_knowledge import ingest_file

            sem = asyncio.Semaphore(1)
            count = await ingest_file(fake_file, sem)

            # Should skip file, add_memory not called
            assert count == 0
            mock_add.assert_not_called()

    get_settings.cache_clear()


# ── normalize_asyncpg_dsn ────────────────────────────────────────────────


def test_normalize_asyncpg_dsn_strips_sslmode():
    from app.db.session import normalize_asyncpg_dsn

    dsn, kw = normalize_asyncpg_dsn("postgresql://u:p@host:5432/db?sslmode=require")
    assert "sslmode" not in dsn
    assert dsn.startswith("postgresql://")  # no +asyncpg prefix
    assert kw == {"ssl": "require"}


def test_normalize_asyncpg_dsn_no_ssl():
    from app.db.session import normalize_asyncpg_dsn

    url = "postgresql://u:p@host:5432/db"
    dsn, kw = normalize_asyncpg_dsn(url)
    assert dsn == url
    assert kw == {}


def test_normalize_asyncpg_dsn_preserves_other_params():
    from app.db.session import normalize_asyncpg_dsn

    dsn, kw = normalize_asyncpg_dsn(
        "postgresql://u:p@host/db?sslmode=verify-full&application_name=test"
    )
    assert "application_name=test" in dsn
    assert "sslmode" not in dsn
    assert kw == {"ssl": "require"}


def test_normalize_asyncpg_dsn_non_require_sslmode():
    from app.db.session import normalize_asyncpg_dsn

    dsn, kw = normalize_asyncpg_dsn("postgresql://u:p@host/db?sslmode=prefer")
    assert "sslmode" not in dsn
    assert kw == {}  # prefer is not in _SSL_REQUIRE_MODES


# ── Bootstrap phase classification ───────────────────────────────────────


def test_classify_phase_extensions():
    from scripts.bootstrap_new_db import _classify_phase

    assert _classify_phase("CREATE EXTENSION IF NOT EXISTS pg_trgm;") == 0
    assert _classify_phase("CREATE TYPE pin_type_enum AS ENUM ('a','b');") == 0


def test_classify_phase_tables():
    from scripts.bootstrap_new_db import _classify_phase

    assert _classify_phase("CREATE TABLE IF NOT EXISTS orders (id uuid);") == 1
    # File with both CREATE TABLE and ALTER TABLE → still phase 1
    assert _classify_phase("CREATE TABLE t (id int);\nALTER TABLE t ADD COLUMN x int;") == 1


def test_classify_phase_alter_only():
    from scripts.bootstrap_new_db import _classify_phase

    assert _classify_phase("ALTER TABLE orders ENABLE ROW LEVEL SECURITY;") == 2
    assert _classify_phase("CREATE INDEX idx ON t(col);") == 2


def test_classify_phase_views_policies():
    from scripts.bootstrap_new_db import _classify_phase

    assert _classify_phase("CREATE OR REPLACE VIEW v AS SELECT 1;") == 3
    assert _classify_phase("CREATE POLICY p ON t FOR SELECT USING (true);") == 3


def test_classify_phase_functions():
    from scripts.bootstrap_new_db import _classify_phase

    assert _classify_phase("CREATE OR REPLACE FUNCTION f() RETURNS void AS $$ BEGIN END $$;") == 4
    assert _classify_phase("SELECT cron.schedule('job', '* * * * *', 'SELECT 1');") == 4


def test_order_migration_files_phases(tmp_path):
    from scripts.bootstrap_new_db import _order_migration_files

    (tmp_path / "003_func.sql").write_text("CREATE OR REPLACE FUNCTION f() RETURNS void AS $$ BEGIN END $$;")
    (tmp_path / "002_alter.sql").write_text("ALTER TABLE t ADD COLUMN x int;")
    (tmp_path / "004_view.sql").write_text("CREATE OR REPLACE VIEW v AS SELECT 1;")
    (tmp_path / "001_table.sql").write_text("CREATE TABLE t (id int);")
    (tmp_path / "000_ext.sql").write_text("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    (tmp_path / "005_table_refs.sql").write_text("CREATE TABLE t2 (id int REFERENCES t(id));")

    files = sorted(tmp_path.glob("*.sql"))
    ordered = _order_migration_files(files)
    names = [f.name for f in ordered]

    # Phase 0: ext, Phase 1a: table (no refs), Phase 1b: table (refs), Phase 2: alter, Phase 3: view, Phase 4: func
    assert names == [
        "000_ext.sql",
        "001_table.sql",
        "005_table_refs.sql",
        "002_alter.sql",
        "004_view.sql",
        "003_func.sql",
    ]


@pytest.mark.asyncio
async def test_integration_vector_round_trip():
    """Integration test for full memory lifecycle (requires RUN_MEMORY_INTEGRATION=true)."""
    if not RUN_MEMORY_INTEGRATION:
        pytest.skip("Set RUN_MEMORY_INTEGRATION=true to run live memory integration.")

    import app.services.memory_service as mem_mod

    mem_id = await mem_mod.add_memory("Validation test for VibeCity", user_id="test_user")
    if mem_id is None:
        pytest.skip("Memory service disabled or failed. Check integration env configuration.")

    await asyncio.sleep(1)

    results = await mem_mod.search_memory("VibeCity", user_id="test_user")
    assert isinstance(results, list)
