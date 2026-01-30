from functools import lru_cache
from typing import List

try:
    # Pydantic V2 / pydantic-settings
    from pydantic_settings import BaseSettings, SettingsConfigDict
    class Settings(BaseSettings):
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

        # Supabase
        SUPABASE_URL: str = "https://your-project.supabase.co"
        SUPABASE_KEY: str = "your-anon-key"

        model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

except ImportError:
    # Pydantic V1 Fallback
    try:
        from pydantic import BaseSettings
    except ImportError:
        # Fallback for pydantic-settings if pydantic.BaseSettings is gone in V2
        from pydantic_settings import BaseSettings

    class Settings(BaseSettings):
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

        # Supabase
        SUPABASE_URL: str = "https://your-project.supabase.co"
        SUPABASE_KEY: str = "your-anon-key"

        class Config:
            env_file = ".env"
            case_sensitive = True

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
