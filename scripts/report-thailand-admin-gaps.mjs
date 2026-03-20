#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [k, ...rest] = line.split("=");
    if (!process.env[k]) {
      process.env[k] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!url || !key) {
  throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
}

const require = createRequire(import.meta.url);
let thaiGeoAssetsRoot;
try {
  const thaiGeoPackagePath = require.resolve("thai-geolocate/package.json");
  thaiGeoAssetsRoot = path.join(path.dirname(thaiGeoPackagePath), "assets");
} catch {
  throw new Error("Missing package 'thai-geolocate'. Run: bun add --no-save thai-geolocate");
}

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const i = arg.indexOf("=");
  return i > 0 ? [arg.slice(0, i).replace(/^--/, ""), arg.slice(i + 1)] : [arg.replace(/^--/, ""), "1"];
}));

const outFile = path.resolve(args.out || "scripts/reports/thailand-admin-gaps-after-curation.json");
const batch = Number(args.batch || 5000);
const tambonAccuracy = Number(args.tambonAccuracy || args.tambon_accuracy || 2);
const supabase = createClient(url, key);

function readGeoJsonFeatures(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed?.features) ? parsed.features : [];
}

function collectExpectedAdmin() {
  const provinces = new Map();
  const districts = new Map();
  const subdistricts = new Map();

  const provinceFile = path.join(thaiGeoAssetsRoot, "accuracy_level_1", "province.json");
  for (const feature of readGeoJsonFeatures(provinceFile)) {
    const code = feature.properties?.ADM1_PCODE;
    if (!code) continue;
    provinces.set(code, {
      province_code: code,
      province_en: feature.properties?.ADM1_EN || null,
      province_th: feature.properties?.ADM1_TH || null,
    });
  }

  const amphoeDir = path.join(thaiGeoAssetsRoot, "accuracy_level_1", "amphoe");
  for (const name of fs.readdirSync(amphoeDir)) {
    if (!name.endsWith(".json")) continue;
    for (const feature of readGeoJsonFeatures(path.join(amphoeDir, name))) {
      const districtCode = feature.properties?.ADM2_PCODE;
      if (!districtCode) continue;
      districts.set(districtCode, {
        district_code: districtCode,
        district_en: feature.properties?.ADM2_EN || null,
        district_th: feature.properties?.ADM2_TH || null,
        province_code: feature.properties?.ADM1_PCODE || null,
      });
    }
  }

  const tambonDir = path.join(thaiGeoAssetsRoot, `accuracy_level_${tambonAccuracy}`, "tambon");
  if (fs.existsSync(tambonDir)) {
    for (const name of fs.readdirSync(tambonDir)) {
      if (!name.endsWith(".json")) continue;
      for (const feature of readGeoJsonFeatures(path.join(tambonDir, name))) {
        const subdistrictCode = feature.properties?.ADM3_PCODE;
        if (!subdistrictCode) continue;
        subdistricts.set(subdistrictCode, {
          subdistrict_code: subdistrictCode,
          subdistrict_en: feature.properties?.ADM3_EN || null,
          subdistrict_th: feature.properties?.ADM3_TH || null,
          district_code: feature.properties?.ADM2_PCODE || null,
          province_code: feature.properties?.ADM1_PCODE || null,
        });
      }
    }
  }

  return { provinces, districts, subdistricts };
}

async function fetchActiveAdminCodes() {
  const provinceCodes = new Set();
  const districtCodes = new Set();
  const subdistrictCodes = new Set();
  let lastId = null;
  let scanned = 0;

  while (true) {
    let q = supabase
      .from("venues")
      .select("id,province_code,district_code,subdistrict_code")
      .order("id", { ascending: true })
      .limit(batch)
      .is("deleted_at", null)
      .or("is_deleted.eq.false,is_deleted.is.null");

    if (lastId) q = q.gt("id", lastId);

    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) break;

    lastId = rows.at(-1).id;
    for (const row of rows) {
      if (row.province_code) provinceCodes.add(row.province_code);
      if (row.district_code) districtCodes.add(row.district_code);
      if (row.subdistrict_code) subdistrictCodes.add(row.subdistrict_code);
    }

    scanned += rows.length;
    console.log(JSON.stringify({ phase: "scan_active_admin", scanned, last_id: lastId }));
  }

  return { provinceCodes, districtCodes, subdistrictCodes, scanned };
}

function percent(part, whole) {
  if (!whole) return 0;
  return Number(((part / whole) * 100).toFixed(2));
}

function groupMissingDistrictsByProvince(missingDistricts, provinces) {
  const groups = new Map();
  for (const district of missingDistricts) {
    const provinceCode = district.province_code || "UNKNOWN";
    if (!groups.has(provinceCode)) {
      const province = provinces.get(provinceCode);
      groups.set(provinceCode, {
        province_code: provinceCode,
        province_en: province?.province_en || null,
        province_th: province?.province_th || null,
        missing_district_count: 0,
        districts: [],
      });
    }
    const group = groups.get(provinceCode);
    group.missing_district_count += 1;
    group.districts.push(district);
  }

  return [...groups.values()].sort((a, b) => b.missing_district_count - a.missing_district_count);
}

function summarizeMissingSubdistrictsByProvince(missingSubdistricts, provinces) {
  const counts = new Map();
  for (const subdistrict of missingSubdistricts) {
    const provinceCode = subdistrict.province_code || "UNKNOWN";
    counts.set(provinceCode, (counts.get(provinceCode) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([province_code, missing_subdistrict_count]) => {
      const province = provinces.get(province_code);
      return {
        province_code,
        province_en: province?.province_en || null,
        province_th: province?.province_th || null,
        missing_subdistrict_count,
      };
    })
    .sort((a, b) => b.missing_subdistrict_count - a.missing_subdistrict_count);
}

async function main() {
  const expected = collectExpectedAdmin();
  const active = await fetchActiveAdminCodes();

  const missingProvinces = [...expected.provinces.values()].filter((row) => !active.provinceCodes.has(row.province_code));
  const missingDistricts = [...expected.districts.values()].filter((row) => !active.districtCodes.has(row.district_code));
  const missingSubdistricts = [...expected.subdistricts.values()].filter((row) => !active.subdistrictCodes.has(row.subdistrict_code));

  const report = {
    generated_at: new Date().toISOString(),
    active_rows_scanned: active.scanned,
    expected_counts: {
      provinces: expected.provinces.size,
      districts: expected.districts.size,
      subdistricts: expected.subdistricts.size,
    },
    active_coverage: {
      provinces: active.provinceCodes.size,
      districts: active.districtCodes.size,
      subdistricts: active.subdistrictCodes.size,
    },
    coverage_percent: {
      provinces: percent(active.provinceCodes.size, expected.provinces.size),
      districts: percent(active.districtCodes.size, expected.districts.size),
      subdistricts: percent(active.subdistrictCodes.size, expected.subdistricts.size),
    },
    missing_counts: {
      provinces: missingProvinces.length,
      districts: missingDistricts.length,
      subdistricts: missingSubdistricts.length,
    },
    missing_provinces: missingProvinces,
    missing_districts_by_province: groupMissingDistrictsByProvince(missingDistricts, expected.provinces),
    missing_subdistrict_counts_by_province: summarizeMissingSubdistrictsByProvince(missingSubdistricts, expected.provinces),
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
