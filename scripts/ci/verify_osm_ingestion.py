#!/usr/bin/env python3
"""
Verify OSM ingestion health by comparing:
1) Direct Supabase counts (workflow target project)
2) Production admin analytics endpoint counts (optional — skipped if token missing)

Required env:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

Optional env:
- PROD_ADMIN_BEARER_TOKEN  (if empty, prod API check is skipped)
- PROD_ANALYTICS_STATS_URL (default: https://vibecity-api.fly.dev/api/v1/analytics/dashboard/stats)
- COUNT_DRIFT_TOLERANCE (default: 500)
- MIN_EXPECTED_OSM_VENUES (default: 100)
"""

from __future__ import annotations

import json
import os
import sys
from urllib.parse import urlsplit

import requests
from supabase import create_client


def _project_ref_from_url(raw_url: str) -> str:
    host = (urlsplit(raw_url).hostname or "").strip()
    if ".supabase." in host:
        return host.split(".", 1)[0]
    return host


def _count_rows(client, table: str, filters: dict[str, str] | None = None) -> int:
    query = client.table(table).select("id", count="estimated")
    if filters:
        for key, value in filters.items():
            query = query.eq(key, value)
    resp = query.limit(1).execute()
    return int(resp.count or 0)


def _latest_osm_sync(client) -> str | None:
    resp = (
        client.table("venues")
        .select("last_osm_sync")
        .eq("source", "osm")
        .order("last_osm_sync", desc=True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    return rows[0].get("last_osm_sync")


def main() -> int:
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    prod_admin_token = os.getenv("PROD_ADMIN_BEARER_TOKEN", "").strip()
    prod_stats_url = os.getenv(
        "PROD_ANALYTICS_STATS_URL",
        "https://vibecity-api.fly.dev/api/v1/analytics/dashboard/stats",
    ).strip()
    drift_tolerance = int(os.getenv("COUNT_DRIFT_TOLERANCE", "500"))
    min_expected_osm = int(os.getenv("MIN_EXPECTED_OSM_VENUES", "100"))

    missing = []
    if not supabase_url:
        missing.append("SUPABASE_URL")
    if not service_role_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if missing:
        print(json.dumps({"ok": False, "errors": [f"Missing required env: {', '.join(missing)}"]}))
        return 1

    client = create_client(supabase_url, service_role_key)

    direct_total_venues = _count_rows(client, "venues")
    direct_total_osm_venues = _count_rows(client, "venues", {"source": "osm"})
    direct_latest_osm_sync = _latest_osm_sync(client)
    direct_project_ref = _project_ref_from_url(supabase_url)

    errors: list[str] = []

    # ── Direct DB checks (always run) ─────────────────────────────────────────
    if direct_total_osm_venues < min_expected_osm:
        errors.append(
            f"OSM venue count below threshold: direct={direct_total_osm_venues}, min_expected={min_expected_osm}"
        )

    if not direct_latest_osm_sync:
        errors.append("No last_osm_sync found in direct Supabase query (source=osm).")

    # ── Production API check (optional — skipped when token not set) ──────────
    prod_data: dict = {}
    if not prod_admin_token:
        print("[INFO] PROD_ADMIN_BEARER_TOKEN not set — skipping production API comparison.", flush=True)
    else:
        try:
            headers = {"Authorization": f"Bearer {prod_admin_token}"}
            resp = requests.get(prod_stats_url, headers=headers, timeout=30)
            if resp.status_code != 200:
                errors.append(
                    f"Failed to fetch production analytics stats (status={resp.status_code}): {resp.text[:300]}"
                )
            else:
                payload = resp.json()
                if not payload.get("success"):
                    errors.append(f"Unexpected analytics payload: {payload}")
                else:
                    stats = payload.get("stats") or {}
                    prod_total_venues = int(stats.get("total_venues") or 0)
                    prod_total_osm_venues = int(stats.get("total_osm_venues") or 0)
                    prod_latest_osm_sync = stats.get("latest_osm_sync")
                    prod_project_ref = str(stats.get("supabase_project_ref") or "")

                    prod_data = {
                        "stats_url": prod_stats_url,
                        "project_ref": prod_project_ref,
                        "total_venues": prod_total_venues,
                        "total_osm_venues": prod_total_osm_venues,
                        "latest_osm_sync": prod_latest_osm_sync,
                    }

                    if abs(direct_total_venues - prod_total_venues) > drift_tolerance:
                        errors.append(
                            f"total_venues mismatch: direct={direct_total_venues}, prod_api={prod_total_venues}, tolerance={drift_tolerance}"
                        )
                    if prod_total_osm_venues and abs(direct_total_osm_venues - prod_total_osm_venues) > drift_tolerance:
                        errors.append(
                            f"total_osm_venues mismatch: direct={direct_total_osm_venues}, prod_api={prod_total_osm_venues}, tolerance={drift_tolerance}"
                        )
                    if not prod_latest_osm_sync:
                        errors.append("No latest_osm_sync found in production analytics endpoint.")
                    if direct_project_ref and prod_project_ref and direct_project_ref != prod_project_ref:
                        errors.append(
                            f"Supabase project ref mismatch: workflow={direct_project_ref}, prod_api={prod_project_ref}"
                        )
        except Exception as exc:
            # Soft-fail: log but don't count as hard error
            print(f"[WARN] Production API check failed (non-fatal): {exc}", flush=True)

    report = {
        "ok": not errors,
        "direct": {
            "project_ref": direct_project_ref,
            "total_venues": direct_total_venues,
            "total_osm_venues": direct_total_osm_venues,
            "latest_osm_sync": direct_latest_osm_sync,
        },
        "prod_api": prod_data or {"skipped": True},
        "tolerance": drift_tolerance,
        "min_expected_osm_venues": min_expected_osm,
        "errors": errors,
    }

    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
