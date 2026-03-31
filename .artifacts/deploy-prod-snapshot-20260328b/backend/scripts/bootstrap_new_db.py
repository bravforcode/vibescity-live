"""
Bootstrap NEW Supabase + Neon for TRIAD cutover.

Usage:
    python scripts/bootstrap_new_db.py --dry-run
    python scripts/bootstrap_new_db.py

1. Applies TRIAD contract migrations (supabase/migrations/20260220_*_triad_*.sql)
2. Applies legacy migrations (supabase/migrations/legacy/) in phase order
3. Provisions memory_metadata table in NEON_DIRECT_DATABASE_URL
"""

import asyncio
import logging
import re
import shutil
import subprocess
import sys
from pathlib import Path

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.db.session import normalize_asyncpg_dsn  # noqa: E402

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
LEGACY_DIR = _REPO_ROOT / "supabase" / "migrations" / "legacy"
TRIAD_DIR = _REPO_ROOT / "supabase" / "migrations"
TRIAD_CONTRACT_GLOB = "20260220_*_triad_*.sql"
MIGRATION_TRACKER_TABLE = "triad_schema_migrations"
_DOLLAR_TAG_RE = re.compile(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$")

_CRITICAL_TABLES = ["venues", "orders", "user_profiles"]

NEON_METADATA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS memory_metadata (
        id text primary key,
        user_id text not null,
        hash text not null,
        text_preview text not null,
        created_at timestamptz not null default now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_memory_metadata_user_id ON memory_metadata(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_memory_metadata_created_at ON memory_metadata(created_at DESC)",
]


def _psql_available() -> bool:
    return shutil.which("psql") is not None


# ── Phase-based migration ordering ──────────────────────────────────────


def _classify_phase(sql_content: str) -> int:
    """Classify migration SQL into an execution phase.

    Phase 0: extensions / types only
    Phase 1: CREATE TABLE (sub-sorted by REFERENCES later)
    Phase 2: ALTER TABLE / CREATE INDEX (no CREATE TABLE)
    Phase 3: CREATE VIEW / CREATE POLICY / GRANT
    Phase 4: CREATE FUNCTION / CREATE TRIGGER / cron.schedule
    """
    upper = sql_content.upper()
    has_ext_or_type = bool(re.search(r"CREATE\s+EXTENSION|CREATE\s+TYPE", upper))
    has_table = bool(re.search(r"CREATE\s+TABLE", upper))
    has_func_trigger = bool(re.search(
        r"CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER|CRON\.SCHEDULE", upper,
    ))
    has_view_policy = bool(re.search(
        r"CREATE\s+(OR\s+REPLACE\s+)?VIEW|CREATE\s+POLICY|GRANT\s+", upper,
    ))
    has_alter = bool(re.search(
        r"ALTER\s+TABLE|ADD\s+CONSTRAINT|CREATE\s+(UNIQUE\s+)?INDEX", upper,
    ))

    if has_func_trigger:
        return 4
    if has_view_policy:
        return 3
    if has_alter and not has_table:
        return 2
    if has_ext_or_type and not has_table:
        return 0
    return 1  # default: tables


def _order_migration_files(migration_files: list[Path]) -> list[Path]:
    """Phase-based ordering with REFERENCES sub-sort inside phase 1."""
    phased: dict[int, list[Path]] = {i: [] for i in range(5)}
    for f in migration_files:
        sql = f.read_text(encoding="utf-8", errors="ignore")
        phase = _classify_phase(sql)
        phased[phase].append(f)

    result: list[Path] = []
    for phase_num in range(5):
        if phase_num == 1:
            no_refs: list[Path] = []
            has_refs: list[Path] = []
            for f in phased[1]:
                sql = f.read_text(encoding="utf-8", errors="ignore")
                if re.search(r"REFERENCES\s+", sql, re.IGNORECASE):
                    has_refs.append(f)
                else:
                    no_refs.append(f)
            result.extend(sorted(no_refs, key=lambda p: p.name))
            result.extend(sorted(has_refs, key=lambda p: p.name))
        else:
            result.extend(sorted(phased[phase_num], key=lambda p: p.name))
    return result


# ── SQL statement splitter (asyncpg fallback) ───────────────────────────


def _split_sql_statements(sql: str) -> list[str]:
    """
    Split SQL into statements while respecting quotes, comments, and dollar-quoted blocks.
    This allows safe asyncpg fallback for files containing DO $$ / function bodies.
    """
    statements: list[str] = []
    buffer: list[str] = []
    i = 0
    n = len(sql)
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    block_comment_depth = 0
    dollar_tag: str | None = None

    while i < n:
        ch = sql[i]
        pair = sql[i : i + 2]

        if in_line_comment:
            buffer.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if block_comment_depth > 0:
            if pair == "/*":
                buffer.append(pair)
                block_comment_depth += 1
                i += 2
                continue
            if pair == "*/":
                buffer.append(pair)
                block_comment_depth -= 1
                i += 2
                continue
            buffer.append(ch)
            i += 1
            continue

        if dollar_tag is not None:
            if sql.startswith(dollar_tag, i):
                buffer.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
            else:
                buffer.append(ch)
                i += 1
            continue

        if in_single_quote:
            buffer.append(ch)
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    buffer.append("'")
                    i += 2
                    continue
                in_single_quote = False
            i += 1
            continue

        if in_double_quote:
            buffer.append(ch)
            if ch == '"':
                if i + 1 < n and sql[i + 1] == '"':
                    buffer.append('"')
                    i += 2
                    continue
                in_double_quote = False
            i += 1
            continue

        if pair == "--":
            buffer.append(pair)
            in_line_comment = True
            i += 2
            continue

        if pair == "/*":
            buffer.append(pair)
            block_comment_depth = 1
            i += 2
            continue

        if ch == "'":
            in_single_quote = True
            buffer.append(ch)
            i += 1
            continue

        if ch == '"':
            in_double_quote = True
            buffer.append(ch)
            i += 1
            continue

        if ch == "$":
            match = _DOLLAR_TAG_RE.match(sql, i)
            if match:
                tag = match.group(0)
                dollar_tag = tag
                buffer.append(tag)
                i = match.end()
                continue

        if ch == ";":
            statement = "".join(buffer).strip()
            if statement:
                statements.append(statement)
            buffer = []
            i += 1
            continue

        buffer.append(ch)
        i += 1

    tail = "".join(buffer).strip()
    if tail:
        statements.append(tail)

    return statements


# ── Execution helpers ────────────────────────────────────────────────────


def _run_psql_file(database_url: str, migration_file: Path) -> None:
    subprocess.run(
        [
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-d",
            database_url,
            "-f",
            str(migration_file),
        ],
        check=True,
    )


def _run_psql_statements(database_url: str, statements: list[str]) -> None:
    for statement in statements:
        subprocess.run(
            [
                "psql",
                "-v",
                "ON_ERROR_STOP=1",
                "-d",
                database_url,
                "-c",
                statement,
            ],
            check=True,
        )


async def _execute_sql_fallback(conn: asyncpg.Connection, sql: str) -> None:
    statements = _split_sql_statements(sql)
    async with conn.transaction():
        for statement in statements:
            await conn.execute(statement)


# ── Migration application ────────────────────────────────────────────────


async def _apply_file_list(
    conn: asyncpg.Connection,
    ordered: list[Path],
    use_psql: bool,
    label: str,
) -> tuple[int, int]:
    """Apply a list of migration files. Returns (applied, skipped)."""
    applied = 0
    skipped = 0
    for migration_file in ordered:
        filename = migration_file.name
        exists = await conn.fetchval(
            f"SELECT 1 FROM {MIGRATION_TRACKER_TABLE} WHERE filename = $1",
            filename,
        )
        if exists:
            logger.info("SKIP (already applied): %s", filename)
            skipped += 1
            continue

        logger.info("APPLYING [%s]: %s", label, filename)
        try:
            sql = migration_file.read_text(encoding="utf-8")
            if use_psql:
                _run_psql_file(settings.SUPABASE_DIRECT_URL, migration_file)
            else:
                await _execute_sql_fallback(conn, sql)
        except Exception:
            logger.exception("FAILED [%s]: %s", label, filename)
            raise

        await conn.execute(
            f"INSERT INTO {MIGRATION_TRACKER_TABLE} (filename) VALUES ($1)",
            filename,
        )
        logger.info("APPLIED [%s]: %s", label, filename)
        applied += 1
    return applied, skipped


async def apply_supabase_migrations(dry_run: bool = False) -> None:
    """Apply TRIAD contract migrations then legacy migrations to Supabase CORE."""
    # ── Discover TRIAD contract files ──
    triad_files = sorted(TRIAD_DIR.glob(TRIAD_CONTRACT_GLOB))
    logger.info("Found %d TRIAD contract files", len(triad_files))

    # ── Discover + phase-order legacy files ──
    legacy_files: list[Path] = []
    if LEGACY_DIR.exists():
        legacy_files = _order_migration_files(sorted(LEGACY_DIR.glob("*.sql")))
    logger.info("Found %d legacy migration files", len(legacy_files))

    if dry_run:
        logger.info("[DRY RUN] Would apply to: %s", settings.SUPABASE_DIRECT_URL[:40])
        logger.info("── TRIAD contracts (applied first) ──")
        for f in triad_files:
            logger.info("  - %s", f.name)
        logger.info("── Legacy (phase-ordered) ──")
        for f in legacy_files:
            logger.info("  - %s", f.name)
        return

    use_psql = _psql_available()
    logger.info("Migration executor: %s", "psql" if use_psql else "asyncpg fallback")

    dsn, kw = normalize_asyncpg_dsn(settings.SUPABASE_DIRECT_URL)
    conn = await asyncpg.connect(dsn, **kw)
    try:
        await conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {MIGRATION_TRACKER_TABLE} (
                filename text primary key,
                applied_at timestamptz default now()
            )
            """
        )

        t_applied, t_skipped = await _apply_file_list(conn, triad_files, use_psql, "triad")
        l_applied, l_skipped = await _apply_file_list(conn, legacy_files, use_psql, "legacy")

        logger.info(
            "Supabase migrations complete: triad=%d/%d applied/skipped, legacy=%d/%d applied/skipped",
            t_applied, t_skipped, l_applied, l_skipped,
        )

        # ── Smoke verification ──
        missing = []
        for table in _CRITICAL_TABLES:
            exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name=$1)",
                table,
            )
            if not exists:
                missing.append(table)
        if len(missing) > len(_CRITICAL_TABLES) - 2:
            raise RuntimeError(
                f"Bootstrap incomplete — critical tables missing: {missing}"
            )
        if missing:
            logger.warning("Some critical tables missing (non-fatal): %s", missing)

    finally:
        await conn.close()


async def provision_neon_metadata(dry_run: bool = False) -> None:
    """Provision memory_metadata table in Neon HISTORY database."""
    if dry_run:
        logger.info(
            "[DRY RUN] Would provision Neon metadata table at: %s",
            settings.NEON_DIRECT_DATABASE_URL[:40],
        )
        return

    use_psql = _psql_available()
    if use_psql:
        logger.info("Provisioning Neon metadata table via psql")
        _run_psql_statements(settings.NEON_DIRECT_DATABASE_URL, NEON_METADATA_STATEMENTS)
        logger.info("Neon memory_metadata table provisioned")
        return

    logger.info("Provisioning Neon metadata table via asyncpg fallback")
    dsn, kw = normalize_asyncpg_dsn(settings.NEON_DIRECT_DATABASE_URL)
    conn = await asyncpg.connect(dsn, **kw)
    try:
        async with conn.transaction():
            for statement in NEON_METADATA_STATEMENTS:
                await conn.execute(statement)
        logger.info("Neon memory_metadata table provisioned")
    finally:
        await conn.close()


async def main(dry_run: bool = False) -> None:
    logger.info("=== TRIAD Bootstrap %s ===", "(DRY RUN)" if dry_run else "")
    await apply_supabase_migrations(dry_run)
    await provision_neon_metadata(dry_run)
    logger.info("=== Bootstrap complete ===")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    dry_run = "--dry-run" in sys.argv
    asyncio.run(main(dry_run))
