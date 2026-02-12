from functools import lru_cache
from typing import List, Optional
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ENV: str = "development"
    PROJECT_NAME: str = "VibeCity API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://vibecity.live",
        "http://127.0.0.1:3000"
    ]

    # External APIs
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""

    # Real-time
    MAX_CONNECTIONS: int = 1000
    MAP_EFFECT_POLL_MS: int = 750
    HOTSPOT_BROADCAST_MS: int = 30000
    MAP_EFFECT_BATCH_SIZE: int = 50

    # Supabase
    SUPABASE_URL: str = "https://your-project.supabase.co"
    SUPABASE_KEY: str = "your-anon-key"
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Redis / Queues
    REDIS_URL: str = ""
    OCR_QUEUE_STREAM: str = "slip:ocr"
    OCR_QUEUE_GROUP: str = "slip-ocr-group"
    OCR_QUEUE_CONSUMER: str = "slip-ocr-1"

    # Frontend / Redirect Safety
    FRONTEND_URL: str = "https://vibecity.live"
    ALLOWED_CHECKOUT_REDIRECT_HOSTS: List[str] = [
        "vibecity.live",
        "localhost",
        "127.0.0.1"
    ]

    # Notifications
    ONESIGNAL_APP_ID: str = ""
    ONESIGNAL_API_KEY: str = ""
    DISCORD_WEBHOOK_URL: str = ""
    IPINFO_TOKEN: str = ""

    # Slip Verification (OCR)
    SLIP_EXPECT_RECEIVER_NAME: str = ""
    SLIP_EXPECT_RECEIVER_BANKS: str = ""
    SLIP_EXPECT_RECEIVER_ACCOUNT: str = ""
    SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL: int = 4
    SLIP_DISABLE_MANUAL_REVIEW: bool = False
    SLIP_DUPLICATE_WINDOW_DAYS: int = 90
    SLIP_STORE_OCR_RAW: bool = False
    GCV_SERVICE_ACCOUNT_JSON: str = ""
    GCV_PROJECT_ID: str = ""
    GCV_OCR_MAX_BYTES: int = 5242880

    # PayPal
    PAYPAL_CLIENT_ID: Optional[str] = None
    PAYPAL_SECRET: Optional[str] = None
    PAYPAL_MODE: str = "sandbox"  # sandbox or live

    # Observability
    METRICS_ENABLED: bool = True
    METRICS_AUTH_TOKEN: str = ""
    OTEL_ENABLED: bool = False
    OTEL_SERVICE_NAME: str = "vibecity-backend"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""
    OTEL_TRACES_SAMPLER_ARG: float = 0.1

    # Memory (mem0 + pgvector)
    MEMORY_ENABLED: bool = False
    OPENAI_API_KEY: Optional[str] = None
    MEMORY_DATABASE_URL: Optional[str] = None  # postgres://... (Supabase direct DB URL)

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()


def validate_settings(settings: Settings):
    """
    Warn in development and fail fast in production if critical secrets are missing.
    """
    placeholders = {
        "SUPABASE_URL": settings.SUPABASE_URL.startswith("https://your-project"),
        "SUPABASE_KEY": settings.SUPABASE_KEY in ("", "your-anon-key"),
    }
    missing = []
    if not settings.STRIPE_SECRET_KEY:
        missing.append("STRIPE_SECRET_KEY")
    if placeholders["SUPABASE_URL"]:
        missing.append("SUPABASE_URL")
    if placeholders["SUPABASE_KEY"]:
        missing.append("SUPABASE_KEY")
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not settings.REDIS_URL:
        missing.append("REDIS_URL")

    # PayPal Warn Only
    if not settings.PAYPAL_CLIENT_ID:
        logging.warning("⚠️ PAYPAL_CLIENT_ID not set. PayPal payments will fail.")

    if not missing:
        return

    msg = f"Missing or placeholder config: {', '.join(missing)}"
    if settings.ENV.lower() == "production":
        raise RuntimeError(msg)
    logging.warning(msg)
