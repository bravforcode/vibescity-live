import logging
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ENV: str = "development"
    PROJECT_NAME: str = "VibeCity API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5417",
        "http://localhost:5418",
        "https://vibecity.live",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5417",
        "http://127.0.0.1:5418",
    ]
    VISITOR_SIGNING_SECRET: str = ""  # MUST be set in production — empty = token forgery risk
    VISITOR_TOKEN_TTL_SECONDS: int = 604800

    # External APIs
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    MAPBOX_ACCESS_TOKEN: str = ""

    # Real-time
    MAX_CONNECTIONS: int = 1000
    MAP_EFFECT_POLL_MS: int = 750
    HOTSPOT_BROADCAST_MS: int = 30000
    MAP_EFFECT_BATCH_SIZE: int = 50

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    DATABASE_URL: str = ""
    NEON_DATABASE_URL: str = ""

    # Redis / Queues
    REDIS_URL: str = ""
    OCR_QUEUE_STREAM: str = "slip:ocr"
    OCR_QUEUE_GROUP: str = "slip-ocr-group"
    OCR_QUEUE_CONSUMER: str = "slip-ocr-1"

    # Frontend / Redirect Safety
    FRONTEND_URL: str = "https://vibecity.live"
    ALLOWED_CHECKOUT_REDIRECT_HOSTS: list[str] = [
        "vibecity.live",
        "localhost",
        "127.0.0.1"
    ]

    # Notifications
    ONESIGNAL_APP_ID: str = ""
    ONESIGNAL_API_KEY: str = ""
    DISCORD_WEBHOOK_URL: str = ""
    IPINFO_TOKEN: str = ""

    # Google Sheets Server Logger
    SHEETS_LOGGER_ENABLED: bool = False
    SHEETS_LOGGER_FULL_DETAIL: bool = True
    SHEETS_LOGGER_TIMEOUT_MS: int = 2200
    SHEETS_WEBHOOK_EVENTS_URL: str = ""
    SHEETS_WEBHOOK_PARTNER_URL: str = ""
    SHEETS_WEBHOOK_PAYMENTS_URL: str = ""
    SHEETS_WEBHOOK_SECRET: str = ""
    SHEETS_STRATEGY: str = "db_sync"  # db_sync | legacy_webhook
    GOOGLE_SHEETS_CREDENTIALS_PATH: str = ""
    GOOGLE_SHEETS_SPREADSHEET_ID: str = ""
    GOOGLE_SHEETS_SHEET_NAME: str = "Anonymous Analytics"
    GOOGLE_SHEETS_AUTO_SYNC: bool = False
    GOOGLE_SHEETS_SYNC_INTERVAL: int = 15
    GOOGLE_SHEETS_DATA_RETENTION_DAYS: int = 30
    GOOGLE_SHEETS_ENABLE_ANONYMIZATION: bool = True

    # Admin access fallback (email allowlist, comma-separated).
    # Keep empty by default and set explicitly per environment.
    ADMIN_EMAIL_ALLOWLIST: str = ""

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
    PAYPAL_CLIENT_ID: str | None = None

    # Google Maps / Street View
    GOOGLE_API_KEY: str = ""
    GOOGLE_MAPS_API_KEY: str = ""
    PAYPAL_SECRET: str | None = None
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
    OPENAI_API_KEY: str | None = None
    MEMORY_DATABASE_URL: str | None = None  # postgres://... (Supabase direct DB URL)
    GOOGLE_API_KEY: str | None = None  # For Gemini support

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

@lru_cache
def get_settings():
    return Settings()

settings = get_settings()


def validate_settings(settings: Settings) -> None:
    """
    Warn in development and fail fast in production if critical secrets are missing.
    Token signing secret is always required — empty string allows token forgery.
    """
    is_prod = settings.ENV.lower() == "production"

    # Always-fatal: empty signing secret allows forging visitor tokens in any env
    if not settings.VISITOR_SIGNING_SECRET:
        raise RuntimeError(
            "VISITOR_SIGNING_SECRET must not be empty. "
            "An empty secret allows anyone to forge visitor tokens."
        )

    missing = []
    if not settings.STRIPE_SECRET_KEY:
        missing.append("STRIPE_SECRET_KEY")
    if not settings.SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not settings.SUPABASE_KEY:
        missing.append("SUPABASE_KEY")
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not settings.DATABASE_URL:
        missing.append("DATABASE_URL")
    if not settings.REDIS_URL:
        missing.append("REDIS_URL")

    # Warn-only for optional services
    if not settings.PAYPAL_CLIENT_ID:
        logging.warning("⚠️ PAYPAL_CLIENT_ID not set. PayPal payments will fail.")

    if not missing:
        return

    msg = f"Missing required config: {', '.join(missing)}"
    if is_prod:
        raise RuntimeError(msg)
    logging.warning("⚠️ %s", msg)
