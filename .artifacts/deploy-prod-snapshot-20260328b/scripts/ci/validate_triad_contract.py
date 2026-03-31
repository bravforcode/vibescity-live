#!/usr/bin/env python3
"""
Validate TRIAD schema contract for production cutover.

Usage:
  SUPABASE_DIRECT_URL=postgresql://... python scripts/ci/validate_triad_contract.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg


REQUIRED_TABLES = (
    "public.venues",
    "public.reviews",
    "public.orders",
    "public.payments",
    "public.subscriptions",
    "public.redemptions",
    "public.partners",
    "public.partner_memberships",
    "public.partner_payouts",
    "public.local_ads",
    "public.ad_impressions",
    "public.ad_clicks",
    "public.user_profiles",
    "public.user_favorites",
    "public.xp_logs",
    "public.coin_transactions",
    "public.gamification_logs",
    "public.daily_checkins",
    "public.lucky_wheel_spins",
    "public.user_submissions",
    "public.hotspot_5m",
    "ops.osm_sync_runs",
    "ops.schema_contract_checks",
)

REQUIRED_VIEWS = (
    "public.venues_public",
    "analytics.leaderboard_view",
)

REQUIRED_MATERIALIZED_VIEWS = (
    "analytics.hotspot_5m",
)

REQUIRED_FUNCTION_SIGNATURES = (
    ("public", "claim_daily_checkin", ""),
    ("public", "get_daily_checkin_status", ""),
    ("public", "get_lucky_wheel_status", ""),
    ("public", "spin_lucky_wheel", ""),
    ("public", "get_partner_dashboard_metrics", ""),
    ("public", "safe_check_in", "p_user_id uuid, p_venue_id integer, p_note text"),
    ("public", "grant_rewards", "target_user_id uuid, reward_coins integer, reward_xp integer, action_name text"),
    ("public", "redeem_coupon", "p_user_id uuid, p_coupon_id integer"),
    ("public", "bulk_touch_venues", "venue_ids uuid[]"),
)

REQUIRED_COLUMNS_ON_VENUES = (
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
    for k, v in query_items:
        lk = k.lower()
        if lk == "sslmode":
            sslmode = v.lower()
        if lk in REMOVED_QUERY_PARAMS:
            continue
        filtered.append((k, v))
    clean = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(filtered), parsed.fragment))
    connect_args = {"ssl": "require"} if sslmode in SSL_REQUIRE_MODES else {}
    return clean, connect_args


def _index_has_column(indexdef: str, column: str) -> bool:
    if f'"{column}"' in indexdef:
        return True
    return re.search(rf"\b{re.escape(column)}\b", indexdef) is not None


def _has_unique_index(indexdefs: list[str], columns: tuple[str, ...]) -> bool:
    for indexdef in indexdefs:
        if "UNIQUE INDEX" not in indexdef.upper():
            continue
        if all(_index_has_column(indexdef, column) for column in columns):
            return True
    return False


def _has_any_index(indexdefs: list[str], column: str) -> bool:
    return any(_index_has_column(indexdef, column) for indexdef in indexdefs)


async def _validate() -> dict:
    database_url = os.getenv("SUPABASE_DIRECT_URL", "").strip()
    if not database_url:
        return {"ok": False, "errors": ["SUPABASE_DIRECT_URL is not set"]}

    clean_dsn, connect_args = _sanitize_dsn(database_url)
    try:
        conn = await asyncpg.connect(clean_dsn, **connect_args)
    except Exception as exc:
        return {
            "ok": False,
            "errors": [f"Database connection failed: {exc}"],
        }
    try:
        missing_tables: list[str] = []
        for full_name in REQUIRED_TABLES:
            exists = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", full_name)
            if not exists:
                missing_tables.append(full_name)

        missing_views: list[str] = []
        for full_name in REQUIRED_VIEWS:
            exists = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", full_name)
            if not exists:
                missing_views.append(full_name)

        missing_materialized_views: list[str] = []
        for full_name in REQUIRED_MATERIALIZED_VIEWS:
            exists = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", full_name)
            if not exists:
                missing_materialized_views.append(full_name)

        missing_functions: list[str] = []
        for schema, fn_name, signature in REQUIRED_FUNCTION_SIGNATURES:
            row = await conn.fetchval(
                """
                SELECT 1
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = $1
                  AND p.proname = $2
                  AND pg_get_function_identity_arguments(p.oid) = $3
                LIMIT 1
                """,
                schema,
                fn_name,
                signature,
            )
            if not row:
                missing_functions.append(f"{schema}.{fn_name}({signature})")

        venues_columns = await conn.fetch(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'venues'
            """
        )
        venues_column_names = {row["column_name"] for row in venues_columns}
        missing_venues_columns = sorted(
            [column for column in REQUIRED_COLUMNS_ON_VENUES if column not in venues_column_names]
        )

        venues_indexes = await conn.fetch(
            """
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'venues'
            """
        )
        indexdefs = [row["indexdef"] for row in venues_indexes]

        checks = {
            "unique_osm_type_legacy_shop_id": _has_unique_index(indexdefs, ("osm_type", "legacy_shop_id")),
            "unique_osm_id": _has_unique_index(indexdefs, ("osm_id",)),
            "index_h3_cell": _has_any_index(indexdefs, "h3_cell"),
            "index_last_osm_sync": _has_any_index(indexdefs, "last_osm_sync"),
            "index_source": _has_any_index(indexdefs, "source"),
        }

        has_status_constraint = await conn.fetchval(
            """
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'venues_status_check'
              AND conrelid = to_regclass('public.venues')
            """
        )

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
        forbidden_status_counts = {row["status"]: int(row["count"]) for row in forbidden_rows}

        duplicate_identity = await conn.fetchval(
            """
            SELECT COUNT(*)::bigint
            FROM (
              SELECT osm_type, legacy_shop_id
              FROM public.venues
              WHERE legacy_shop_id IS NOT NULL
              GROUP BY osm_type, legacy_shop_id
              HAVING COUNT(*) > 1
            ) d
            """
        )
        duplicate_osm_id = await conn.fetchval(
            """
            SELECT COUNT(*)::bigint
            FROM (
              SELECT osm_id
              FROM public.venues
              WHERE osm_id IS NOT NULL
              GROUP BY osm_id
              HAVING COUNT(*) > 1
            ) d
            """
        )

        failures: list[str] = []
        if missing_tables:
            failures.append("Missing tables: " + ", ".join(missing_tables))
        if missing_views:
            failures.append("Missing views: " + ", ".join(missing_views))
        if missing_materialized_views:
            failures.append("Missing materialized views: " + ", ".join(missing_materialized_views))
        if missing_functions:
            failures.append("Missing functions: " + ", ".join(missing_functions))
        if missing_venues_columns:
            failures.append("Missing columns on public.venues: " + ", ".join(missing_venues_columns))
        for check_name, ok in checks.items():
            if not ok:
                failures.append(f"Check failed: {check_name}")
        if not has_status_constraint:
            failures.append("Missing constraint: public.venues.venues_status_check")
        if forbidden_status_counts:
            failures.append(
                "Forbidden statuses found: "
                + ", ".join(f"{k}={v}" for k, v in forbidden_status_counts.items())
            )
        if int(duplicate_identity or 0) > 0:
            failures.append(f"Duplicate (osm_type, legacy_shop_id) groups found: {int(duplicate_identity)}")
        if int(duplicate_osm_id or 0) > 0:
            failures.append(f"Duplicate osm_id groups found: {int(duplicate_osm_id)}")

        return {
            "ok": len(failures) == 0,
            "missing_tables": missing_tables,
            "missing_views": missing_views,
            "missing_materialized_views": missing_materialized_views,
            "missing_functions": missing_functions,
            "missing_venues_columns": missing_venues_columns,
            "checks": checks,
            "has_status_constraint": bool(has_status_constraint),
            "forbidden_status_counts": forbidden_status_counts,
            "duplicate_identity_groups": int(duplicate_identity or 0),
            "duplicate_osm_id_groups": int(duplicate_osm_id or 0),
            "errors": failures,
        }
    finally:
        await conn.close()


def _print_plain(report: dict) -> None:
    print("PASS: TRIAD contract validation succeeded" if report.get("ok") else "FAIL: TRIAD contract validation failed")
    checks = report.get("checks") or {}
    for key in sorted(checks):
        print(f"- {key}: {checks[key]}")
    print(f"- has_status_constraint: {report.get('has_status_constraint')}")
    print(f"- duplicate_identity_groups: {report.get('duplicate_identity_groups')}")
    print(f"- duplicate_osm_id_groups: {report.get('duplicate_osm_id_groups')}")
    if report.get("missing_tables"):
        print("- missing_tables:", ", ".join(report["missing_tables"]))
    if report.get("missing_views"):
        print("- missing_views:", ", ".join(report["missing_views"]))
    if report.get("missing_materialized_views"):
        print("- missing_materialized_views:", ", ".join(report["missing_materialized_views"]))
    if report.get("missing_functions"):
        print("- missing_functions:", ", ".join(report["missing_functions"]))
    if report.get("missing_venues_columns"):
        print("- missing_venues_columns:", ", ".join(report["missing_venues_columns"]))
    if report.get("forbidden_status_counts"):
        counts = ", ".join(f"{k}={v}" for k, v in report["forbidden_status_counts"].items())
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
