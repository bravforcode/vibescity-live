import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routers import (
    admin,
    analytics,
    emergency,
    owner,
    partner,
    payments,
    places,
    proxy,
    redemption,
    rides,
    seo,
    shops,
    ugc,
    vibes,
    visitor,
)
from app.core.config import get_settings, validate_settings
from app.core.logging import setup_logging
from app.core.observability import setup_observability
from app.core.rate_limit import limiter

settings = get_settings()
validate_settings(settings)
setup_logging(settings.ENV)

request_logger = logging.getLogger("app.request")

# ✅ Rate Limiting
@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio

    from app.jobs import triad_reconcile

    await vibes.start_background_tasks()
    _reconcile_task = asyncio.create_task(triad_reconcile.run_forever())
    try:
        yield
    finally:
        _reconcile_task.cancel()
        await vibes.stop_background_tasks()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Set all CORS enabled origins
cors_origins = [
    str(origin).strip()
    for origin in (settings.BACKEND_CORS_ORIGINS or [])
    if str(origin).strip()
]
if settings.FRONTEND_URL:
    cors_origins.append(str(settings.FRONTEND_URL).strip())
if not cors_origins:
    cors_origins = [
        "https://vibecity.live",
        "http://localhost:5418",
        "http://127.0.0.1:5418",
        "http://localhost:5417",
        "http://127.0.0.1:5417",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
cors_origins = list(dict.fromkeys(cors_origins))

allow_origin_regex = (
    r"^https?://("
    r"localhost|127\.0\.0\.1"
    r")(?::\d+)?$"
)
if settings.ENV.lower() != "production":
    # Allow common LAN dev origins (e.g. phone testing via http://10.x.x.x:5173)
    allow_origin_regex = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r")(?::\d+)?$"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # Allow all request headers to avoid preflight rejections for visitor/auth headers.
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
    max_age=86400,
)

setup_observability(app, settings)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            request_logger.exception(
                "http_request_failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration_ms, 2),
                },
            )
            raise

        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        request_logger.info(
            "http_request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
        return response


app.add_middleware(RequestIdMiddleware)


@app.get("/health")
async def health_check():
    from app.core.supabase import supabase_admin

    checks: dict = {}
    strict_health = settings.ENV.lower() == "production"
    overall = "ok"

    # H2: Supabase — lightweight read to verify DB connectivity
    if not supabase_admin:
        checks["supabase"] = "not_configured"
        if strict_health:
            overall = "degraded"
    else:
        try:
            supabase_admin.table("orders").select("id").limit(1).execute()
            checks["supabase"] = "ok"
        except Exception:
            checks["supabase"] = "degraded"
            if strict_health:
                overall = "degraded"

    # H2: Redis — ping to verify cache layer
    try:
        from app.services.cache.redis_client import get_redis
        redis_conn = get_redis()
        redis_conn.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "degraded"
        if strict_health:
            overall = "degraded"

    # H2: Qdrant — check via services module (optional, soft fail)
    try:
        from app.services.vector.places_vector_service import _is_circuit_open
        checks["qdrant"] = "circuit_open" if _is_circuit_open() else "ok"
    except Exception:
        checks["qdrant"] = "unknown"

    return {"status": overall, "version": settings.VERSION, "checks": checks}

@app.get("/")
async def root():
    return {"message": "Welcome to VibeCity API", "docs": "/docs"}

# Include Routers
app.include_router(vibes.router, prefix=settings.API_V1_STR + "/vibes", tags=["vibes"])
app.include_router(rides.router, prefix=settings.API_V1_STR + "/rides", tags=["rides"])
app.include_router(payments.router, prefix=settings.API_V1_STR + "/payments", tags=["payments"])
app.include_router(shops.router, prefix=settings.API_V1_STR + "/shops", tags=["shops"])
app.include_router(owner.router, prefix=settings.API_V1_STR + "/owner", tags=["owner"])
app.include_router(ugc.router, prefix=settings.API_V1_STR + "/ugc", tags=["ugc"])
app.include_router(emergency.router, prefix=settings.API_V1_STR + "/emergency", tags=["emergency"])
app.include_router(admin.router, prefix=settings.API_V1_STR + "/admin", tags=["admin"])
app.include_router(redemption.router, prefix=settings.API_V1_STR + "/redemption", tags=["redemption"])
app.include_router(analytics.router, prefix=settings.API_V1_STR + "/analytics", tags=["analytics"])
app.include_router(seo.router, prefix=settings.API_V1_STR + "/seo", tags=["seo"])
app.include_router(partner.router, prefix=settings.API_V1_STR + "/partner", tags=["partner"])
app.include_router(visitor.router, prefix=settings.API_V1_STR + "/visitor", tags=["visitor"])
app.include_router(places.router, prefix=settings.API_V1_STR + "/places", tags=["places"])
app.include_router(proxy.router, prefix=settings.API_V1_STR, tags=["proxy"])
