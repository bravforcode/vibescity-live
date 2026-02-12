import { createClient } from "@supabase/supabase-js";

// Define strict types for our data structures
interface OsmTags {
  amenity?: string;
  name?: string;
  "name:en"?: string;
  "contact:phone"?: string;
  opening_hours?: string;
  phone?: string;
  shop?: string;
}

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags: OsmTags;
}

interface Venue {
  osm_id: string;
  name: string;
  name_en: string;
  category: string;
  province: string;
  location: string;
  source: string;
  opening_hours: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  pin_type: string;
  is_verified: boolean;
  updated_at: Date;
}

// Configuration
const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const BATCH_SIZE = 50;
const DELAY_BETWEEN_PROVINCES_MS = 5000;

// Supabase Init
// Use explicit process.env checking for better compatibility
const SUPABASE_URL =
  process.env.SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  (import.meta as any).env?.SUPABASE_SERVICE_ROLE_KEY ||
  "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check your .env file.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Thailand Provinces
const PROVINCES = [
  "Bangkok",
  "Chiang Mai",
  "Phuket",
  "Chon Buri",
  "Krabi",
  "Surat Thani",
  "Prachuap Khiri Khan",
  "Phang Nga",
  "Chiang Rai",
  "Nakhon Ratchasima",
  "Kanchanaburi",
  "Phra Nakhon Si Ayutthaya",
  "Rayong",
  "Songkhla",
  "Ubon Ratchathani",
  "Khon Kaen",
  "Udon Thani",
  "Buri Ram",
  "Nakhon Si Thammarat",
  "Trat",
  "Mae Hong Son",
  "Nan",
  "Phitsanulok",
  "Sukhothai",
  "Lampang",
  "Lamphun",
  "Phrae",
  "Nakhon Sawan",
  "Phetchabun",
  "Lop Buri",
  "Saraburi",
  "Nonthaburi",
  "Pathum Thani",
  "Samut Prakan",
  "Samut Sakhon",
  "Samut Songkhram",
  "Nakhon Pathom",
  "Ratchaburi",
  "Phetchaburi",
  "Chanthaburi",
  "Sa Kaeo",
  "Nakhon Nayok",
  "Prachin Buri",
  "Chachoengsao",
  "Chumphon",
  "Ranong",
  "Trang",
  "Satun",
  "Phatthalung",
  "Pattani",
  "Yala",
  "Narathiwat",
  "Nong Khai",
  "Loei",
  "Nong Bua Lamphu",
  "Sakon Nakhon",
  "Nakhon Phanom",
  "Mukdahan",
  "Yasothon",
  "Amnat Charoen",
  "Si Sa Ket",
  "Surin",
  "Roi Et",
  "Maha Sarakham",
  "Kalasin",
  "Chaiyaphum",
  "Chai Nat",
  "Sing Buri",
  "Ang Thong",
  "Suphan Buri",
  "Uthai Thani",
  "Kamphaeng Phet",
  "Tak",
  "Phichit",
  "Uttaradit",
];

// Helper delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getQuery = (areaName: string) => `
  [out:json][timeout:90];
  area["name:en"="${areaName}"]->.searchArea;
  (
    node["amenity"~"restaurant|cafe|bar|pub|nightclub|biergarten"](area.searchArea);
    node["shop"~"convenience|mall|department_store|supermarket|clothes|fashion"](area.searchArea);
    node["leisure"~"park|amusement_arcade|dance"](area.searchArea);
  );
  out body;
  >;
  out skel qt;
`;

async function fetchProvinceData(province: string): Promise<OsmNode[]> {
  console.log(`\n📍 Fetching data for: ${province}...`);
  try {
    const query = getQuery(province);
    const response = await fetch(OVERPASS_API, {
      method: "POST",
      body: query,
    });

    if (!response.ok)
      throw new Error(`Overpass API error: ${response.statusText}`);

    const data = await response.json();
    return (data.elements || []) as OsmNode[];
  } catch (err) {
    console.error(`⚠️ Failed to fetch ${province}:`, err);
    return [];
  }
}

function mapOSMToVenue(node: OsmNode, province: string): Venue {
  let category = "General";
  if (node.tags.amenity === "restaurant") category = "Food";
  else if (node.tags.amenity === "cafe") category = "Cafe";
  else if (node.tags.amenity === "bar" || node.tags.amenity === "pub")
    category = "Nightlife";
  else if (node.tags.shop) category = "Shopping";

  return {
    osm_id: `node/${node.id}`,
    name: node.tags.name || node.tags["name:en"] || "Unknown Place",
    name_en: node.tags["name:en"] || node.tags.name || "Unknown Place",
    lat: node.lat,
    lng: node.lon,
    category,
    province,
    opening_hours: node.tags.opening_hours || null,
    phone: node.tags.phone || node.tags["contact:phone"] || null,
    source: "osm",
    pin_type: "normal",
    is_verified: false,
    location: `POINT(${node.lon} ${node.lat})`,
    updated_at: new Date(),
  };
}

async function upsertVenues(venues: Venue[]) {
  if (venues.length === 0) return;

  for (let i = 0; i < venues.length; i += BATCH_SIZE) {
    const batch = venues.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("venues").upsert(
      batch.map((v) => ({
        osm_id: v.osm_id,
        name: v.name,
        name_en: v.name_en,
        category: v.category,
        province: v.province,
        location: v.location,
        source: v.source,
        opening_hours: v.opening_hours,
        phone: v.phone,
        updated_at: v.updated_at,
      })),
      { onConflict: "osm_id", ignoreDuplicates: false },
    );

    if (error) console.error("  ❌ Batch insert error:", error.message);
    else console.log(`  ✅ Synced ${batch.length} venues.`);
  }
}

// Convert to top-level await pattern preferable for modules
console.log("🚀 Starting VibeCity OSM Import (Bun Edition)...");
console.log(`🎯 Target: ${PROVINCES.length} provinces.`);

for (const province of PROVINCES) {
  const nodes = await fetchProvinceData(province);
  const validNodes = nodes.filter(
    (n) => n.tags && (n.tags.name || n.tags["name:en"]),
  );

  console.log(`  📊 Found ${validNodes.length} venues via API.`);

  if (validNodes.length > 0) {
    const venues = validNodes.map((n) => mapOSMToVenue(n, province));
    await upsertVenues(venues);
  }

  await delay(DELAY_BETWEEN_PROVINCES_MS);
}

console.log("\n✨ Import Complete!");
