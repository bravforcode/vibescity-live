import os
import sys
import traceback

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

print("Testing config import...")
try:
    from app.core import config
    print("✅ Config imported successfully.")
    print(f"Settings: {config.get_settings()}")
except Exception:
    traceback.print_exc()
