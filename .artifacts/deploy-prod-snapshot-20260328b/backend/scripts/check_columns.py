import os
import sys

import psycopg2
from dotenv import load_dotenv

# Load env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

DB_URL = os.getenv("SUPABASE_DIRECT_URL")

if not DB_URL:
    print("❌ Error: SUPABASE_DIRECT_URL not found in environment variables.")
    sys.exit(1)

try:
    print("🔌 Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    print("🔍 Checking columns in 'venues' table...")
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'venues'
        ORDER BY ordinal_position;
    """)

    columns = cur.fetchall()

    if not columns:
        print("❌ Table 'venues' not found!")
    else:
        print(f"✅ Found {len(columns)} columns:")
        for col in columns:
            print(f"   - {col[0]} ({col[1]})")

    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Database error: {e}")
