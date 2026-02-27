"""S9: Export canonical schema snapshot.

Runs pg_dump --schema-only and writes to backend/db/schema_current.sql.
This file becomes the onboarding truth file for TRIAD schema verification.

Usage:
    python backend/scripts/export_schema_snapshot.py

Reads connection from environment (same vars used by the app):
    SUPABASE_URL  — postgres://... or postgresql://...  (or set DB_URL directly)
    DB_URL        — overrides SUPABASE_URL if set
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "backend" / "db" / "schema_current.sql"


def _pg_connection_string() -> str:
    db_url = os.environ.get("DB_URL") or os.environ.get("DATABASE_URL")
    if db_url:
        return db_url

    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url:
        sys.exit(
            "ERROR: Set DB_URL or SUPABASE_URL in environment before running."
        )

    # Convert https://xxx.supabase.co → postgresql://postgres:<key>@db.xxx.supabase.co:5432/postgres
    parsed = urlparse(supabase_url)
    project_ref = parsed.hostname.split(".")[0] if parsed.hostname else ""
    if not project_ref:
        sys.exit(f"ERROR: Could not parse project ref from SUPABASE_URL={supabase_url}")

    password = service_key or "postgres"
    return f"postgresql://postgres:{password}@db.{project_ref}.supabase.co:5432/postgres"


def main() -> None:
    conn = _pg_connection_string()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "pg_dump",
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        conn,
    ]

    print(f"Exporting schema to {OUTPUT_PATH} …")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        sys.exit("ERROR: pg_dump not found. Install postgresql-client.")
    except subprocess.CalledProcessError as exc:
        print(exc.stderr, file=sys.stderr)
        sys.exit(f"ERROR: pg_dump exited with code {exc.returncode}")

    OUTPUT_PATH.write_text(result.stdout, encoding="utf-8")
    lines = result.stdout.count("\n")
    print(f"Done. Written {lines} lines → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
