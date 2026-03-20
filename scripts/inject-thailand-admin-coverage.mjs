#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import * as turf from "@turf/turf";
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
if (!url || !key) throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");

const require = createRequire(import.meta.url);
let thaiGeoAssetsRoot;
try {
  const thaiGeoPackagePath = require.resolve("thai-geolocate/package.json");
  thaiGeoAssetsRoot = path.join(path.dirname(thaiGeoPackagePath), "assets");
} catch {
  throw new Error("Missing package 'thai-geolocate'. Run: bun add --no-save thai-geolocate");
}

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const i = arg.indexOf("=");
    return i > 0
      ? [arg.slice(0, i).replace(/^--/, ""), arg.slice(i + 1)]
      : [arg.replace(/^--/, ""), "1"];
  }),
);

const mode = args.mode || "report"; // report | apply | rollback
const level = (args.level || "both").toLowerCase(); // district | subdistrict | both
const batch = Number(args.batch || 5000);
const chunk = Number(args.chunk || 400);
const tambonAccuracy = Number(args.tambonAccuracy || args.tambon_accuracy || 2);
const maxInject = Number(args.max || 0);
const sourceTag = args.source || "th-admin-coverage-seed";
const outFile = path.resolve(
  args.out || "scripts/reports/thailand-admin-injection.json",
);

if (!["report", "apply", "rollback"].includes(mode)) {
  throw new Error(`Unsupported mode: ${mode}`);
}
if (!["district", "subdistrict", "both"].includes(level)) {
  throw new Error(`Unsupported level: ${level}`);
}

const supabase = createClient(url, key);

function loadFeatures(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed?.features) ? parsed.features : [];
}

function loadAdminFeatures() {
  const provinces = new Map();
  const districts = new Map();
  const subdistricts = new Map();

  const provinceFile = path.join(
    thaiGeoAssetsRoot,
    "accuracy_level_1",
    "province.json",
  );
  for (const feature of loadFeatures(provinceFile)) {
    const provinceCode = feature.properties?.ADM1_PCODE;
    if (!provinceCode) continue;
    provinces.set(provinceCode, feature);
  }

  const amphoeDir = path.join(thaiGeoAssetsRoot, "accuracy_level_1", "amphoe");
  for (const name of fs.readdirSync(amphoeDir)) {
    if (!name.endsWith(".json")) continue;
    for (const feature of loadFeatures(path.join(amphoeDir, name))) {
      const districtCode = feature.properties?.ADM2_PCODE;
      if (!districtCode) continue;
      districts.set(districtCode, feature);
    }
  }

  const tambonDir = path.join(
    thaiGeoAssetsRoot,
    `accuracy_level_${tambonAccuracy}`,
    "tambon",
  );
  if (fs.existsSync(tambonDir)) {
    for (const name of fs.readdirSync(tambonDir)) {
      if (!name.endsWith(".json")) continue;
      for (const feature of loadFeatures(path.join(tambonDir, name))) {
        const subdistrictCode = feature.properties?.ADM3_PCODE;
        if (!subdistrictCode) continue;
        subdistricts.set(subdistrictCode, feature);
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
    console.log(
      JSON.stringify({ phase: "scan_active", scanned, last_id: lastId }),
    );
  }

  return { provinceCodes, districtCodes, subdistrictCodes, scanned };
}

function buildDistrictRow(feature, nowIso) {
  const props = feature.properties || {};
  const point = turf.pointOnFeature(feature);
  const [lng, lat] = point.geometry.coordinates;
  const districtCode = props.ADM2_PCODE;
  const provinceCode = props.ADM1_PCODE;
  const districtEn = props.ADM2_EN || null;
  const districtTh = props.ADM2_TH || null;
  const provinceEn = props.ADM1_EN || null;
  const provinceTh = props.ADM1_TH || null;
  const locationWkt = `SRID=4326;POINT(${lng} ${lat})`;

  return {
    id: randomUUID(),
    name: `Coverage Anchor - ${districtEn || districtTh || districtCode}`,
    category: "coverage_anchor",
    location: locationWkt,
    latitude: lat,
    longitude: lng,
    province: provinceEn || provinceTh || null,
    district: districtEn || districtTh || null,
    subdistrict: null,
    status: "active",
    source: sourceTag,
    source_hash: `coverage:district:${districtCode}`,
    metadata: {
      coverage_seed: true,
      coverage_level: "district",
      district_code: districtCode,
      generated_by: "inject-thailand-admin-coverage.mjs",
      generated_at: nowIso,
    },
    province_th: provinceTh,
    province_en: provinceEn,
    district_th: districtTh,
    district_en: districtEn,
    subdistrict_th: null,
    subdistrict_en: null,
    province_code: provinceCode || null,
    district_code: districtCode || null,
    subdistrict_code: null,
    admin_source: "coverage-seed",
    admin_confidence: 100,
    admin_resolved_at: nowIso,
    is_deleted: false,
    deleted_at: null,
    vibe_info: "Synthetic admin coverage anchor for district-level completeness",
  };
}

function buildSubdistrictRow(feature, nowIso) {
  const props = feature.properties || {};
  const point = turf.pointOnFeature(feature);
  const [lng, lat] = point.geometry.coordinates;
  const subdistrictCode = props.ADM3_PCODE;
  const districtCode = props.ADM2_PCODE;
  const provinceCode = props.ADM1_PCODE;
  const subdistrictEn = props.ADM3_EN || null;
  const subdistrictTh = props.ADM3_TH || null;
  const districtEn = props.ADM2_EN || null;
  const districtTh = props.ADM2_TH || null;
  const provinceEn = props.ADM1_EN || null;
  const provinceTh = props.ADM1_TH || null;
  const locationWkt = `SRID=4326;POINT(${lng} ${lat})`;

  return {
    id: randomUUID(),
    name: `Coverage Anchor - ${subdistrictEn || subdistrictTh || subdistrictCode}`,
    category: "coverage_anchor",
    location: locationWkt,
    latitude: lat,
    longitude: lng,
    province: provinceEn || provinceTh || null,
    district: districtEn || districtTh || null,
    subdistrict: subdistrictEn || subdistrictTh || null,
    status: "active",
    source: sourceTag,
    source_hash: `coverage:subdistrict:${subdistrictCode}`,
    metadata: {
      coverage_seed: true,
      coverage_level: "subdistrict",
      subdistrict_code: subdistrictCode,
      generated_by: "inject-thailand-admin-coverage.mjs",
      generated_at: nowIso,
    },
    province_th: provinceTh,
    province_en: provinceEn,
    district_th: districtTh,
    district_en: districtEn,
    subdistrict_th: subdistrictTh,
    subdistrict_en: subdistrictEn,
    province_code: provinceCode || null,
    district_code: districtCode || null,
    subdistrict_code: subdistrictCode || null,
    admin_source: "coverage-seed",
    admin_confidence: 100,
    admin_resolved_at: nowIso,
    is_deleted: false,
    deleted_at: null,
    vibe_info:
      "Synthetic admin coverage anchor for subdistrict-level completeness",
  };
}

function buildInjectionPlan(expected, activeCodes) {
  const nowIso = new Date().toISOString();
  const missingDistrictFeatures = [];
  const missingSubdistrictFeatures = [];

  if (level === "district" || level === "both") {
    for (const [code, feature] of expected.districts.entries()) {
      if (!activeCodes.districtCodes.has(code)) {
        missingDistrictFeatures.push(feature);
      }
    }
  }

  if (level === "subdistrict" || level === "both") {
    for (const [code, feature] of expected.subdistricts.entries()) {
      if (!activeCodes.subdistrictCodes.has(code)) {
        missingSubdistrictFeatures.push(feature);
      }
    }
  }

  const districtRows = missingDistrictFeatures.map((feature) =>
    buildDistrictRow(feature, nowIso),
  );
  const subdistrictRows = missingSubdistrictFeatures.map((feature) =>
    buildSubdistrictRow(feature, nowIso),
  );

  let rows = [...districtRows, ...subdistrictRows];
  if (maxInject > 0) rows = rows.slice(0, maxInject);

  return {
    generated_at: nowIso,
    mode,
    level,
    source: sourceTag,
    active_rows_scanned: activeCodes.scanned,
    expected_counts: {
      provinces: expected.provinces.size,
      districts: expected.districts.size,
      subdistricts: expected.subdistricts.size,
    },
    active_coverage_before: {
      provinces: activeCodes.provinceCodes.size,
      districts: activeCodes.districtCodes.size,
      subdistricts: activeCodes.subdistrictCodes.size,
    },
    missing_before: {
      districts: missingDistrictFeatures.length,
      subdistricts: missingSubdistrictFeatures.length,
    },
    planned_inserts: {
      districts: districtRows.length,
      subdistricts: subdistrictRows.length,
      total: rows.length,
    },
    applied_count: 0,
    rollback_count: 0,
    sample_rows: rows.slice(0, 20),
    rows,
  };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
}

async function applyInjection(report) {
  let applied = 0;
  for (let i = 0; i < report.rows.length; i += chunk) {
    const slice = report.rows.slice(i, i + chunk);
    const { error } = await supabase.from("venues").insert(slice);
    if (error) throw error;
    applied += slice.length;
    console.log(
      JSON.stringify({ phase: "apply", applied, total: report.rows.length }),
    );
  }
  report.applied_count = applied;
  report.applied_at = new Date().toISOString();
  return report;
}

async function rollbackInjection(report) {
  const ids = (report.rows || []).map((row) => row.id);
  if (!ids.length) {
    report.rollback_count = 0;
    return report;
  }

  let rolledBack = 0;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { error } = await supabase
      .from("venues")
      .update({
        deleted_at: nowIso,
        is_deleted: true,
        status: "inactive",
      })
      .in("id", slice);
    if (error) throw error;
    rolledBack += slice.length;
    console.log(
      JSON.stringify({ phase: "rollback", rolled_back: rolledBack, total: ids.length }),
    );
  }
  report.rollback_count = rolledBack;
  report.rolled_back_at = nowIso;
  return report;
}

async function main() {
  if (mode === "rollback") {
    if (!fs.existsSync(outFile)) {
      throw new Error(`Rollback report not found: ${outFile}`);
    }
    const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
    await rollbackInjection(report);
    writeReport(report);
    console.log(
      JSON.stringify(
        {
          out_file: outFile,
          rollback_count: report.rollback_count,
          rolled_back_at: report.rolled_back_at || null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const expected = loadAdminFeatures();
  const activeCodes = await fetchActiveAdminCodes();
  const report = buildInjectionPlan(expected, activeCodes);
  writeReport(report);

  console.log(
    JSON.stringify(
      {
        out_file: outFile,
        mode: report.mode,
        level: report.level,
        missing_before: report.missing_before,
        planned_inserts: report.planned_inserts,
      },
      null,
      2,
    ),
  );

  if (mode === "apply") {
    await applyInjection(report);
    writeReport(report);
    console.log(
      JSON.stringify(
        {
          out_file: outFile,
          applied_count: report.applied_count,
          applied_at: report.applied_at || null,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
