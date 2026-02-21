from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import Request
from prometheus_client import Counter, Gauge, Histogram, CONTENT_TYPE_LATEST, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.config import Settings

logger = logging.getLogger("app.metrics")

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
)
IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "HTTP requests currently in progress",
    ["method", "path"],
)


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    if route and hasattr(route, "path"):
        return route.path
    return request.url.path


def _is_authorized(request: Request, token: str) -> bool:
    if not token:
        return True
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip() == token
    return request.headers.get("x-metrics-token") == token


class MetricsMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, metrics_path: str = "/metrics"):
        super().__init__(app)
        self.metrics_path = metrics_path

    async def dispatch(self, request: Request, call_next):
        if request.url.path == self.metrics_path:
            return await call_next(request)

        method = request.method
        path = _route_template(request)
        start = time.perf_counter()
        IN_PROGRESS.labels(method, path).inc()
        status_code: Optional[int] = None

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            status_code = 500
            raise
        finally:
            duration = time.perf_counter() - start
            IN_PROGRESS.labels(method, path).dec()
            REQUEST_LATENCY.labels(method, path).observe(duration)
            REQUEST_COUNT.labels(method, path, str(status_code or 500)).inc()


def install_metrics(app, settings: Settings) -> None:
    if not settings.METRICS_ENABLED:
        return

    metrics_path = "/metrics"
    if settings.ENV.lower() == "production" and not settings.METRICS_AUTH_TOKEN:
        logger.warning("METRICS_AUTH_TOKEN is required in production for /metrics.")
    app.add_middleware(MetricsMiddleware, metrics_path=metrics_path)

    @app.get(metrics_path)
    async def metrics_endpoint(request: Request):
        token = settings.METRICS_AUTH_TOKEN
        is_production = settings.ENV.lower() == "production"

        if is_production and not token:
            logger.warning("Metrics auth token missing in production; denying access.")
            return Response(status_code=401)

        if token and not _is_authorized(request, token):
            return Response(status_code=401)

        payload = generate_latest()
        return Response(content=payload, media_type=CONTENT_TYPE_LATEST)
