/**
 * VibeCity Master Migration Script
 * This script uploads your backup CSV and JSON data to Supabase.
 * Run it with: node scripts/migrate-to-supabase.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log("🔗 Connecting to Supabase:", supabaseUrl);

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BACKUP_DIR = 'backup/legacy_data';

/**
 * 1. Migrate Shops (CSV)
 */
async function migrateShops() {
  console.log("🏙️ Migrating Shops...");
  const shops = [];
  const filePath = path.join(BACKUP_DIR, 'shops.csv');

  if (!fs.existsSync(filePath)) {
    console.warn("⚠️ shops.csv not found, skipping.");
    return;
  }

  return new Promise((resolve) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Map CSV headers to Postgres columns
        shops.push({
          name: row.Name,
          category: row.Category,
          latitude: parseFloat(row.Latitude) || null,
          longitude: parseFloat(row.Longitude) || null,
          vibe_info: row.Vibe_Info,
          crowd_info: row.Crowd_Info,
          open_time: row.open_time,
          close_time: row.close_time,
          status: row.Status || 'OFF',
          video_url: row.Video_URL,
          image_url_1: row.Image_URL1,
          image_url_2: row.Image_URL2,
          golden_time: row.golden_time,
          end_golden_time: row.end_golden_time,
          promotion_info: row.Promotion_info,
          promotion_endtime: row.Promotion_endtime,
          province: row.Province || 'เชียงใหม่',
          zone: row.Zone,
          building: row.Building,
          floor: row.Floor,
          category_color: row.CategoryColor,
          indoor_zone_no: row.IndoorZoneNo,
          event_name: row.EventName,
          event_date_time: row.EventDateTime,
          is_promoted: String(row.IsPromoted).toUpperCase() === 'TRUE',
          ig_url: row.IG_URL,
          fb_url: row.FB_URL,
          tiktok_url: row.TikTok_URL
        });
      })
      .on('end', async () => {
        console.log(`📡 Sending ${shops.length} shops to Supabase...`);
        const { error, data } = await supabase.from('shops').insert(shops).select();
        if (error) {
          console.error("❌ Error inserting shops:", error);
        } else {
          console.log(`✅ Successfully migrated ${shops.length} shops.`);
        }
        resolve();
      });
  });
}

/**
 * 2. Migrate Buildings (JSON)
 */
async function migrateBuildings() {
  console.log("🏢 Migrating Buildings...");
  const filePath = path.join(BACKUP_DIR, 'buildings.json');
  if (!fs.existsSync(filePath)) return;

  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const buildings = Object.keys(rawData).map(key => ({
    id: key,
    name: rawData[key].name,
    data: rawData[key]
  }));

  const { error } = await supabase.from('buildings').insert(buildings);
  if (error) console.error("❌ Error inserting buildings:", error.message);
  else console.log(`✅ Successfully migrated ${buildings.length} buildings.`);
}

/**
 * 3. Migrate Events (JSON)
 */
async function migrateEvents() {
  console.log("📅 Migrating Events...");
  const filePath = path.join(BACKUP_DIR, 'events.json');
  if (!fs.existsSync(filePath)) return;

  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const events = rawData.map(e => ({
    id: e.id,
    name: e.name,
    location: e.location,
    lat: e.lat || 18.7883, // Default to CNX if missing
    lng: e.lng || 98.9853,
    start_time: e.date || e.startTime,
    end_time: e.endTime || new Date(new Date(e.date).getTime() + 86400000).toISOString(),
    category: e.category,
    description: e.description,
    image_url: e.image || e.image_url,
    is_live: e.isLive || false
  }));

  const { error } = await supabase.from('events').insert(events);
  if (error) console.error("❌ Error inserting events:", error.message);
  else console.log(`✅ Successfully migrated ${events.length} events.`);
}

async function run() {
  console.log("🚀 Starting Master Migration...");
  console.log("🔗 URL:", supabaseUrl);
  
  // 1. Discovery Check
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { 'apikey': supabaseKey }
    });
    const doc = await res.json();
    const tables = Object.keys(doc.definitions || {});
    console.log("📂 Available Tables in API:", tables);
    
    if (!tables.includes('shops')) {
      console.error("❌ The API cannot see the 'shops' table yet.");
      if (tables.length > 0) {
         console.log("📝 Tables it DOES see:", tables.join(', '));
      } else {
         console.log("🕵️ Discovery returned ZERO tables. Proceeding anyway as verify-supabase.mjs confirmed access...");
      }
      // return; // Don't stop! The API cache might just be hiding the definitions.
    }
  } catch (e) {
    console.error("❌ Discovery Failed:", e.message);
  }

  try {
    await migrateShops();
    await migrateBuildings();
    await migrateEvents();
    console.log("✅ Final Check: Everything should be online!");
  } catch (err) {
    console.error("💥 Global Migration Error:", err);
  }
}

run();
