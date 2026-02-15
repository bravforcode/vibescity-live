#!/usr/bin/env python3
"""
VibeCity Memory CLI — Ingest and search project memory.

Usage:
    python backend/scripts/manage_memory.py ingest <path>
    python backend/scripts/manage_memory.py search "<query>"

Prerequisites:
    Set these env vars (or in backend/.env):
        MEMORY_ENABLED=true
        OPENAI_API_KEY=sk-...
        MEMORY_DATABASE_URL=postgres://user:pass@host:port/dbname

    Run in Supabase SQL Editor first:
        CREATE EXTENSION IF NOT EXISTS vector;
"""

import os
import sys
from pathlib import Path

# Ensure backend/ is on sys.path so `from app.…` works
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Load .env from backend directory
try:
    from dotenv import load_dotenv

    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        load_dotenv(env_file)
    # Also try project root .env
    root_env = BACKEND_DIR.parent / ".env"
    if root_env.exists():
        load_dotenv(root_env, override=False)
except ImportError:
    pass  # python-dotenv is optional here


def print_setup_instructions():
    """Print how to enable memory service."""
    print(
        """
╔══════════════════════════════════════════════════════════════╗
║  VibeCity Memory Service is DISABLED                        ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  To enable, set these in backend/.env:                       ║
║                                                              ║
║    MEMORY_ENABLED=true                                       ║
║    MEMORY_DATABASE_URL=postgres://user:pass@host:port/db     ║
║                                                              ║
║    And ONE of the following API keys:                        ║
║    GOOGLE_API_KEY=AIzaSy... (For Gemini/Vertex AI)           ║
║    OPENAI_API_KEY=sk-...    (For OpenAI)                     ║
║                                                              ║
║  Then run in Supabase SQL Editor:                            ║
║    CREATE EXTENSION IF NOT EXISTS vector;                    ║
║                                                              ║
║  ⚠️  MEMORY_DATABASE_URL must be a Postgres connection      ║
║      string, NOT the Supabase HTTP URL.                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"""
    )


def cmd_ingest(target_path: str):
    """Ingest .md and .txt files from a directory or single file."""
    from app.services.memory_service import memory_service

    if not memory_service.is_enabled:
        print_setup_instructions()
        sys.exit(1)

    target = Path(target_path).resolve()
    if not target.exists():
        print(f"❌ Path not found: {target}")
        sys.exit(1)

    # Collect files
    if target.is_file():
        files = [target]
    else:
        files = sorted(
            p
            for p in target.rglob("*")
            if p.suffix.lower() in (".md", ".txt") and p.is_file()
        )

    if not files:
        print(f"⚠️  No .md/.txt files found in: {target}")
        sys.exit(0)

    print(f"📁 Ingesting {len(files)} file(s) from: {target}")

    success = 0
    for f in files:
        try:
            content = f.read_text(encoding="utf-8", errors="replace")
            if not content.strip():
                print(f"  ⏭️  Skipping empty: {f.name}")
                continue

            # Chunk large files (mem0 has token limits)
            max_chars = 8000
            chunks = [content[i : i + max_chars] for i in range(0, len(content), max_chars)]

            for idx, chunk in enumerate(chunks):
                metadata = {
                    "filename": f.name,
                    "path": str(f),
                    "type": f.suffix.lstrip("."),
                    "chunk": idx if len(chunks) > 1 else None,
                }
                # Remove None values
                metadata = {k: v for k, v in metadata.items() if v is not None}

                mem_id = memory_service.add_memory(chunk, metadata=metadata)
                if mem_id:
                    suffix = f" (chunk {idx + 1}/{len(chunks)})" if len(chunks) > 1 else ""
                    print(f"  ✅ {f.name}{suffix} → {mem_id}")
                    success += 1
                else:
                    print(f"  ❌ Failed: {f.name}")
        except Exception as e:
            print(f"  ❌ Error reading {f.name}: {e}")

    print(f"\n📊 Done: {success} chunk(s) ingested from {len(files)} file(s).")


def cmd_search(query: str):
    """Search project memory."""
    from app.services.memory_service import memory_service

    if not memory_service.is_enabled:
        print_setup_instructions()
        sys.exit(1)

    print(f"🔍 Searching: \"{query}\"\n")

    results = memory_service.search_memory(query, top_k=5)

    if not results:
        print("  No results found.")
        return

    for i, r in enumerate(results, 1):
        memory = r.get("memory", r.get("text", str(r)))
        score = r.get("score", "N/A")
        metadata = r.get("metadata", {})
        filename = metadata.get("filename", "—")

        print(f"  [{i}] (score: {score}) [{filename}]")
        # Truncate long memory text for display
        display = memory[:300] + "…" if len(str(memory)) > 300 else memory
        print(f"      {display}\n")


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python manage_memory.py ingest <path>")
        print('  python manage_memory.py search "<query>"')
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "ingest":
        if len(sys.argv) < 3:
            print("❌ Missing path argument. Usage: manage_memory.py ingest <path>")
            sys.exit(1)
        cmd_ingest(sys.argv[2])

    elif command == "search":
        if len(sys.argv) < 3:
            print('❌ Missing query argument. Usage: manage_memory.py search "<query>"')
            sys.exit(1)
        cmd_search(sys.argv[2])

    else:
        print(f"❌ Unknown command: {command}")
        print("Available commands: ingest, search")
        sys.exit(1)


if __name__ == "__main__":
    main()
