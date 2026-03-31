"""Vercel Python entrypoint for the FastAPI backend."""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    from app.main import app
except Exception as exc:  # pragma: no cover - import failure must surface at boot
    raise RuntimeError(
        "Failed to load backend FastAPI app from backend/app/main.py. "
        "Verify Python dependencies and required backend environment variables."
    ) from exc


__all__ = ["app"]
