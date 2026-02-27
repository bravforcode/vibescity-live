"""
Schema Tools - Introspect and Compare Postgres Schemas.

Usage:
    python backend/scripts/schema_tools.py --old <OLD_URL> --new <NEW_URL>
"""

import asyncio
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg


# Reuse connection logic to handle SSL modes correctly
def _to_async_url(url: str) -> str:
    # Basic cleanup for asyncio (we stick to asyncpg directly here, so just keep params clean)
    parsed = urlsplit(url)
    # Filter out params asyncpg doesn't like in DSN
    bad_params = {"sslmode", "sslrootcert", "sslcert", "sslkey", "channel_binding"}
    if parsed.query:
        query_items = parse_qsl(parsed.query, keep_blank_values=True)
        filtered = [(k, v) for k, v in query_items if k.lower() not in bad_params]
        url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(filtered), parsed.fragment))
    return url


async def get_schema(url: str):
    print(f"Connecting to {url.split('@')[-1]}...")
    clean_url = _to_async_url(url)

    # Try connecting. If SSL is needed, asyncpg usually defaults to 'prefer' or we might need explicit ssl='require' context
    # But for now, let's try default. If it fails, we might need a tighter logic like in session.py
    start_time = asyncio.get_event_loop().time()
    try:
        # Explicitly set 10s timeout
        conn = await asyncio.wait_for(asyncpg.connect(clean_url), timeout=10.0)
        print(f"Connected to {url.split('@')[-1]} in {asyncio.get_event_loop().time() - start_time:.2f}s")
    except Exception as e:
        print(f"\n[ERROR] Connection failed to {clean_url.split('@')[-1]}: {e}\n")
        import traceback
        traceback.print_exc()
        return None

    try:
        # Get Tables
        tables = await conn.fetch("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)

        schema = {}
        for row in tables:
            t_name = row['table_name']
            columns = await conn.fetch("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position;
            """, t_name)

            schema[t_name] = {
                "columns": {
                    c['column_name']: {
                        "type": c['data_type'],
                        "nullable": c['is_nullable']
                    } for c in columns
                }
            }
        return schema
    finally:
        await conn.close()

def compare_schemas(old, new):
    print("\n=== SCHEMA COMPARISON ===\n")

    old_tables = set(old.keys())
    new_tables = set(new.keys())

    missing_tables = old_tables - new_tables
    if missing_tables:
        print("MISSING TABLES (Present in Old, Missing in New):")
        for t in missing_tables:
            print(f"  - {t}")
    else:
        print("✓ All tables from Old exist in New.")

    print("\nCOLUMN DIFFERENCES:")
    issues_found = False
    for t in old_tables & new_tables:
        old_cols = old[t]['columns']
        new_cols = new[t]['columns']

        missing_cols = set(old_cols.keys()) - set(new_cols.keys())
        if missing_cols:
            print(f"Table '{t}' is missing columns:")
            for c in missing_cols:
                print(f"  - {c} ({old_cols[c]['type']})")
            issues_found = True

        # Check type mismatches
        for c in old_cols.keys() & new_cols.keys():
            ot = old_cols[c]['type']
            nt = new_cols[c]['type']
            if ot != nt:
                print(f"Table '{t}' column '{c}' type mismatch: Old={ot}, New={nt}")
                issues_found = True

    if not issues_found and not missing_tables:
        print("\n✓ Schema structure is compatible!")
    elif issues_found:
        print("\n⚠️  Schema differences found. Migration might need adjustments.")


async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--old", required=True)
    parser.add_argument("--new", required=True)
    args = parser.parse_args()

    print("Fetching Old Schema...")
    old_schema = await get_schema(args.old)

    print("Fetching New Schema...")
    new_schema = await get_schema(args.new)

    if old_schema and new_schema:
        compare_schemas(old_schema, new_schema)
    else:
        print("Failed to fetch one or both schemas.")

if __name__ == "__main__":
    asyncio.run(main())
