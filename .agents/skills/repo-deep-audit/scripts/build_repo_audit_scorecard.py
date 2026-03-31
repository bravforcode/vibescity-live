#!/usr/bin/env python3
"""Merge the manifest and signal scan into a scorecard scaffold."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from _audit_common import severity_sort_key

SEVERITY_PENALTIES = {
    "critical": 35,
    "high": 18,
    "medium": 8,
    "low": 3,
}

INTENTIONALLY_EMPTY_FILENAMES = {"__init__.py", ".gitkeep", ".keep", ".placeholder", "py.typed"}


def should_penalize_empty_file(file_entry: dict[str, object]) -> bool:
    path = Path(str(file_entry.get("path") or ""))
    if path.name in INTENTIONALLY_EMPTY_FILENAMES:
        return False
    if path.suffix == ".py" and path.name == "__init__.py":
        return False
    return True


def calculate_auto_score(file_entry: dict[str, object], findings: list[dict[str, object]]) -> tuple[int, str, str]:
    score = 100
    severity_counts = Counter(str(finding["severity"]) for finding in findings)

    for severity, count in severity_counts.items():
        penalty = SEVERITY_PENALTIES.get(severity, 0) * count
        if severity == "critical":
            penalty = min(penalty, 70)
        elif severity == "high":
            penalty = min(penalty, 54)
        elif severity == "medium":
            penalty = min(penalty, 32)
        score -= penalty

    lines = file_entry.get("lines")
    if isinstance(lines, int):
        if lines > 3000:
            score -= 12
        elif lines > 1500:
            score -= 8
        elif lines > 800:
            score -= 4
        if (
            lines == 0
            and file_entry.get("audit_mode") == "deep"
            and should_penalize_empty_file(file_entry)
        ):
            score -= 25

    if file_entry.get("file_state") == "untracked":
        score -= 3

    highest_severity = "none"
    if findings:
        highest_severity = sorted(
            [str(finding["severity"]) for finding in findings],
            key=severity_sort_key,
        )[0]

    score = max(0, min(100, score))

    if highest_severity == "critical" or score < 50:
        auto_status = "failing"
    elif highest_severity == "high" or score < 70:
        auto_status = "high-risk"
    elif score < 85 or findings:
        auto_status = "needs-work"
    else:
        auto_status = "healthy"

    confidence_map = {"deep": "high", "sampled": "medium", "metadata": "low"}
    confidence = confidence_map.get(str(file_entry.get("audit_mode")), "medium")
    return score, auto_status, confidence


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    fieldnames = [
        "path",
        "file_state",
        "zone",
        "category",
        "risk",
        "audit_mode",
        "size_bytes",
        "lines",
        "auto_score",
        "auto_status",
        "confidence",
        "top_signals",
        "manual_score",
        "manual_reason",
        "remediation",
        "review_disposition",
        "notes",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="Manifest JSON path.")
    parser.add_argument("--signals", required=True, help="Signals JSON path.")
    parser.add_argument("--output-dir", required=True, help="Directory for scorecard outputs.")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    signals = json.loads(Path(args.signals).read_text(encoding="utf-8"))

    signals_by_path = {
        entry["path"]: entry["findings"]
        for entry in signals.get("files", [])
    }

    rows: list[dict[str, object]] = []
    status_counter = Counter()

    for file_entry in manifest.get("files", []):
        findings = list(signals_by_path.get(file_entry["path"], []))
        findings.sort(key=lambda item: (severity_sort_key(str(item["severity"])), item["line"], item["rule_id"]))
        auto_score, auto_status, confidence = calculate_auto_score(file_entry, findings)
        status_counter[auto_status] += 1

        top_signals = "; ".join(
            f"{finding['rule_id']}@L{finding['line']}"
            for finding in findings[:3]
        )

        rows.append(
            {
                "path": file_entry["path"],
                "file_state": file_entry["file_state"],
                "zone": file_entry["zone"],
                "category": file_entry["category"],
                "risk": file_entry["risk"],
                "audit_mode": file_entry["audit_mode"],
                "size_bytes": file_entry["size_bytes"],
                "lines": file_entry["lines"] if file_entry["lines"] is not None else "",
                "auto_score": auto_score,
                "auto_status": auto_status,
                "confidence": confidence,
                "top_signals": top_signals,
                "manual_score": "",
                "manual_reason": "",
                "remediation": "",
                "review_disposition": "",
                "notes": "",
            }
        )

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "repo-audit-scorecard.json"
    csv_path = output_dir / "repo-audit-scorecard.csv"

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_files": len(rows),
            "status_counts": dict(status_counter),
        },
        "rows": rows,
    }

    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    write_csv(csv_path, rows)

    print(f"Wrote scorecard JSON: {json_path}")
    print(f"Wrote scorecard CSV: {csv_path}")
    print(f"Status counts: {payload['summary']['status_counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
