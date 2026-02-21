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
    host = os.getenv("BACKEND_HOST", "0.0.0.0").strip() or "0.0.0.0"
    port = int(os.getenv("BACKEND_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
