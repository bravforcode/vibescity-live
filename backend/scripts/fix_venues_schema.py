import logging
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DB_URL = os.getenv("SUPABASE_DIRECT_URL")
logger = logging.getLogger("fix_venues_schema")


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")


def main() -> int:
    if not DB_URL:
        logger.error("Error: SUPABASE_DIRECT_URL not set in backend/.env")
        return 1

    logger.info("Connecting to DB using DIRECT_URL...")

    try:
        conn = psycopg2.connect(DB_URL)
    except psycopg2.Error as exc:
        logger.error("Database connection failed: %s", exc)
        return 1

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
        "CREATE INDEX IF NOT EXISTS idx_venues_lat_lon ON venues (latitude, longitude);",
    ]

    try:
        for cmd in commands:
            logger.info("Executing: %s", cmd)
            try:
                cur.execute(cmd)
            except psycopg2.Error as exc:
                logger.error("Error executing %s: %s", cmd, exc)

        logger.info("Schema updated successfully!")
        return 0
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    _configure_logging()
    raise SystemExit(main())
