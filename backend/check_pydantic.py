import pydantic
import pydantic_settings

print(f"Pydantic Version: {pydantic.VERSION}")
print(f"Pydantic Settings Version: {pydantic_settings.__version__}")

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    print("✅ Successfully imported BaseSettings, SettingsConfigDict")
except ImportError as e:
    print(f"❌ Failed import: {e}")

try:
    class TestSettings(BaseSettings):
        model_config = SettingsConfigDict(case_sensitive=True)
    print("✅ TestSettings V2 defined successfully")
except Exception as e:
    print(f"❌ Failed TestSettings V2: {e}")

try:
    class TestSettingsV1(BaseSettings):
        class Config:
            case_sensitive = True
    print("✅ TestSettings V1 defined successfully")
except Exception as e:
    print(f"❌ Failed TestSettings V1: {e}")
