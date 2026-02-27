import os

import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

DB_URL = os.getenv("SUPABASE_DIRECT_URL")

if not DB_URL:
    print("Error: SUPABASE_DIRECT_URL not set in backened/.env")
    exit(1)

print("Connecting to DB using DIRECT_URL...")

try:
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    commands = [
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS vibe_info TEXT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS open_time TEXT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS legacy_shop_id BIGINT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS osm_type TEXT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS h3_cell TEXT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS content_hash TEXT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS source_hash TEXT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS osm_version INT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS osm_timestamp TIMESTAMPTZ;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS last_osm_sync TIMESTAMPTZ;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS osm_id TEXT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS osm_type TEXT;",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS legacy_shop_id BIGINT;",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_osm_type_legacy_shop_id_key') THEN ALTER TABLE venues ADD CONSTRAINT venues_osm_type_legacy_shop_id_key UNIQUE (osm_type, legacy_shop_id); END IF; END $$;",
        "CREATE INDEX IF NOT EXISTS idx_venues_h3_cell ON venues (h3_cell);",
        "CREATE INDEX IF NOT EXISTS idx_venues_category ON venues (category);",
        "CREATE INDEX IF NOT EXISTS idx_venues_osm_id ON venues (osm_id);",
        "CREATE INDEX IF NOT EXISTS idx_venues_lat_lon ON venues (latitude, longitude);"
    ]

    for cmd in commands:
        print(f"Executing: {cmd}")
        try:
            cur.execute(cmd)
        except Exception as e:
            print(f"Error executing {cmd}: {e}")

    print("Schema updated successfully!")
    cur.close()
    conn.close()

except Exception as e:
    print(f"Database connection failed: {e}")
