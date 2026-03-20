#!/usr/bin/env python3
"""
CSP Violation Monitoring Dashboard
Task 4.3 (E1): Monitor CSP violations

Simple CLI dashboard for monitoring CSP violations
"""
import argparse
import json
import time
from datetime import datetime

import requests


def fetch_violations(api_url: str, limit: int = 100) -> dict:
    """Fetch CSP violations from API"""
    try:
        response = requests.get(
            f"{api_url}/api/v1/security/csp-violations",
            params={"limit": limit},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        return {"error": str(exc)}


def fetch_stats(api_url: str) -> dict:
    """Fetch CSP violation statistics"""
    try:
        response = requests.get(
            f"{api_url}/api/v1/security/csp-violations/stats",
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        return {"error": str(exc)}


def print_dashboard(data: dict, stats: dict) -> None:
    """Print monitoring dashboard"""
    # Clear screen
    print("\033[2J\033[H")

    print("=" * 80)
    print("🛡️  CSP Violation Monitoring Dashboard")
    print("=" * 80)
    print(f"Last Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    if "error" in data:
        print(f"❌ Error fetching violations: {data['error']}")
        return

    if "error" in stats:
        print(f"❌ Error fetching stats: {stats['error']}")
        return

    # Print summary
    total = data.get("total", 0)
    print(f"📊 Total Violations: {total}")
    print()

    # Print statistics
    if stats.get("total_violations", 0) > 0:
        print("📈 Violations by Directive:")
        print("-" * 80)
        by_directive = stats.get("by_directive", {})
        for directive, count in list(by_directive.items())[:10]:
            bar = "█" * min(50, count)
            print(f"  {directive:30s} {count:5d} {bar}")
        print()
        
        print("🚫 Top Blocked URIs:")
        print("-" * 80)
        by_blocked_uri = stats.get("by_blocked_uri", {})
        for uri, count in list(by_blocked_uri.items())[:5]:
            uri_short = uri[:60] + "..." if len(uri) > 60 else uri
            print(f"  {count:5d}x {uri_short}")
        print()

        print("📄 Top Source Files:")
        print("-" * 80)
        by_source_file = stats.get("by_source_file", {})
        for source, count in list(by_source_file.items())[:5]:
            source_short = source[:60] + "..." if len(source) > 60 else source
            print(f"  {count:5d}x {source_short}")
        print()

    # Print recent violations
    violations = data.get("violations", [])
    if violations:
        print(f"🔴 Recent Violations (last {min(5, len(violations))}):")
        print("-" * 80)
        for v in violations[-5:]:
            timestamp = v.get("timestamp", "")
            violation = v.get("violation", {})
            directive = violation.get("violated-directive", "unknown")
            blocked_uri = violation.get("blocked-uri", "unknown")
            doc_uri = violation.get("document-uri", "unknown")

            # Shorten URIs
            blocked_uri_short = blocked_uri[:40] + "..." if len(blocked_uri) > 40 else blocked_uri
            doc_uri_short = doc_uri[:40] + "..." if len(doc_uri) > 40 else doc_uri

            print(f"\n  Time: {timestamp}")
            print(f"  Directive: {directive}")
            print(f"  Blocked: {blocked_uri_short}")
            print(f"  Document: {doc_uri_short}")
    else:
        print("✅ No violations recorded")

    print("\n" + "=" * 80)
    print("Press Ctrl+C to exit")


def monitor_loop(api_url: str, interval: int = 5) -> None:
    """Monitor CSP violations in a loop"""
    try:
        while True:
            data = fetch_violations(api_url)
            stats = fetch_stats(api_url)
            print_dashboard(data, stats)
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n\nMonitoring stopped.")


def export_violations(api_url: str, output_file: str) -> None:
    """Export violations to JSON file"""
    data = fetch_violations(api_url, limit=1000)

    if "error" in data:
        print(f"❌ Error: {data['error']}")
        return

    with open(output_file, "w", encoding="utf-8") as file_handle:
        json.dump(data, file_handle, indent=2)

    print(f"✅ Exported {data.get('total', 0)} violations to {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Monitor CSP violations")
    parser.add_argument(
        "api_url",
        help="API base URL (e.g., http://localhost:8000)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=5,
        help="Refresh interval in seconds (default: 5)",
    )
    parser.add_argument(
        "--export",
        help="Export violations to JSON file instead of monitoring",
    )

    args = parser.parse_args()

    if args.export:
        export_violations(args.api_url, args.export)
    else:
        monitor_loop(args.api_url, args.interval)


if __name__ == "__main__":
    main()
