#!/usr/bin/env python3
"""Run heuristic pattern scanning for repo-deep-audit."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from _audit_common import matches_any_glob, normalize_path, severity_sort_key

FLAG_MAP = {
    "IGNORECASE": re.IGNORECASE,
    "MULTILINE": re.MULTILINE,
    "DOTALL": re.DOTALL,
}


def compile_rule(raw_rule: dict[str, object]) -> dict[str, object]:
    flags = 0
    for flag_name in raw_rule.get("flags", []):
        flags |= FLAG_MAP.get(str(flag_name), 0)
    compiled = re.compile(str(raw_rule["regex"]), flags)
    return {**raw_rule, "compiled_regex": compiled}


def rule_applies(rule: dict[str, object], path: str, extension: str) -> bool:
    if not matches_any_glob(path, list(rule.get("path_globs", []))):
        return False
    if matches_any_glob(path, list(rule.get("exclude_path_globs", []))):
        return False
    extensions = list(rule.get("extensions", []))
    if "*" in extensions:
        return True
    return extension in extensions


def line_number_for(content: str, start_index: int) -> int:
    return content.count("\n", 0, start_index) + 1


def line_snippet(content: str, line_number: int) -> str:
    lines = content.splitlines()
    if line_number - 1 >= len(lines):
        return ""
    return lines[line_number - 1].strip()[:240]


def _preserve_newlines(text: str) -> str:
    return "".join("\n" if char == "\n" else " " for char in text)


def strip_sql_comments(content: str) -> str:
    without_block_comments = re.sub(
        r"/\*.*?\*/",
        lambda match: _preserve_newlines(match.group(0)),
        content,
        flags=re.DOTALL,
    )
    return re.sub(r"(?m)--.*$", "", without_block_comments)


def content_for_rule(content: str, rule: dict[str, object]) -> str:
    mode = str(rule.get("content_mode", "") or "").strip().lower()
    if mode == "strip_sql_comments":
        return strip_sql_comments(content)
    return content


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--manifest", required=True, help="Path to manifest JSON.")
    parser.add_argument("--rules", required=True, help="Rules JSON file.")
    parser.add_argument("--output", required=True, help="Output JSON path.")
    parser.add_argument("--max-file-size", type=int, default=3_000_000, help="Skip text files larger than this many bytes.")
    parser.add_argument("--max-matches-per-rule", type=int, default=25, help="Limit findings per file per rule.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    rules_payload = json.loads(Path(args.rules).read_text(encoding="utf-8"))
    compiled_rules = [compile_rule(rule) for rule in rules_payload.get("rules", [])]

    results: list[dict[str, object]] = []
    severity_counter = Counter()
    skipped_files = 0

    for entry in manifest.get("files", []):
        path = str(entry["path"])
        absolute_path = root / path
        extension = absolute_path.suffix.lower()
        if entry.get("is_binary") or not absolute_path.exists() or entry.get("size_bytes", 0) > args.max_file_size:
            skipped_files += 1
            continue

        try:
            content = absolute_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            skipped_files += 1
            continue

        findings: list[dict[str, object]] = []
        for rule in compiled_rules:
            if not rule_applies(rule, path, extension):
                continue
            scan_content = content_for_rule(content, rule)

            match_count = 0
            for match in rule["compiled_regex"].finditer(scan_content):
                match_count += 1
                if match_count > args.max_matches_per_rule:
                    break

                line_number = line_number_for(scan_content, match.start())
                findings.append(
                    {
                        "rule_id": rule["id"],
                        "severity": rule["severity"],
                        "description": rule["description"],
                        "line": line_number,
                        "snippet": line_snippet(content, line_number),
                        "remediation": rule["remediation"],
                    }
                )
                severity_counter[str(rule["severity"])] += 1

        if not findings:
            continue

        findings.sort(key=lambda item: (severity_sort_key(str(item["severity"])), item["line"], item["rule_id"]))
        results.append(
            {
                "path": normalize_path(path),
                "finding_count": len(findings),
                "highest_severity": findings[0]["severity"],
                "findings": findings,
            }
        )

    results.sort(key=lambda item: (severity_sort_key(str(item["highest_severity"])), item["path"]))

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "summary": {
            "files_with_findings": len(results),
            "findings_by_severity": dict(severity_counter),
            "skipped_files": skipped_files,
        },
        "files": results,
    }

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Wrote signals: {output}")
    print(f"Files with findings: {payload['summary']['files_with_findings']}")
    print(f"Severity counts: {payload['summary']['findings_by_severity']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
