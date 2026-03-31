#!/usr/bin/env python3
"""
Execute SQL Editor runlist with pre/post snapshots.

Usage:
  python3 scripts/sql/execute_runlist_with_snapshots.py \
    --runlist scripts/sql/sql_editor_runlist_20260206.sql \
    --staging-db-url "$STAGING_SESSION_DB_URL" \
    --production-db-url "$PROD_SESSION_DB_URL" \
    --execute-production

Safety:
  - Requires staging DB URL and runs staging first.
  - Production execution is opt-in (flag or EXECUTE_PROD_AFTER_STAGING=yes).
  - If production is enabled, it runs only after staging succeeds.
  - Saves pre/post snapshots for rollback context.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import socket
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

import psycopg2
from psycopg2 import OperationalError
from psycopg2.extras import RealDictCursor


KEY_TABLES = [
    "venues",
    "buildings",
    "orders",
    "order_items",
    "enrichment_queue",
    "entitlements_ledger",
    "subscriptions",
    "notifications",
    "slip_audit",
    "slip_health_checks",
    "audit_log",
]


@dataclass(frozen=True)
class SnapshotQuery:
    name: str
    sql: str
    params: tuple[Any, ...] = ()


def _ensure_sslmode(db_url: str) -> str:
    if "sslmode=" in db_url:
        return db_url
    if db_url.startswith(("postgresql://", "postgres://")):
        sep = "&" if "?" in db_url else "?"
        return f"{db_url}{sep}sslmode=require"
    # libpq keyword/value DSN
    if re.search(r"(^|\\s)host=([^\s]+)", db_url):
        return f"{db_url} sslmode=require"
    # Fallback: treat as URL
    sep = "&" if "?" in db_url else "?"
    return f"{db_url}{sep}sslmode=require"


def _env_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


_PASSWORD_PLACEHOLDERS = {"[YOUR-PASSWORD]", "YOUR-PASSWORD", "<YOUR-PASSWORD>"}


def _is_password_placeholder(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip() in _PASSWORD_PLACEHOLDERS


def _extract_password_from_postgres_url(db_url: str) -> str | None:
    if not db_url.startswith(("postgresql://", "postgres://")):
        return None
    parsed = urlparse(db_url)
    pwd = parsed.password
    if not pwd or _is_password_placeholder(pwd):
        return None
    return pwd


def _resolve_db_password() -> str | None:
    # Prefer explicit env var.
    for key in ("VIBECITY_DB_PASSWORD", "SUPABASE_DB_PASSWORD"):
        val = os.getenv(key)
        if val and val.strip():
            return val.strip()

    # Fallback: derive from a known-good direct URL already present in env files.
    # NOTE: We intentionally do not print or log this.
    for key in ("SUPABASE_DB_URL",):
        val = os.getenv(key)
        if val:
            pwd = _extract_password_from_postgres_url(val.strip().strip('"').strip("'"))
            if pwd:
                return pwd

    # Last resort: parse a local .env file without sourcing it (CRLF-safe).
    env_path = Path.cwd() / ".env"
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() != "SUPABASE_DB_URL":
                continue
            vv = v.strip().strip('"').strip("'")
            pwd = _extract_password_from_postgres_url(vv)
            if pwd:
                return pwd
    return None


def _fill_password_placeholder(db_url: str) -> str:
    """
    Fill template URLs containing [YOUR-PASSWORD] using a password derived from env.

    This avoids putting secrets directly into scripts/run commands.
    """
    if "[YOUR-PASSWORD]" not in db_url and "YOUR-PASSWORD" not in db_url:
        return db_url

    pwd = _resolve_db_password()
    if not pwd:
        raise RuntimeError(
            "DB URL contains [YOUR-PASSWORD] placeholder but no password source was found. "
            "Set VIBECITY_DB_PASSWORD (preferred) or ensure SUPABASE_DB_URL contains a real password."
        )

    escaped_pwd = quote(pwd, safe="")
    # Replace placeholders directly. Avoid urlparse here because [YOUR-PASSWORD] contains
    # brackets which trigger IPv6 netloc validation errors in Python 3.12.
    for placeholder in _PASSWORD_PLACEHOLDERS:
        db_url = db_url.replace(placeholder, escaped_pwd)
    return db_url


def _iter_connection_strings(db_url: str) -> list[str]:
    """
    Returns a list of connection strings to try.

    Motivation: Supabase pooler hostnames often have multiple A records. If one
    IP is unhealthy, adding hostaddr lets libpq pin to a specific IP while still
    using the hostname for TLS/SNI.
    """
    safe_url = _ensure_sslmode(db_url)
    candidates: list[str] = [safe_url]

    # Already pinned.
    if "hostaddr=" in safe_url:
        return candidates

    # URI form: postgresql://...
    if safe_url.startswith(("postgresql://", "postgres://")):
        parsed = urlparse(safe_url)
        host = parsed.hostname
        port = parsed.port
        if not host or not port:
            return candidates
        # Only attempt pinning for DNS hostnames.
        if re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", host):
            return candidates
        try:
            ips = sorted(
                {ai[4][0] for ai in socket.getaddrinfo(host, port, family=socket.AF_INET)}
            )
        except Exception:
            return candidates

        qs = dict(parse_qsl(parsed.query, keep_blank_values=True))
        for ip in ips:
            qs2 = dict(qs)
            qs2["hostaddr"] = ip
            new = parsed._replace(query=urlencode(qs2))
            candidates.append(urlunparse(new))
        return candidates

    # DSN keyword/value form: host=... port=...
    host_m = re.search(r"(^|\s)host=([^\s]+)", safe_url)
    port_m = re.search(r"(^|\s)port=(\d+)", safe_url)
    if not host_m or not port_m:
        return candidates
    host = host_m.group(2)
    port = int(port_m.group(2))
    if re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", host):
        return candidates
    try:
        ips = sorted({ai[4][0] for ai in socket.getaddrinfo(host, port, family=socket.AF_INET)})
    except Exception:
        return candidates
    for ip in ips:
        candidates.append(f"{safe_url} hostaddr={ip}")
    return candidates

def _is_nonretryable_connect_error(msg_lower: str) -> bool:
    return any(
        s in msg_lower
        for s in (
            "password authentication failed",
            "role \"",
            "database \"",
            "no pg_hba.conf entry",
        )
    )


def _connect_with_retries(
    db_url: str,
    *,
    connect_timeout_s: int,
    max_wait_s: int,
) -> Any:
    filled_url = _fill_password_placeholder(db_url)
    candidates = _iter_connection_strings(filled_url)
    deadline = time.monotonic() + max_wait_s

    attempt = 0
    last_exc: OperationalError | None = None

    while True:
        for candidate in candidates:
            try:
                return psycopg2.connect(candidate, connect_timeout=connect_timeout_s)
            except OperationalError as e:
                last_exc = e
                msg_lower = str(e).lower()
                if _is_nonretryable_connect_error(msg_lower):
                    raise
                continue

        if time.monotonic() >= deadline:
            assert last_exc is not None
            raise last_exc

        attempt += 1
        # Exponential backoff capped at 10s.
        sleep_s = min(2 ** min(attempt, 4), 10)
        time.sleep(sleep_s)


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _snapshot_queries() -> list[SnapshotQuery]:
    return [
        SnapshotQuery(
            name="pg_policies",
            sql="""
                SELECT
                  schemaname,
                  tablename,
                  policyname,
                  permissive,
                  roles,
                  cmd,
                  qual,
                  with_check
                FROM pg_policies
                WHERE schemaname = 'public'
                ORDER BY tablename, policyname
            """,
        ),
        SnapshotQuery(
            name="pg_proc_public_defs",
            sql="""
                SELECT
                  n.nspname AS schema_name,
                  p.proname AS function_name,
                  pg_get_function_identity_arguments(p.oid) AS identity_args,
                  p.prosecdef AS security_definer,
                  pg_get_functiondef(p.oid) AS function_ddl
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public'
                  AND p.prokind IN ('f', 'p')
                  AND NOT EXISTS (
                    SELECT 1
                    FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass
                      AND d.objid = p.oid
                      AND d.deptype = 'e'
                  )
                ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
            """,
        ),
        SnapshotQuery(
            name="key_table_columns",
            sql="""
                SELECT
                  table_name,
                  ordinal_position,
                  column_name,
                  data_type,
                  udt_name,
                  is_nullable,
                  column_default
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = ANY(%s)
                ORDER BY table_name, ordinal_position
            """,
            params=(KEY_TABLES,),
        ),
        SnapshotQuery(
            name="key_table_constraints",
            sql="""
                SELECT
                  conrelid::regclass::text AS table_name,
                  conname AS constraint_name,
                  contype AS constraint_type,
                  pg_get_constraintdef(oid) AS constraint_def
                FROM pg_constraint
                WHERE connamespace = 'public'::regnamespace
                  AND conrelid::regclass::text = ANY(%s)
                ORDER BY conrelid::regclass::text, conname
            """,
            params=([f"public.{t}" for t in KEY_TABLES],),
        ),
    ]


def take_snapshot(conn: Any, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for q in _snapshot_queries():
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(q.sql, q.params)
            rows = [dict(row) for row in cur.fetchall()]
        _write_json(out_dir / f"{q.name}.json", rows)
        _write_csv(out_dir / f"{q.name}.csv", rows)

        if q.name == "pg_proc_public_defs":
            ddl = "\n\n".join(row["function_ddl"] for row in rows if row.get("function_ddl"))
            (out_dir / "pg_proc_public_defs.sql").write_text(ddl, encoding="utf-8")


def execute_sql_file(conn: Any, sql_path: Path) -> None:
    sql_text = sql_path.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql_text)


def run_environment(
    label: str,
    db_url: str,
    runlist_path: Path,
    root_out_dir: Path,
    *,
    connect_timeout_s: int,
    connect_max_wait_s: int,
    verify_idempotency: bool,
) -> None:
    env_dir = root_out_dir / label
    pre_dir = env_dir / "pre"
    post_dir = env_dir / "post"
    env_dir.mkdir(parents=True, exist_ok=True)

    conn = _connect_with_retries(
        db_url,
        connect_timeout_s=connect_timeout_s,
        max_wait_s=connect_max_wait_s,
    )
    conn.autocommit = True
    try:
        take_snapshot(conn, pre_dir)
        execute_sql_file(conn, runlist_path)
        take_snapshot(conn, post_dir)

        post_rerun_dir = None
        if verify_idempotency:
            post_rerun_dir = env_dir / "post_rerun"
            execute_sql_file(conn, runlist_path)
            take_snapshot(conn, post_rerun_dir)
    finally:
        conn.close()

    metadata = {
        "environment": label,
        "runlist": str(runlist_path),
        "executed_at_utc": datetime.now(timezone.utc).isoformat(),
        "snapshot_pre": str(pre_dir),
        "snapshot_post": str(post_dir),
        "snapshot_post_rerun": str(post_rerun_dir) if verify_idempotency else None,
    }
    _write_json(env_dir / "execution_metadata.json", metadata)


def main() -> int:
    parser = argparse.ArgumentParser(description="Execute runlist with staging->production snapshots")
    parser.add_argument("--runlist", required=True, help="Path to SQL runlist file")
    parser.add_argument(
        "--staging-db-url",
        default=os.getenv("STAGING_SESSION_DB_URL") or os.getenv("STAGING_SUPABASE_DB_URL", ""),
    )
    parser.add_argument(
        "--production-db-url",
        default=os.getenv("PROD_SESSION_DB_URL") or os.getenv("SUPABASE_DB_URL", ""),
    )
    parser.add_argument(
        "--execute-production",
        action="store_true",
        default=_env_truthy(os.getenv("EXECUTE_PROD_AFTER_STAGING")),
        help="If set, runs production after staging succeeds (or set EXECUTE_PROD_AFTER_STAGING=yes).",
    )
    parser.add_argument(
        "--connect-timeout-s",
        type=int,
        default=15,
        help="Connection timeout in seconds for pooler/database connections.",
    )
    parser.add_argument(
        "--connect-max-wait-s",
        type=int,
        default=180,
        help="Maximum total wait time (seconds) to establish a DB connection (retries/backoff included).",
    )
    parser.add_argument(
        "--no-verify-idempotency",
        action="store_true",
        default=False,
        help="Disable idempotency rerun snapshot (post_rerun).",
    )
    parser.add_argument(
        "--output-dir",
        default="reports/db-runlist-snapshots",
        help="Directory to store snapshots and metadata",
    )
    args = parser.parse_args()

    runlist_path = Path(args.runlist).resolve()
    if not runlist_path.exists():
        raise FileNotFoundError(f"Runlist not found: {runlist_path}")

    staging_db_url = args.staging_db_url.strip()
    production_db_url = args.production_db_url.strip()

    if not staging_db_url:
        raise RuntimeError(
            "Missing staging DB URL. Set STAGING_SESSION_DB_URL/STAGING_SUPABASE_DB_URL or pass --staging-db-url."
        )
    if args.execute_production:
        if not production_db_url:
            raise RuntimeError(
                "Missing production DB URL. Set PROD_SESSION_DB_URL/SUPABASE_DB_URL or pass --production-db-url."
            )
        if staging_db_url == production_db_url:
            raise RuntimeError(
                "Staging and production DB URLs are identical. Refusing to run to avoid unsafe execution."
            )

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    root_out_dir = Path(args.output_dir).resolve() / run_id
    root_out_dir.mkdir(parents=True, exist_ok=True)

    # Enforced order: staging first, then (optional) production.
    run_environment(
        "staging",
        staging_db_url,
        runlist_path,
        root_out_dir,
        connect_timeout_s=args.connect_timeout_s,
        connect_max_wait_s=args.connect_max_wait_s,
        verify_idempotency=(not args.no_verify_idempotency),
    )
    sequence = ["staging"]

    if args.execute_production:
        run_environment(
            "production",
            production_db_url,
            runlist_path,
            root_out_dir,
            connect_timeout_s=args.connect_timeout_s,
            connect_max_wait_s=args.connect_max_wait_s,
            verify_idempotency=False,
        )
        sequence.append("production")

    summary = {
        "run_id": run_id,
        "runlist": str(runlist_path),
        "artifacts_root": str(root_out_dir),
        "sequence": sequence,
    }
    _write_json(root_out_dir / "summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
