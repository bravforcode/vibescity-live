#!/usr/bin/env python3
"""
Validate OSM schema contract for public.venues.

Usage:
  SUPABASE_DIRECT_URL=postgresql://... python scripts/ci/validate_osm_contract.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg


REQUIRED_COLUMNS = (
    "legacy_shop_id",
    "osm_id",
    "osm_type",
    "source",
    "h3_cell",
    "content_hash",
    "source_hash",
    "osm_version",
    "osm_timestamp",
    "last_seen_at",
    "last_osm_sync",
    "open_time",
    "vibe_info",
    "social_links",
    "status",
)

FORBIDDEN_STATUSES = ("LIVE", "OFF")
REMOVED_QUERY_PARAMS = {"sslmode", "sslrootcert", "sslcert", "sslkey", "channel_binding"}
SSL_REQUIRE_MODES = {"require", "verify-full"}


def _sanitize_dsn(url: str) -> tuple[str, dict]:
    parsed = urlsplit(url)
    query_items = parse_qsl(parsed.query, keep_blank_values=True)
    sslmode = None
    filtered = []
    for key, value in query_items:
        lower_key = key.lower()
        if lower_key == "sslmode":
            sslmode = value.lower()
        if lower_key in REMOVED_QUERY_PARAMS:
            continue
        filtered.append((key, value))
    clean_dsn = urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(filtered),
            parsed.fragment,
        )
    )
    connect_args = {"ssl": "require"} if sslmode in SSL_REQUIRE_MODES else {}
    return clean_dsn, connect_args


def _index_has_column(indexdef: str, column: str) -> bool:
    if f'"{column}"' in indexdef:
        return True
    return re.search(rf"\b{re.escape(column)}\b", indexdef) is not None


def _has_unique_index(indexdefs: Iterable[str], columns: tuple[str, ...]) -> bool:
    for indexdef in indexdefs:
        upper = indexdef.upper()
        if "UNIQUE INDEX" not in upper:
            continue
        if all(_index_has_column(indexdef, column) for column in columns):
            return True
    return False


def _has_any_index(indexdefs: Iterable[str], column: str) -> bool:
    for indexdef in indexdefs:
        if _index_has_column(indexdef, column):
            return True
    return False


async def _validate() -> dict:
    database_url = os.getenv("SUPABASE_DIRECT_URL", "").strip()
    if not database_url:
        return {
            "ok": False,
            "errors": ["SUPABASE_DIRECT_URL is not set"],
        }

    clean_dsn, connect_args = _sanitize_dsn(database_url)
    try:
        conn = await asyncpg.connect(clean_dsn, **connect_args)
    except Exception as exc:
        return {
            "ok": False,
            "errors": [f"Database connection failed: {exc}"],
        }
    try:
        table_exists = await conn.fetchval(
            "SELECT to_regclass('public.venues') IS NOT NULL"
        )
        if not table_exists:
            return {
                "ok": False,
                "table_exists": False,
                "errors": ["public.venues does not exist"],
            }

        columns = await conn.fetch(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'venues'
            """
        )
        column_names = {row["column_name"] for row in columns}
        missing_columns = sorted(
            [column for column in REQUIRED_COLUMNS if column not in column_names]
        )

        index_rows = await conn.fetch(
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'venues'
            """
        )
        indexdefs = [row["indexdef"] for row in index_rows]

        unique_osm_type_legacy = _has_unique_index(
            indexdefs, ("osm_type", "legacy_shop_id")
        )
        unique_osm_id = _has_unique_index(indexdefs, ("osm_id",))
        has_h3_idx = _has_any_index(indexdefs, "h3_cell")
        has_last_sync_idx = _has_any_index(indexdefs, "last_osm_sync")
        has_source_idx = _has_any_index(indexdefs, "source")

        forbidden_rows = await conn.fetch(
            """
            SELECT status::text AS status, COUNT(*)::bigint AS count
            FROM public.venues
            WHERE status::text = ANY($1::text[])
            GROUP BY status
            ORDER BY status
            """,
            list(FORBIDDEN_STATUSES),
        )
        forbidden_status_counts = {
            row["status"]: int(row["count"]) for row in forbidden_rows
        }

        checks = {
            "unique_osm_type_legacy_shop_id": unique_osm_type_legacy,
            "unique_osm_id": unique_osm_id,
            "index_h3_cell": has_h3_idx,
            "index_last_osm_sync": has_last_sync_idx,
            "index_source": has_source_idx,
            "forbidden_status_absent": len(forbidden_status_counts) == 0,
        }

        failures: list[str] = []
        if missing_columns:
            failures.append(
                "Missing required columns: " + ", ".join(missing_columns)
            )
        for key, ok in checks.items():
            if not ok:
                failures.append(f"Check failed: {key}")
        if forbidden_status_counts:
            failures.append(
                "Forbidden statuses found: "
                + ", ".join(f"{k}={v}" for k, v in forbidden_status_counts.items())
            )

        return {
            "ok": len(failures) == 0,
            "table_exists": True,
            "missing_columns": missing_columns,
            "checks": checks,
            "forbidden_status_counts": forbidden_status_counts,
            "errors": failures,
        }
    finally:
        await conn.close()


def _print_plain(report: dict) -> None:
    if report.get("ok"):
        print("PASS: OSM contract validation succeeded")
    else:
        print("FAIL: OSM contract validation failed")
    if "table_exists" in report:
        print(f"- table_exists: {report.get('table_exists')}")
    if report.get("missing_columns"):
        print("- missing_columns:", ", ".join(report["missing_columns"]))
    checks = report.get("checks") or {}
    for key in sorted(checks.keys()):
        print(f"- {key}: {checks[key]}")
    if report.get("forbidden_status_counts"):
        counts = ", ".join(
            f"{k}={v}" for k, v in report["forbidden_status_counts"].items()
        )
        print("- forbidden_status_counts:", counts)
    for error in report.get("errors", []):
        print(f"- error: {error}")


def main() -> int:
    report = asyncio.run(_validate())
    _print_plain(report)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
