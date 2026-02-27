import os
import sys

import psycopg2
from dotenv import load_dotenv

# Load env from backend/.env
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

DB_URL = os.getenv("SUPABASE_DIRECT_URL")

if not DB_URL:
    print("❌ Error: SUPABASE_DIRECT_URL not found.")
    sys.exit(1)

try:
    print("🔌 Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    print("🧪 Attempting to insert dummy venue...")

    # Try inserting a minimal record with all columns logic
    insert_sql = """
    INSERT INTO venues (
        name, category, location, province, status, source,
        vibe_info, open_time, social_links, legacy_shop_id, osm_id,
        osm_type, h3_cell, content_hash, source_hash, osm_version,
        osm_timestamp, last_seen_at, last_osm_sync, latitude, longitude
    ) VALUES (
        'Test Venue', 'Test Category', 'SRID=4326;POINT(100.5 13.7)', 'Bangkok', 'active', 'osm',
        'Vibe info test', '09:00-18:00', '{"website": "example.com"}'::jsonb, 123456789, 'node/123456789',
        'node', '896546464', 'hash123', 'src123', 1,
        NOW(), NOW(), NOW(), 13.7, 100.5
    )
    ON CONFLICT (osm_type, legacy_shop_id) DO UPDATE SET
        name = EXCLUDED.name,
        last_seen_at = NOW();
    """

    cur.execute(insert_sql)
    print("✅ Insert SUCCESS! The schema is correct.")

    # Cleanup
    cur.execute("DELETE FROM venues WHERE osm_id = 'node/123456789';")
    print("🧹 Cleanup SUCCESS.")

    cur.close()
    conn.close()

except Exception as e:
    print(f"\n❌ INSERT FAILED: {e}")
    # Print specific PG error code if available
    if hasattr(e, 'pgcode'):
        print(f"   PG Code: {e.pgcode}")
