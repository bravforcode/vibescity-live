# VibeCity Database Setup Guide

## Quick Start

### Step 1: Run Schema SQL (First Time Only)

Copy and run `seed-database.sql` in **Supabase SQL Editor**:

```
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in the left sidebar
4. Copy contents of `scripts/seed-database.sql`
5. Click "Run"
```

### Step 2: Add Entertainment Data (77 Provinces)

After schema is created, run `seed-thailand-77-provinces.sql`:

```
1. In Supabase SQL Editor
2. Copy contents of `scripts/seed-thailand-77-provinces.sql`
3. Click "Run"
```

## Data Coverage

| Region | Provinces | Venues | Categories |
|--------|-----------|--------|------------|
| ภาคเหนือ (North) | 17 | 50+ | Cafes, Temples, Markets |
| กรุงเทพฯ (Bangkok) | 6 | 100+ | Nightclubs, Malls, Attractions |
| ภาคตะวันออก (East) | 7 | 40+ | Beaches, Malls, Resorts |
| ภาคใต้ (South) | 14 | 60+ | Beach Clubs, Islands, Resorts |
| ภาคอีสาน (Northeast) | 20 | 50+ | Markets, Temples, Parks |
| ภาคตะวันตก (West) | 8 | 30+ | Waterfalls, Historical Sites |

## Tables

| Table | Purpose |
|-------|---------|
| `shops` | All venues (cafes, bars, restaurants, attractions) |
| `buildings` | Giant Pins (malls, shopping centers) |
| `emergency_locations` | Hospitals, police stations |
| `reviews` | User reviews |
| `favorites` | User saved venues |
| `shop_views` | Analytics for merchant dashboard |

## Verify Installation

Run this SQL to check data:

```sql
-- Count venues by province
SELECT province, COUNT(*) as count 
FROM shops 
GROUP BY province 
ORDER BY count DESC;

-- Count by category
SELECT category, COUNT(*) as count 
FROM shops 
GROUP BY category 
ORDER BY count DESC;

-- Total counts
SELECT 
    (SELECT COUNT(*) FROM shops) as total_shops,
    (SELECT COUNT(*) FROM buildings) as total_buildings,
    (SELECT COUNT(DISTINCT province) FROM shops) as provinces;
```

## API Functions

The following RPC functions are available:

### Get Random Nearby Venues
```javascript
const { data } = await supabase.rpc('get_random_nearby_venues', {
    user_lat: 13.7563,
    user_lng: 100.5018,
    radius_km: 5,
    limit_count: 30
});
```

### Get Nearby Emergency Locations
```javascript
const { data } = await supabase.rpc('get_nearby_emergency', {
    user_lat: 13.7563,
    user_lng: 100.5018,
    emergency_type: 'hospital', // or 'police', null for all
    radius_km: 10
});
```

### Increment Shop View (for Analytics)
```javascript
await supabase.rpc('increment_shop_view', { shop_id_param: 123 });
```

## Troubleshooting

### Error: column "latitude" does not exist

Run this SQL first:
```sql
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7);
```

### Error: duplicate key value

The seed script uses `ON CONFLICT DO NOTHING` - this is normal if data already exists.

### RLS Policy Errors

Make sure you're using the anon key and RLS policies are set up. Run `seed-database.sql` to create policies.

## Environment Variables

Make sure your `.env.local` has:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
