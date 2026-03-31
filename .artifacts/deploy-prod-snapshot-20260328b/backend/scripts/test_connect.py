
import asyncio
import os
import sys

# Add backend to path so we can import app.core.config
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

try:
    from dotenv import load_dotenv
    # Force load backend/.env
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    print(f"Loading .env from: {env_path}")
    load_dotenv(env_path, override=True)

    from app.core.config import settings
except ImportError:
    print("[ERR] Could not import settings. Make sure you are in the root directory.")
    sys.exit(1)

async def test_postgres(name, url):
    print(f"\n--- Testing {name} ---")
    print(f"URL: {url}")
    try:
        import asyncpg
        conn = await asyncpg.connect(url, timeout=10)
        res = await conn.fetchval("SELECT 1")
        await conn.close()
        print(f"[OK] {name} Connected! (SELECT 1 = {res})")
        return True
    except Exception as e:
        print(f"[ERR] {name} Failed: {e}")
        return False

def test_qdrant():
    print("\n--- Testing Qdrant ---")
    print(f"URL: {settings.QDRANT_URL}")
    print(f"API_KEY: {settings.QDRANT_API_KEY[:5]}...")
    try:
        from qdrant_client import QdrantClient
        # Try HTTP first as it's often more reliable through firewalls/proxies
        print("Attempting HTTP connection...")
        client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
            timeout=10,
            prefer_grpc=False
        )
        collections = client.get_collections()
        print(f"[OK] Qdrant HTTP Connected! Found {len(collections.collections)} collections.")

        # Try GRPC
        print("Attempting GRPC connection...")
        client_grpc = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
            timeout=10,
            prefer_grpc=True,
            grpc_port=6334
        )
        collections_grpc = client_grpc.get_collections()
        print(f"[OK] Qdrant GRPC Connected! Found {len(collections_grpc.collections)} collections.")
        return True
    except Exception as e:
        print(f"[ERR] Qdrant Failed: {e}")
        return False

async def main():
    print("=== TRIAD CONNECTION TESTER ===")

    # 1. Supabase Core
    s_ok = await test_postgres("Supabase Core", settings.SUPABASE_DIRECT_URL)

    # 2. Neon History
    n_ok = await test_postgres("Neon History", settings.NEON_DIRECT_DATABASE_URL)

    # 3. Qdrant Memory
    q_ok = test_qdrant()

    print("\n=== SUMMARY ===")
    print(f"Supabase Core: {'[OK]' if s_ok else '[FAIL]'}")
    print(f"Neon History:  {'[OK]' if n_ok else '[FAIL]'}")
    print(f"Qdrant Memory: {'[OK]' if q_ok else '[FAIL]'}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
