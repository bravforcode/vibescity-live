#!/usr/bin/env python3
"""
Data Pipeline - Import Thailand venue data into Supabase
Transforms OSM data and handles upserts to avoid duplicates
Designed for cloud deployment with GitHub Actions
"""
import json
import os
from datetime import UTC, datetime
from pathlib import Path

# Try to import supabase, handle gracefully if not available
try:
    from supabase import Client, create_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("⚠️ Supabase not installed. Run: pip install supabase")

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
# Prefer service role key (bypasses RLS for bulk import); fall back to anon key
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or ""
)

# Category color mapping for UI
CATEGORY_COLORS = {
    "บาร์": "#ef4444",
    "ผับ": "#a855f7",
    "ไนท์คลับ": "#ec4899",
    "ร้านอาหาร": "#22c55e",
    "คาเฟ่": "#f59e0b",
    "ฟาสต์ฟู้ด": "#f97316",
    "คาราโอเกะ": "#8b5cf6",
    "โรงหนัง": "#3b82f6",
    "โรงละคร": "#6366f1",
    "สปา": "#14b8a6",
    "นวด": "#06b6d4",
    "โรงแรม": "#0ea5e9",
    "โฮสเทล": "#0284c7",
    "สถานที่ท่องเที่ยว": "#10b981",
    "พิพิธภัณฑ์": "#84cc16",
    "ห้างสรรพสินค้า": "#eab308",
    "สวนสาธารณะ": "#22c55e",
    "ฟิตเนส": "#f43f5e",
}


def transform_venue(osm_venue: dict) -> dict:
    """Transform OSM venue to Supabase venues table format"""
    category = osm_venue.get("category", "อื่นๆ")

    # Build social links object
    social_links = {}
    if osm_venue.get("facebook"):
        social_links["facebook"] = osm_venue["facebook"]
    if osm_venue.get("instagram"):
        social_links["instagram"] = osm_venue["instagram"]
    if osm_venue.get("tiktok"):
        social_links["tiktok"] = osm_venue["tiktok"]
    if osm_venue.get("website"):
        social_links["website"] = osm_venue["website"]

    return {
        "name": osm_venue.get("name", ""),
        "category": category,
        "latitude": osm_venue.get("latitude"),
        "longitude": osm_venue.get("longitude"),
        "province": osm_venue.get("province", ""),
        "region": osm_venue.get("region", ""),
        "district": osm_venue.get("address", ""),
        "status": "off",
        "social_links": social_links if social_links else None,
        "image_urls": [],
        "phone": osm_venue.get("phone"),
        "opening_hours": osm_venue.get("opening_hours"),
        "source": "osm",
        "osm_id": osm_venue.get("osm_id", ""),
        "osm_type": osm_venue.get("osm_type", "node"),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def load_venue_data(filename: str = "thailand_venues.json") -> list[dict]:
    """Load scraped venue data from JSON file"""
    file_path = Path(__file__).parent / filename

    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        print("   Run osm_scraper.py first!")
        return []

    with open(file_path, encoding="utf-8") as f:
        data = json.load(f)

    return data.get("venues", [])


def import_to_supabase(venues: list[dict], batch_size: int = 50):
    """Import venues to Supabase with upsert (insert or update)"""
    if not SUPABASE_AVAILABLE:
        print("❌ Supabase library not available")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL and SUPABASE_KEY environment variables required")
        print("   Set them in .env or as environment variables")
        return

    print("🔌 Connecting to Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Transform all venues
    print(f"🔄 Transforming {len(venues)} venues...")
    transformed = [transform_venue(v) for v in venues if v.get("name")]

    # Filter out invalid entries
    valid_venues = [v for v in transformed if v.get("latitude") and v.get("longitude")]

    # Deduplicate by osm_id (overlapping province bboxes produce duplicates)
    seen_osm_ids: set[str] = set()
    deduped: list[dict] = []
    for v in valid_venues:
        osm_id = v.get("osm_id") or ""
        if osm_id and osm_id in seen_osm_ids:
            continue
        if osm_id:
            seen_osm_ids.add(osm_id)
        deduped.append(v)
    valid_venues = deduped
    print(f"✅ {len(valid_venues)} unique valid venues to import")

    # Batch upsert
    success_count = 0
    error_count = 0
    total_batches = (len(valid_venues) + batch_size - 1) // batch_size

    print(f"📤 Importing in {total_batches} batches...")

    for i in range(0, len(valid_venues), batch_size):
        batch = valid_venues[i:i + batch_size]
        batch_num = i // batch_size + 1

        try:
            # Insert new venues, skip duplicates (partial unique index on osm_id)
            supabase.table("venues").upsert(
                batch,
                ignore_duplicates=True,
            ).execute()

            success_count += len(batch)
            print(f"   ✅ Batch {batch_num}/{total_batches}: {len(batch)} venues")

        except Exception as e:
            error_count += len(batch)
            error_msg = str(e)[:100]
            print(f"   ❌ Batch {batch_num}/{total_batches}: Error - {error_msg}")

    print()
    print("=" * 50)
    print("📊 Import Summary:")
    print(f"   ✅ Success: {success_count}")
    print(f"   ❌ Errors: {error_count}")
    print(f"   📍 Total processed: {success_count + error_count}")


def generate_stats(venues: list[dict]) -> dict:
    """Generate statistics from venue data"""
    stats = {
        "total": len(venues),
        "by_province": {},
        "by_category": {},
        "by_region": {},
    }

    for v in venues:
        province = v.get("province", "Unknown")
        category = v.get("category", "Other")
        region = v.get("region", "unknown")

        stats["by_province"][province] = stats["by_province"].get(province, 0) + 1
        stats["by_category"][category] = stats["by_category"].get(category, 0) + 1
        stats["by_region"][region] = stats["by_region"].get(region, 0) + 1

    return stats


def main():
    """Main pipeline function"""
    print("🚀 OSM → Supabase Data Pipeline")
    print("=" * 50)

    # Load data
    venues = load_venue_data()
    if not venues:
        print("No data to import. Exiting.")
        return

    print(f"📂 Loaded {len(venues)} venues from OSM data")

    # Generate and print stats
    stats = generate_stats(venues)
    print("\n📊 Data Statistics:")
    print(f"   Total venues: {stats['total']}")
    print(f"   Provinces: {len(stats['by_province'])}")
    print(f"   Categories: {len(stats['by_category'])}")

    print("\n📍 Top 10 Provinces:")
    top_provinces = sorted(stats["by_province"].items(), key=lambda x: -x[1])[:10]
    for province, count in top_provinces:
        print(f"   {province}: {count}")

    print("\n🏷️  Top 10 Categories:")
    top_categories = sorted(stats["by_category"].items(), key=lambda x: -x[1])[:10]
    for cat, count in top_categories:
        print(f"   {cat}: {count}")

    # Import to Supabase
    print("\n" + "=" * 50)
    import_to_supabase(venues)


if __name__ == "__main__":
    main()
