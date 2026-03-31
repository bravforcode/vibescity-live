#!/usr/bin/env python3
"""Generate a full-repo file manifest for repo-deep-audit."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from _audit_common import classify_file, count_lines, is_binary_file, repo_files


def build_manifest(root: Path) -> dict[str, object]:
    entries: list[dict[str, object]] = []
    source_mode = "git" if (root / ".git").exists() else "filesystem"

    for relative_path, file_state in repo_files(root):
        absolute_path = root / relative_path
        if not absolute_path.exists() or not absolute_path.is_file():
            continue

        size_bytes = absolute_path.stat().st_size
        binary = is_binary_file(absolute_path)
        lines = None if binary else count_lines(absolute_path)
        classification = classify_file(relative_path, size_bytes, binary, lines)

        entry = {
            "path": relative_path,
            "file_state": file_state,
            "size_bytes": size_bytes,
            "lines": lines,
            "is_binary": binary,
            **classification,
        }
        entries.append(entry)

    entries.sort(key=lambda item: (item["review_priority"], item["path"]))

    zone_counter = Counter(entry["zone"] for entry in entries)
    category_counter = Counter(entry["category"] for entry in entries)
    risk_counter = Counter(entry["risk"] for entry in entries)
    mode_counter = Counter(entry["audit_mode"] for entry in entries)
    state_counter = Counter(entry["file_state"] for entry in entries)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "source_mode": source_mode,
        "summary": {
            "total_files": len(entries),
            "total_bytes": sum(entry["size_bytes"] for entry in entries),
            "by_zone": dict(zone_counter),
            "by_category": dict(category_counter),
            "by_risk": dict(risk_counter),
            "by_audit_mode": dict(mode_counter),
            "by_file_state": dict(state_counter),
        },
        "files": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root to inspect.")
    parser.add_argument("--output", required=True, help="Output JSON path.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    manifest = build_manifest(root)
    output.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    summary = manifest["summary"]
    print(f"Wrote manifest: {output}")
    print(f"Files: {summary['total_files']}")
    print(f"Risk bands: {summary['by_risk']}")
    print(f"Audit modes: {summary['by_audit_mode']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
