import pytest

from app.core.config import Settings, validate_settings


def test_validate_settings_production_raises():
    settings = Settings(
        ENV="production",
        STRIPE_SECRET_KEY="",
        SUPABASE_URL="https://your-project.supabase.co",
        SUPABASE_KEY="your-anon-key",
    )
    with pytest.raises(RuntimeError):
        validate_settings(settings)


def test_validate_settings_development_warns():
    settings = Settings(
        ENV="development",
        STRIPE_SECRET_KEY="",
        SUPABASE_URL="https://your-project.supabase.co",
        SUPABASE_KEY="your-anon-key",
    )
    validate_settings(settings)
