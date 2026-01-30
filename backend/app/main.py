from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.routers import vibes, rides, payments, shops, owner

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.rate_limit import limiter

settings = get_settings()

# ✅ Rate Limiting
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": settings.VERSION}

@app.get("/")
async def root():
    return {"message": "Welcome to VibeCity API"}

# Include Routers
app.include_router(vibes.router, prefix=settings.API_V1_STR + "/vibes", tags=["vibes"])
app.include_router(rides.router, prefix=settings.API_V1_STR + "/rides", tags=["rides"])
app.include_router(payments.router, prefix=settings.API_V1_STR + "/payments", tags=["payments"])
app.include_router(shops.router, prefix=settings.API_V1_STR + "/shops", tags=["shops"])
app.include_router(owner.router, prefix=settings.API_V1_STR + "/owner", tags=["owner"])
