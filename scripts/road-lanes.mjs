import fs from "node:fs";
import path from "node:path";

const INPUT = path.resolve("public/data/chiangmai-main-roads.geojson");
const OUTPUT = path.resolve("public/data/chiangmai-main-roads-lanes.geojson");

// ระยะเลน (เมตร) -> แปลงคร่าว ๆ เป็นองศา (lat)
// 3.3m ~ 0.0000297 deg lat (เพราะ 1 deg lat ~ 111,320m)
const LANE_OFFSET_M = 3.3;
const M_TO_DEG_LAT = 1 / 111320;
const OFFSET_DEG = LANE_OFFSET_M * M_TO_DEG_LAT;

// จำกัดจำนวน features ตอน dev (กันเครื่องดับ) - ปิดได้
const DEV_LIMIT = 0; // เช่น 20000; ถ้า 0 = ไม่จำกัด

// อ่านไฟล์
if (!fs.existsSync(INPUT)) {
  console.error("❌ INPUT not found:", INPUT);
  process.exit(1);
}

const rawText = fs.readFileSync(INPUT, "utf-8");
const raw = JSON.parse(rawText);

if (!raw || raw.type !== "FeatureCollection") {
  console.error("❌ Invalid GeoJSON FeatureCollection");
  process.exit(1);
}

const features = raw.features || [];
console.log("📥 Input features:", features.length);

if ((features.length || 0) < 500) {
  console.warn("⚠️ Input seems too small (<500). Did build roads succeed?");
}

// -------- Geometry helpers --------
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

function toBoolOneway(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  if (s === "yes" || s === "1" || s === "true") return true;
  if (s === "-1") return true; // treat reverse as oneway too (we won't reverse geom here)
  return false;
}

function parseLanes(props) {
  const v = props?.lanes;
  if (v == null) return 2;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 2;
  // clamp
  return Math.max(1, Math.min(8, Math.round(n)));
}

function safeCoordsLineString(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const [lng, lat] = c;
    if (!isNum(lng) || !isNum(lat)) return null;
  }
  return coords;
}

// คำนวณ normal vector แบบง่าย ๆ จาก segment แรกที่ใช้ได้
function computeNormal(coords) {
  // หา segment ที่ไม่ซ้ำ
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) continue;

    // normal (perpendicular)
    // (dx,dy) -> (-dy,dx)
    const nx = -dy;
    const ny = dx;
    const len = Math.hypot(nx, ny);
    if (len < 1e-12) continue;
    return [nx / len, ny / len];
  }
  return [0, 0];
}

// เลื่อนเส้นด้วย normal
function offsetLine(coords, offsetDeg, sign = 1) {
  const [nx, ny] = computeNormal(coords);
  if (nx === 0 && ny === 0) return null;

  // หมายเหตุ: lng degree ต่อเมตรเปลี่ยนตาม lat (cos) แต่เราจะทำแบบง่าย ๆ ก่อน
  // ใช้ lat เป็นหลัก แล้วคูณ cos(lat) ปรับ lng แบบหยาบ
  const out = coords.map(([lng, lat]) => {
    const cos = Math.cos((lat * Math.PI) / 180) || 1;
    const lngOffset = (offsetDeg * sign * nx) / Math.max(0.2, cos); // กันหารเล็ก
    const latOffset = offsetDeg * sign * ny;
    return [lng + lngOffset, lat + latOffset];
  });

  return out;
}

function makeFeature(baseProps, coords, laneRole, laneIndex, laneTotal, dir) {
  return {
    type: "Feature",
    properties: {
      ...baseProps,
      laneRole,     // "in" | "out" | "single"
      laneIndex,    // 1..n per direction
      laneTotal,    // n per direction
      dir,          // 1=forward, -1=reverse (we don't reverse geometry here)
      kind: "traffic_lane",
    },
    geometry: {
      type: "LineString",
      coordinates: coords,
    },
  };
}

// -------- Main transform --------
const out = [];
const max = DEV_LIMIT > 0 ? Math.min(features.length, DEV_LIMIT) : features.length;

for (let i = 0; i < max; i++) {
  const f = features[i];
  if (!f?.geometry) continue;

const IMPORTANT = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  // ถ้าจะเพิ่มความเนียนในเมือง ค่อยเปิดพวกนี้ (หนักขึ้นเยอะ)
  // "unclassified",
  // "residential",
]);


  const props = f.properties || {};
  const highway = props.highway || props.class || null;
  if (!highway || !IMPORTANT.has(String(highway))) continue;





  // ทำเฉพาะ LineString (ถ้ามี MultiLineString ให้แตกออก)
  if (f.geometry.type === "LineString") {
    const coords = safeCoordsLineString(f.geometry.coordinates);
    if (!coords) continue;

    const oneway = toBoolOneway(props.oneway);
    const lanes = parseLanes(props);

    // ถ้า oneway: ทำเลนเดียว (หรือหลายเลนฝั่งเดียว)
    if (oneway) {
      const lanesOneDir = Math.max(1, Math.round(lanes));
      // ทำเลนหลายเส้นแบบกระจาย offsets (centered)
      for (let k = 0; k < lanesOneDir; k++) {
        const shift = (k - (lanesOneDir - 1) / 2) * OFFSET_DEG;
        const o = offsetLine(coords, Math.abs(shift), shift >= 0 ? 1 : -1);
        if (!o) continue;

        out.push(
          makeFeature(
            {
              osm_id: props.osm_id,
              highway,
              name: props.name || null,
              oneway: props.oneway ?? "yes",
              lanes: lanes,
              maxspeed: props.maxspeed ?? null,
            },
            o,
            "single",
            k + 1,
            lanesOneDir,
            1
          )
        );
      }
      continue;
    }

    // ถ้า two-way: แบ่งเลนเข้า/ออก (คร่าว ๆ แบ่งครึ่ง)
    const lanesEach = Math.max(1, Math.round(lanes / 2));

    // outbound (+) และ inbound (-) เป็นคนละฝั่ง
    for (let k = 0; k < lanesEach; k++) {
      const shift = (k + 0.5) * OFFSET_DEG; // ให้เลนออกห่างจาก center
      const oOut = offsetLine(coords, shift, +1);
      const oIn = offsetLine(coords, shift, -1);

      if (oOut) {
        out.push(
          makeFeature(
            {
              osm_id: props.osm_id,
              highway,
              name: props.name || null,
              oneway: "no",
              lanes: lanes,
              maxspeed: props.maxspeed ?? null,
            },
            oOut,
            "out",
            k + 1,
            lanesEach,
            1
          )
        );
      }
      if (oIn) {
        out.push(
          makeFeature(
            {
              osm_id: props.osm_id,
              highway,
              name: props.name || null,
              oneway: "no",
              lanes: lanes,
              maxspeed: props.maxspeed ?? null,
            },
            oIn,
            "in",
            k + 1,
            lanesEach,
            -1
          )
        );
      }
    }
    continue;
  }

  if (f.geometry.type === "MultiLineString") {
    const lines = f.geometry.coordinates || [];
    for (const line of lines) {
      const coords = safeCoordsLineString(line);
      if (!coords) continue;

      // reuse same logic by forging a LineString feature
      features.push({
        type: "Feature",
        properties: f.properties,
        geometry: { type: "LineString", coordinates: coords },
      });
    }
    continue;
  }
}

const fc = { type: "FeatureCollection", features: out };
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(fc));
console.log("✅ Wrote:", OUTPUT);
console.log("✅ Lane features:", out.length);
