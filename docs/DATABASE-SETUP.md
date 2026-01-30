


VibeCity uses Supabase as the backend database for storing:
- **Shops/Venues** - Entertainment venues across Thailand
- **Buildings** - Giant Pin locations (malls, community centers)
- **Reviews** - User reviews and emoji reactions
- **Favorites** - User saved venues
- **Emergency Locations** - Hospitals, police stations for SOS feature
- **Analytics** - View counts for merchant dashboard

## Quick Start

### 1. Setup Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy your project URL and anon key
3. Add to `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 2. Create Database Schema

Run the SQL script in Supabase SQL Editor:

```bash
# Copy contents of scripts/seed-database.sql to Supabase SQL Editor
# Or use Supabase CLI:
supabase db push
```

### 3. Import Shop Data

```bash
# Install dependencies
npm install @supabase/supabase-js csv-parse

# Run import script
node scripts/import-csv-to-supabase.js
```

## Database Schema

### shops table

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | VARCHAR(255) | Venue name |
| category | VARCHAR(100) | e.g., Cafe, Bar, Restaurant |
| latitude | DECIMAL | GPS latitude |
| longitude | DECIMAL | GPS longitude |
| province | VARCHAR(100) | Province name |
| zone | VARCHAR(100) | Area/Zone within province |
| building | VARCHAR(100) | Building ID (for mall shops) |
| floor | VARCHAR(20) | Floor number |
| status | VARCHAR(20) | LIVE, AUTO, ACTIVE, OFF |
| open_time | VARCHAR(10) | Opening time (HH:MM) |
| close_time | VARCHAR(10) | Closing time (HH:MM) |
| golden_time | VARCHAR(10) | Peak hour start |
| end_golden_time | VARCHAR(10) | Peak hour end |
| vibe_info | TEXT | Vibe description |
| crowd_info | VARCHAR(100) | Target audience |
| image_url_1 | TEXT | Primary image URL |
| image_url_2 | TEXT | Secondary image URL |
| video_url | TEXT | Video URL for TikTok-style view |
| ig_url | TEXT | Instagram URL |
| fb_url | TEXT | Facebook URL |
| tiktok_url | TEXT | TikTok URL |
| is_promoted | BOOLEAN | Promoted venue flag |
| is_giant_active | BOOLEAN | Giant Pin flag |

### buildings table

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(100) | Primary key (e.g., 'oneNimman') |
| name | VARCHAR(255) | Full name |
| latitude | DECIMAL | GPS latitude |
| longitude | DECIMAL | GPS longitude |
| province | VARCHAR(100) | Province |
| floors | JSONB | Floor list |
| data | JSONB | Additional metadata |
| icon | TEXT | Emoji icon |
| short_name | VARCHAR(100) | Display name |
| is_giant_active | BOOLEAN | Active Giant Pin |

## Adding New Data

### Method 1: CSV Import

1. Add new rows to `public/data/shops.csv`
2. Run import script: `node scripts/import-csv-to-supabase.js`

### Method 2: Supabase Dashboard

1. Go to Supabase Dashboard > Table Editor
2. Select 'shops' table
3. Click 'Insert row'
4. Fill in the required fields

### Method 3: API Insert

```javascript
import { supabase } from './lib/supabase';

const { data, error } = await supabase
  .from('shops')
  .insert({
    name: 'New Venue',
    category: 'Bar',
    latitude: 13.7563,
    longitude: 100.5018,
    province: 'กรุงเทพฯ',
    status: 'AUTO',
    open_time: '18:00',
    close_time: '02:00'
  });
```

## Data Coverage

### Current Coverage (172+ venues)

| Province | Count | Categories |
|----------|-------|------------|
| เชียงใหม่ | 118 | Cafes, Bars, Restaurants, Malls |
| กรุงเทพฯ | 20 | Nightclubs, Rooftop Bars, Markets |
| ภูเก็ต | 10 | Beach Clubs, Nightclubs |
| พัทยา | 8 | Entertainment, Malls |
| เชียงราย | 9 | Temples, Markets, Attractions |
| ประจวบ | 4 | Beaches, Markets |
| สุราษฎร์ธานี | 3 | Beach Clubs |

### Category Distribution

- Cafe: 35+
- Bar/Nightlife: 40+
- Restaurant: 30+
- Shopping Mall: 16
- Market: 15
- Temple/Landmark: 10+
- Beach/Nature: 10+

## Real-Time Features

### Live Status Updates

Shops can have their status updated in real-time:

```javascript
// Subscribe to shop updates
const subscription = supabase
  .channel('shop-updates')
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'shops' },
    (payload) => {
      console.log('Shop updated:', payload);
    }
  )
  .subscribe();
```

### Analytics Tracking

```javascript
// Track shop view
await supabase.rpc('increment_shop_view', { shop_id_param: shopId });
```

## Custom RPC Functions

### increment_shop_view

Increments the view count for a shop on the current date. Uses SECURITY DEFINER to bypass RLS.

```sql
CREATE OR REPLACE FUNCTION increment_shop_view(shop_id_param INTEGER)
RETURNS void AS $$
BEGIN
    INSERT INTO shop_views (shop_id, view_date, view_count)
    VALUES (shop_id_param, CURRENT_DATE, 1)
    ON CONFLICT (shop_id, view_date)
    DO UPDATE SET view_count = shop_views.view_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### get_random_nearby_venues

Returns random venues within a radius, prioritizing LIVE status shops.

```sql
CREATE OR REPLACE FUNCTION get_random_nearby_venues(
    user_lat DECIMAL,
    user_lng DECIMAL,
    radius_km INTEGER DEFAULT 5,
    limit_count INTEGER DEFAULT 30,
    exclude_ids INTEGER[] DEFAULT '{}'
)
RETURNS SETOF shops AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM shops s
    WHERE
        s.id != ALL(exclude_ids)
        AND (
            6371 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians(user_lat)) * cos(radians(s.latitude)) *
                    cos(radians(s.longitude) - radians(user_lng)) +
                    sin(radians(user_lat)) * sin(radians(s.latitude))
                ))
            )
        ) <= radius_km
    ORDER BY
        CASE WHEN s.status = 'LIVE' THEN 0 ELSE 1 END,
        RANDOM()
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
```

### get_nearby_emergency

Returns nearby emergency locations (hospitals, police, fire stations) sorted by distance.

```sql
CREATE OR REPLACE FUNCTION get_nearby_emergency(
    user_lat DECIMAL,
    user_lng DECIMAL,
    emergency_type VARCHAR DEFAULT NULL,
    radius_km INTEGER DEFAULT 10
)
RETURNS TABLE(
    id INTEGER,
    name VARCHAR,
    type VARCHAR,
    latitude DECIMAL,
    longitude DECIMAL,
    phone VARCHAR,
    distance_km DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id, e.name, e.type, e.latitude, e.longitude, e.phone,
        (6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
                cos(radians(user_lat)) * cos(radians(e.latitude)) *
                cos(radians(e.longitude) - radians(user_lng)) +
                sin(radians(user_lat)) * sin(radians(e.latitude))
            ))
        ))::DECIMAL AS distance_km
    FROM emergency_locations e
    WHERE
        (emergency_type IS NULL OR e.type = emergency_type)
        AND distance_km <= radius_km
    ORDER BY distance_km
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;
```

## API Endpoints

### Get Random Nearby Venues

```javascript
const { data } = await supabase.rpc('get_random_nearby_venues', {
  user_lat: 18.7883,
  user_lng: 98.9853,
  radius_km: 5,
  limit_count: 30,
  exclude_ids: []
});
```

### Get Nearby Emergency Locations

```javascript
const { data } = await supabase.rpc('get_nearby_emergency', {
  user_lat: 18.7883,
  user_lng: 98.9853,
  emergency_type: 'hospital', // or 'police', null for all
  radius_km: 10
});
```

## Troubleshooting

### "Table not found" error
- Run the schema creation SQL in Supabase SQL Editor
- Check RLS policies are set up correctly

### Import fails
- Verify environment variables are set
- Check CSV file encoding (UTF-8)
- Ensure Supabase project is running

### No data showing
- Check browser console for errors
- Verify Supabase URL and key are correct
- Check RLS policies allow public read access

## Next Steps

1. **Add more venues** - Expand to cover all 77 provinces
2. **Add photos** - Upload venue images to Supabase Storage
3. **Add videos** - Host TikTok-style videos for venues
4. **Merchant onboarding** - Allow merchants to claim/add venues
5. **Real-time events** - Add event scheduling system
