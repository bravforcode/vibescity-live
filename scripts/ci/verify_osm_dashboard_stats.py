#!/usr/bin/env python3
"""
Verify production OSM ingestion by minting a fresh admin token at runtime
and querying the dashboard stats endpoint.
"""

from __future__ import annotations

import json
import os
import sys
from urllib.parse import urlparse

import requests


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _project_ref_from_supabase_url(supabase_url: str) -> str:
    host = urlparse(supabase_url).hostname or ""
    # Example host: rukyitpjfmzhqjlfmbie.supabase.co
    return host.split(".")[0]


def _write_summary(lines: list[str]) -> None:
    summary_path = os.getenv("GITHUB_STEP_SUMMARY", "").strip()
    if not summary_path:
        return
    with open(summary_path, "a", encoding="utf-8") as f:
        f.write("## OSM Ingestion Verification\n")
        for line in lines:
            f.write(f"- {line}\n")


def main() -> int:
    api_base = os.getenv("VIBECITY_API_BASE_URL", "https://vibecity-api.fly.dev").rstrip("/")
    min_expected_venues = int(os.getenv("MIN_EXPECTED_VENUES", "1000"))
    fallback_token = os.getenv("PROD_ADMIN_BEARER_TOKEN", "").strip()

    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    admin_email = os.getenv("PROD_ADMIN_EMAIL", "").strip()
    admin_password = os.getenv("PROD_ADMIN_PASSWORD", "").strip()

    token = ""
    if supabase_url and anon_key and admin_email and admin_password:
        auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
        auth_headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
        }
        auth_payload = {"email": admin_email, "password": admin_password}

        auth_resp = requests.post(auth_url, headers=auth_headers, json=auth_payload, timeout=30)
        if auth_resp.status_code != 200:
            raise RuntimeError(
                f"Token mint failed ({auth_resp.status_code}): {auth_resp.text[:500]}"
            )
        auth_json = auth_resp.json()
        token = (auth_json.get("access_token") or "").strip()
        if not token:
            raise RuntimeError("Token mint returned no access_token")
        print("auth_mode=fresh_token")
    elif fallback_token:
        token = fallback_token
        print("auth_mode=fallback_secret_token")
    else:
        raise RuntimeError(
            "Missing auth inputs. Provide either "
            "(SUPABASE_URL + SUPABASE_ANON_KEY + PROD_ADMIN_EMAIL + PROD_ADMIN_PASSWORD) "
            "or PROD_ADMIN_BEARER_TOKEN."
        )

    stats_url = f"{api_base}/api/v1/analytics/dashboard/stats"
    stats_resp = requests.get(
        stats_url, headers={"Authorization": f"Bearer {token}"}, timeout=30
    )
    if stats_resp.status_code != 200:
        raise RuntimeError(
            f"Stats endpoint failed ({stats_resp.status_code}): {stats_resp.text[:500]}"
        )

    data = stats_resp.json()
    if not data.get("success"):
        raise RuntimeError(f"Stats response not successful: {json.dumps(data)[:500]}")

    stats = data.get("stats") or {}
    total_venues = int(stats.get("total_venues") or 0)
    total_osm_venues = int(stats.get("total_osm_venues") or 0)
    latest_osm_sync = stats.get("latest_osm_sync")
    project_ref = stats.get("supabase_project_ref")
    expected_ref = _project_ref_from_supabase_url(supabase_url) if supabase_url else ""

    if total_venues < min_expected_venues:
        raise RuntimeError(
            f"total_venues too low ({total_venues} < {min_expected_venues})"
        )
    if expected_ref and project_ref and project_ref != expected_ref:
        raise RuntimeError(
            f"Project mismatch: stats={project_ref}, expected={expected_ref}"
        )

    lines = [
        f"supabase_project_ref: {project_ref or '(empty)'}",
        f"total_venues: {total_venues}",
        f"total_osm_venues: {total_osm_venues}",
        f"latest_osm_sync: {latest_osm_sync or '(empty)'}",
    ]
    for line in lines:
        print(line)
    _write_summary(lines)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

