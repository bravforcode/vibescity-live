import uvicorn
import os
import sys

# Ensure backend dir is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

print("[INFO] Starting VibeCity Backend via run_backend.py...")
try:
    from app.main import app
    print("[OK] App loaded successfully.")
except Exception as e:
    print(f"[ERROR] Failed to load app: {e}")
    sys.exit(1)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
