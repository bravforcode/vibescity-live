import asyncio
import logging
import os
import sys
from pathlib import Path
import asyncpg
from dotenv import load_dotenv

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("enterprise_updates")

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MIGRATIONS = [
    _REPO_ROOT / "supabase" / "migrations" / "20260330110000_vc101_postgis_optimization.sql",
    _REPO_ROOT / "supabase" / "migrations" / "20260330120000_setup_geodata_refresh_cron.sql"
]

async def run_sql_migration(conn, file_path):
    logger.info(f"Running migration: {file_path.name}")
    sql = file_path.read_text(encoding="utf-8")
    try:
        await conn.execute(sql)
        logger.info(f"✅ Migration {file_path.name} completed successfully.")
    except Exception as e:
        logger.error(f"❌ Failed to run migration {file_path.name}: {e}")
        raise

async def verify_cron_and_mv(conn):
    logger.info("Verifying Cron Job and Materialized View status...")
    try:
        # Check Materialized View
        mv_exists = await conn.fetchval("SELECT to_regclass('public.mv_venue_geodata')")
        if mv_exists:
            count = await conn.fetchval("SELECT count(*) FROM public.mv_venue_geodata")
            logger.info(f"✅ Materialized View 'mv_venue_geodata' exists with {count} records.")
        else:
            logger.warning("⚠️ Materialized View 'mv_venue_geodata' not found.")

        # Check Cron Job (requires access to cron schema, might fail if permissions are restricted)
        try:
            cron_jobs = await conn.fetch("SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'vibecity-refresh-geodata'")
            if cron_jobs:
                job = cron_jobs[0]
                status = "ACTIVE" if job['active'] else "INACTIVE"
                logger.info(f"✅ Cron Job '{job['jobname']}' is {status} (Schedule: {job['schedule']})")
            else:
                logger.warning("⚠️ Cron Job 'vibecity-refresh-geodata' not found in cron.job table.")
        except Exception as e:
            logger.warning(f"⚠️ Could not verify cron schema (requires elevated permissions): {e}")
            
    except Exception as e:
        logger.error(f"❌ Verification failed: {e}")

async def main():
    load_dotenv()
    
    # 1. Validate API Key
    api_key = (
        settings.GOOGLE_MAPS_API_KEY or 
        settings.GOOGLE_API_KEY or 
        os.environ.get("GOOGLE_MAPS_API_KEY") or 
        os.environ.get("GOOGLE_API_KEY")
    )
    if not api_key:
        logger.error("❌ GOOGLE_MAPS_API_KEY is missing in config and environment!")
        # We don't stop here, but we warn that backfill will fail
    else:
        logger.info("✅ GOOGLE_MAPS_API_KEY validated.")

    # 2. Database Connection
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error("❌ DATABASE_URL is missing! Cannot run migrations.")
        sys.exit(1)

    try:
        conn = await asyncpg.connect(db_url)
        
        # 3. Run SQL Migrations
        for migration in MIGRATIONS:
            await run_sql_migration(conn, migration)
        
        # 3.1 Verify installation
        await verify_cron_and_mv(conn)

        await conn.close()
    except Exception as e:
        logger.error(f"❌ Database error: {e}")
        sys.exit(1)

    # 4. Run Backfill Street View
    logger.info("Starting Street View backfill...")
    try:
        # Import and run the script's main function
        from backend.scripts.fetch_street_view import fetch_street_view_for_venues
        await fetch_street_view_for_venues()
        logger.info("✅ Street View backfill completed.")
    except Exception as e:
        logger.error(f"❌ Backfill error: {e}")

    logger.info("🚀 All enterprise updates completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
