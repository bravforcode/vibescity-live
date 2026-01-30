#!/usr/bin/env node
/**
 * VibeCity - CSV to Supabase Import Script
 * 
 * This script imports shop data from CSV to Supabase database.
 * 
 * Usage:
 *   1. Set environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 *   2. Run: node scripts/import-csv-to-supabase.js
 * 
 * Prerequisites:
 *   npm install @supabase/supabase-js csv-parse dotenv
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Maps CSV row to database schema
 */
function mapCsvToDb(row, index) {
    return {
        // Use CSV 'id' if available, otherwise let database auto-generate
        ...(row.id ? { id: parseInt(row.id, 10) } : {}),
        name: row.Name || '',
        category: row.Category || 'General',
        latitude: parseFloat(row.Latitude) || null,
        longitude: parseFloat(row.Longitude) || null,
        vibe_info: row.Vibe_Info || null,
        crowd_info: row.Crowd_Info || null,
        open_time: row.open_time || null,
        close_time: row.close_time || null,
        status: (row.Status || 'AUTO').toUpperCase(),
        video_url: row.Video_URL || null,
        image_url_1: row.Image_URL1 || null,
        image_url_2: row.Image_URL2 || null,
        golden_time: row.golden_time || null,
        end_golden_time: row.end_golden_time || null,
        promotion_info: row.Promotion_info || null,
        promotion_endtime: row.Promotion_endtime || null,
        province: row.Province || 'กรุงเทพฯ',
        zone: row.Zone || null,
        building: row.Building || null,
        floor: row.Floor || null,
        category_color: row.CategoryColor || null,
        indoor_zone_no: row.IndoorZoneNo || null,
        event_name: row.EventName || null,
        event_datetime: row.EventDateTime || null,
        is_promoted: row.IsPromoted === 'TRUE',
        ig_url: row.IG_URL || null,
        fb_url: row.FB_URL || null,
        tiktok_url: row.TikTok_URL || null,
        // Mark buildings as Giant Pins
        is_giant_active: ['Community Mall', 'Shopping Mall'].includes(row.Category)
    };
}

/**
 * Import shops from CSV
 */
async function importShops() {
    console.log('📂 Reading CSV file...');
    
    const csvPath = path.join(__dirname, '..', 'public', 'data', 'shops.csv');
    
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
        process.exit(1);
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });
    
    console.log(`📊 Found ${records.length} records in CSV`);
    
    // Map to database format
    const shops = records.map((row, index) => mapCsvToDb(row, index));
    
    // Clear existing data (optional - comment out if you want to append)
    console.log('🗑️ Clearing existing shop data...');
    const { error: deleteError } = await supabase.from('shops').delete().neq('id', 0);
    if (deleteError) {
        console.warn('⚠️ Could not clear existing data:', deleteError.message);
    }
    
    // Insert in batches of 100
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < shops.length; i += batchSize) {
        const batch = shops.slice(i, i + batchSize);
        
        const { data, error } = await supabase
            .from('shops')
            .upsert(batch, { onConflict: 'id' });
        
        if (error) {
            console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
        } else {
            inserted += batch.length;
            console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1} (${inserted}/${shops.length})`);
        }
    }
    
    console.log(`\n🎉 Import complete! ${inserted} shops imported.`);
}

/**
 * Verify data in Supabase
 */
async function verifyData() {
    console.log('\n📊 Verifying data in Supabase...\n');
    
    // Count by province
    const { data: provinceData } = await supabase
        .from('shops')
        .select('province');
    
    const provinceCounts = {};
    provinceData?.forEach(s => {
        provinceCounts[s.province] = (provinceCounts[s.province] || 0) + 1;
    });
    
    console.log('📍 Shops by Province:');
    Object.entries(provinceCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([province, count]) => {
            console.log(`   ${province}: ${count} shops`);
        });
    
    // Count by category
    const { data: categoryData } = await supabase
        .from('shops')
        .select('category');
    
    const categoryCounts = {};
    categoryData?.forEach(s => {
        categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
    });
    
    console.log('\n📂 Shops by Category:');
    Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([category, count]) => {
            console.log(`   ${category}: ${count} shops`);
        });
    
    // Count LIVE status
    const { count: liveCount } = await supabase
        .from('shops')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'LIVE');
    
    console.log(`\n🔴 LIVE venues: ${liveCount}`);
    
    // Count giant pins (shops that are malls/buildings)
    const { count: giantPinCount } = await supabase
        .from('shops')
        .select('*', { count: 'exact', head: true })
        .eq('is_giant_active', true);
    
    console.log(`🏢 Giant Pins (Malls/Buildings): ${giantPinCount}`);
}

// Main execution
async function main() {
    console.log('🚀 VibeCity CSV to Supabase Import\n');
    console.log(`📡 Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
    
    try {
        await importShops();
        await verifyData();
    } catch (error) {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    }
}

main();
