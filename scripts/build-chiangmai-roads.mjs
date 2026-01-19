// scripts/build-chiangmai-roads.mjs
import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.resolve("public/data/chiangmai-main-roads.geojson");

// ✅ ใช้ bbox ตามที่โปรเจกต์คุณใช้ (chiangMaiBounds) + buffer นิดหน่อย
// format: south, west, north, east
const BBOX = {
  s: 17.9,
  w: 97.5,
  n: 20.7,
  e: 100.4,
};

// ✅ Overpass หลายเจ้า (ตัวแรกชอบ 504 ให้สลับอัตโนมัติ)
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

const query = `
[out:json][timeout:180];
(
  way(${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e})["highway"]
    ["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|service"]
    ["area"!="yes"];

  way(${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e})["highway"]
    ["highway"~"motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"]
    ["area"!="yes"];
);
out tags geom;
`.trim();

function osmWaysToGeoJSON(osmJson) {
  const features = [];

  for (const el of osmJson.elements || []) {
    if (el.type !== "way") continue;
    const geom = el.geometry || [];
    if (geom.length < 2) continue;

    const coords = geom.map((p) => [p.lon, p.lat]);

    const props = {
      name: el.tags?.name || null,
      highway: el.tags?.highway || null,
      oneway: el.tags?.oneway || null,
      lanes: el.tags?.lanes || null,
      maxspeed: el.tags?.maxspeed || null,
    };

    features.push({
      type: "Feature",
      properties: props,
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  return { type: "FeatureCollection", features };
}

async function fetchWithRetry(url, body, tries = 4) {
  let lastErr = null;

  for (let i = 0; i < tries; i++) {
    const waitMs = 800 * Math.pow(1.7, i);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: body }),
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();

      // ✅ ถ้าไม่ใช่ json มักเป็นหน้า error HTML
      if (!res.ok || !ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Overpass bad response: ${res.status} ${res.statusText}\n` +
            text.slice(0, 200)
        );
      }

      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn(`⚠️ Overpass failed (${i + 1}/${tries}) @ ${url}`);
      console.warn(String(e?.message || e).slice(0, 220));
      // backoff ก่อนลองใหม่
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw lastErr || new Error("Overpass fetch failed");
}

async function main() {
  console.log("🚧 Fetching roads from OSM Overpass (bbox + out geom)...");
  console.log("🧭 BBOX:", BBOX);

  let osm = null;
  let used = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      osm = await fetchWithRetry(endpoint, query, 4);
      used = endpoint;
      break;
    } catch (e) {
      console.warn("❌ Endpoint failed:", endpoint);
    }
  }

  if (!osm) throw new Error("All Overpass endpoints failed.");

  console.log("✅ Overpass OK from:", used);

  const geo = osmWaysToGeoJSON(osm);

  // ✅ sanity check: ถ้าน้อยไป = ไม่ใช่ทั้งเชียงใหม่แน่ ๆ ให้ fail
  if ((geo.features?.length || 0) < 500) {
    throw new Error(
      `Too few road features (${geo.features.length}). This is not Chiang Mai full roads. Try rerun or expand bbox/timeout.`
    );
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(geo));
  console.log(`✅ Wrote: ${OUT_PATH}`);
  console.log(`✅ Features: ${geo.features.length}`);
}

main().catch((e) => {
  console.error("❌ build-chiangmai-roads failed:", e);
  process.exit(1);
});
