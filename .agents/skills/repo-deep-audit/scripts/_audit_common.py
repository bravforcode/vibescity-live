#!/usr/bin/env python3
"""Shared helpers for the repo-deep-audit skill."""

from __future__ import annotations

import fnmatch
import os
import subprocess
from pathlib import Path

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

CONFIG_FILENAMES = {
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "render.yaml",
    "fly.toml",
    "vercel.json",
    "package.json",
    "package-lock.json",
    "bun.lock",
    "pnpm-lock.yaml",
    "yarn.lock",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "biome.json",
    "pyproject.toml",
    "requirements.txt",
    ".env",
    ".env.example",
}

TEXT_EXTENSIONS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".vue",
    ".py",
    ".sql",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".md",
    ".txt",
    ".html",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".mjs",
    ".cjs",
    ".ps1",
    ".sh",
    ".bash",
    ".env",
    ".ini",
    ".cfg",
    ".conf",
    ".csv",
    ".tsv",
    ".svg",
}

METADATA_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".avif",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".tgz",
    ".7z",
    ".rar",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".mp4",
    ".webm",
    ".mov",
    ".mp3",
    ".wav",
    ".ogg",
    ".pyc",
    ".skill",
}

REPO_WALK_EXCLUDES = {
    ".git",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
}


def normalize_path(path: str | Path) -> str:
    return str(path).replace("\\", "/").lstrip("./")


def git_tracked_files(root: Path) -> set[str]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z"],
        capture_output=True,
        text=False,
        check=False,
    )
    if result.returncode != 0:
        return set()
    return {
        normalize_path(item.decode("utf-8", errors="replace"))
        for item in result.stdout.split(b"\x00")
        if item
    }


def git_untracked_files(root: Path) -> set[str]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-o", "--exclude-standard", "-z"],
        capture_output=True,
        text=False,
        check=False,
    )
    if result.returncode != 0:
        return set()
    return {
        normalize_path(item.decode("utf-8", errors="replace"))
        for item in result.stdout.split(b"\x00")
        if item
    }


def repo_files(root: Path) -> list[tuple[str, str]]:
    tracked = git_tracked_files(root)
    untracked = git_untracked_files(root)
    files: list[tuple[str, str]] = []
    if tracked or untracked:
        for path in sorted(tracked):
            files.append((path, "tracked"))
        for path in sorted(untracked):
            if path not in tracked:
                files.append((path, "untracked"))
        return files

    for current_root, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in REPO_WALK_EXCLUDES]
        for filename in filenames:
            absolute = Path(current_root) / filename
            relative = normalize_path(absolute.relative_to(root))
            files.append((relative, "filesystem"))
    files.sort(key=lambda item: item[0])
    return files


def is_binary_file(path: Path) -> bool:
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return False
    if path.suffix.lower() in METADATA_EXTENSIONS:
        return True
    with path.open("rb") as handle:
        chunk = handle.read(4096)
    if not chunk:
        return False
    if b"\x00" in chunk:
        return True
    text_ratio = sum(byte >= 32 or byte in (9, 10, 13) for byte in chunk) / len(chunk)
    return text_ratio < 0.85


def count_lines(path: Path) -> int | None:
    try:
        with path.open("rb") as handle:
            line_count = 0
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                line_count += chunk.count(b"\n")
        return line_count + 1 if path.stat().st_size > 0 else 0
    except OSError:
        return None


def matches_any_glob(path: str, patterns: list[str] | None) -> bool:
    if not patterns:
        return True
    normalized = normalize_path(path)
    return any(fnmatch.fnmatch(normalized, pattern) for pattern in patterns)


def classify_file(path: str, size_bytes: int, is_binary: bool, lines: int | None) -> dict[str, object]:
    normalized = normalize_path(path)
    path_lower = normalized.lower()
    name_lower = Path(normalized).name.lower()
    ext_lower = Path(normalized).suffix.lower()

    if normalized.startswith("src/"):
        zone = "frontend"
    elif normalized.startswith("backend/"):
        zone = "backend"
    elif normalized.startswith("supabase/"):
        zone = "data-platform"
    elif normalized.startswith("tests/") or normalized.startswith("backend/tests/"):
        zone = "tests"
    elif normalized.startswith("scripts/"):
        zone = "automation"
    elif normalized.startswith("docs/"):
        zone = "docs"
    elif normalized.startswith(".github/"):
        zone = "ci"
    elif normalized.startswith(".agents/skills/") or normalized.startswith("skills/") or normalized.startswith(".agent/agents/"):
        zone = "skills"
    elif normalized.startswith("public/") or normalized.startswith("assets/"):
        zone = "assets"
    else:
        zone = "repo"

    if name_lower in CONFIG_FILENAMES:
        category = "config"
    elif "snapshots/" in path_lower or path_lower.endswith(".snap"):
        category = "snapshot"
    elif normalized.startswith("docs/") or ext_lower in {".md", ".txt", ".rst"}:
        category = "documentation"
    elif normalized.startswith("tests/") or normalized.startswith("backend/tests/") or ".spec." in name_lower or ".test." in name_lower:
        category = "test"
    elif "migrations/" in path_lower:
        category = "migration"
    elif ext_lower == ".sql":
        category = "sql"
    elif zone == "skills":
        category = "skill"
    elif normalized.startswith("scripts/"):
        category = "script"
    elif ext_lower in {".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf"}:
        category = "config"
    elif normalized.startswith("reports/") or "/reports/" in path_lower:
        category = "generated-report"
    elif normalized.startswith("src/") or normalized.startswith("backend/") or normalized.startswith("supabase/functions/"):
        category = "source"
    elif is_binary:
        category = "asset"
    elif ext_lower in {".csv", ".tsv"}:
        category = "data-file"
    else:
        category = "supporting-file"

    critical_markers = [
        "payment",
        "auth",
        "rls",
        "supabase/migrations",
        "supabase/functions",
        ".github/workflows",
        "vercel.json",
        "render.yaml",
        "fly.toml",
        "dockerfile",
        ".env",
        "backend/app/core",
        "config.toml",
    ]
    if category == "migration" or any(marker in path_lower for marker in critical_markers):
        risk = "critical"
    elif category in {"source", "config", "sql"} or zone in {"frontend", "backend", "data-platform", "ci"}:
        risk = "high"
    elif category in {"test", "script", "documentation", "skill", "data-file"}:
        risk = "medium"
    else:
        risk = "low"

    if is_binary or category in {"snapshot", "generated-report", "asset"}:
        audit_mode = "metadata"
        audit_reason = "Binary or generated-like artifact; review by metadata, purpose, and governance."
    elif category == "config" and size_bytes > 1_500_000:
        audit_mode = "sampled"
        audit_reason = "Large config-like file; inspect structure and hotspots first."
    elif lines is not None and lines > 3000:
        audit_mode = "sampled"
        audit_reason = "Large text file; start with hotspots and representative sections."
    else:
        audit_mode = "deep"
        audit_reason = "Text file suitable for full direct review."

    priority_map = {"critical": 1, "high": 2, "medium": 3, "low": 4}
    mode_weight = {"deep": 0, "sampled": 1, "metadata": 2}

    return {
        "zone": zone,
        "category": category,
        "risk": risk,
        "audit_mode": audit_mode,
        "audit_reason": audit_reason,
        "review_priority": priority_map[risk] * 10 + mode_weight[audit_mode],
    }


def severity_sort_key(value: str) -> int:
    return SEVERITY_ORDER.get(value, 99)
