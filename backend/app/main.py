from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings, validate_settings
from app.core.logging import setup_logging
from app.core.observability import setup_observability
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import logging
import time
import uuid
from app.api.routers import vibes, rides, payments, shops, owner, ugc, emergency, admin, redemption, analytics, seo

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.core.rate_limit import limiter

settings = get_settings()
validate_settings(settings)
setup_logging(settings.ENV)

request_logger = logging.getLogger("app.request")

# ✅ Rate Limiting
@asynccontextmanager
async def lifespan(_app: FastAPI):
    await vibes.start_background_tasks()
    try:
        yield
    finally:
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
if settings.BACKEND_CORS_ORIGINS:
    allow_origin_regex = None
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
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
        expose_headers=["X-Request-ID"],
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
    return {"status": "ok", "version": settings.VERSION}

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
