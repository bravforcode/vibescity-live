import sys
import os
import traceback

# Ensure backend dir is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

error_file = "explicit_error.txt"

try:
    with open(error_file, "w", encoding="utf-8") as f:
        try:
            print("Testing app.main import...")
            from app import main
            print("✅ app.main imported successfully.")
            f.write("SUCCESS")
        except Exception:
            traceback.print_exc(file=f)
            print("❌ Import failed. Check explicit_error.txt")
except Exception as e:
    print(f"Critical script error: {e}")
