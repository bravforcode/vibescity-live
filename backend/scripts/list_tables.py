
import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import text

# Setup path to import from app package
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Try to load .env manually if needed, though app.core.config might handle it
try:
    from dotenv import load_dotenv
    env_path = BACKEND_DIR / ".env"
    if env_path.exists():
        print(f"Loading .env from {env_path}")
        load_dotenv(env_path)
except ImportError:
    pass

from app.db.session import _core_session_maker


async def list_tables():
    print("Connecting to database...")
    try:
        async with _core_session_maker.instance() as session:
            result = await session.execute(
                text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;")
            )
            rows = result.fetchall()

            print(f"\n--- Found {len(rows)} Tables in Public Schema ---")
            for row in rows:
                print(f"- {row[0]}")
            print("---------------------------------------------")
    except Exception as e:
        print(f"Error connecting to database: {e}")

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(list_tables())
