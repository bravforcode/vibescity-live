from __future__ import annotations

from app.core.config import Settings
from app.core.metrics import install_metrics
from app.core.otel import setup_tracing


def setup_observability(app, settings: Settings) -> None:
    install_metrics(app, settings)
    setup_tracing(app, settings)
