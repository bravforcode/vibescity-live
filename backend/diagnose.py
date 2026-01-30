import sys
import os

print("Running diagnosis...")
try:
    print("1. Importing app.main...")
    from app.main import app
    print("   ✅ app.main imported successfully.")

    print("2. Checking settings...")
    from app.core.config import settings
    print(f"   ✅ Settings loaded. API_V1_STR={settings.API_V1_STR}")

    print("3. Checking routers...")
    from app.api.routers import vibes, rides, payments, shops, owner
    print("   ✅ All routers imported.")

except Exception as e:
    print(f"❌ ERROR: {e}")
    import traceback
    traceback.print_exc()
print("Diagnosis complete.")
