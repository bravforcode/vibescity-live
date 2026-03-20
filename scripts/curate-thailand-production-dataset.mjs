#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
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

const mode = args.mode || "report"; // report | apply | restore
const sourceLike = Object.prototype.hasOwnProperty.call(args, "source") ? args.source : "%";
const batch = Number(args.batch || 5000);
const chunk = Number(args.chunk || 500);
const maxRows = Number(args.max || 0);
const outFile = path.resolve(args.out || "scripts/reports/thailand-dataset-curation-phase1.json");
const reportOnlyCandidates = String(args.candidatesOnly || args.candidates_only || "0") === "1";

const supabase = createClient(url, key);
const datasetCache = new Map();
const bboxCache = new WeakMap();

function loadFeaturesCached(relativePath) {
  const absolutePath = path.join(thaiGeoAssetsRoot, relativePath);
  if (datasetCache.has(absolutePath)) return datasetCache.get(absolutePath);
  if (!fs.existsSync(absolutePath)) {
    datasetCache.set(absolutePath, null);
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const features = Array.isArray(parsed?.features) ? parsed.features : [];
  datasetCache.set(absolutePath, features);
  return features;
}

function getFeatureBbox(feature) {
  let bbox = bboxCache.get(feature);
  if (!bbox) {
    bbox = turf.bbox(feature);
    bboxCache.set(feature, bbox);
  }
  return bbox;
}

function buildNationalBBox(features) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const feature of features) {
    const [fMinLng, fMinLat, fMaxLng, fMaxLat] = getFeatureBbox(feature);
    minLng = Math.min(minLng, fMinLng);
    minLat = Math.min(minLat, fMinLat);
    maxLng = Math.max(maxLng, fMaxLng);
    maxLat = Math.max(maxLat, fMaxLat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

function pointWithinBBox(lng, lat, bbox) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

function matchProvince(point, lat, lng, features) {
  for (const feature of features) {
    const bbox = getFeatureBbox(feature);
    if (!pointWithinBBox(lng, lat, bbox)) continue;
    if (!turf.booleanPointInPolygon(point, feature)) continue;
    return {
      province_en: feature.properties?.ADM1_EN || null,
      province_th: feature.properties?.ADM1_TH || null,
      province_code: feature.properties?.ADM1_PCODE || null,
    };
  }
  return null;
}

const provinceFeatures = loadFeaturesCached("accuracy_level_1/province.json");
if (!provinceFeatures?.length) {
  throw new Error("Could not load Thailand province polygons from thai-geolocate assets");
}
const thailandBBox = buildNationalBBox(provinceFeatures);

async function fetchPage(lastId) {
  let q = supabase
    .from("venues")
    .select("id,source,province,status,latitude,longitude,created_at,updated_at")
    .order("id", { ascending: true })
    .limit(batch)
    .is("deleted_at", null)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (sourceLike != null && sourceLike !== "") {
    q = q.ilike("source", `${sourceLike}%`);
  }
  if (lastId) q = q.gt("id", lastId);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function pushCount(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topEntries(map, limit = 25) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function classifyRow(row) {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { kind: "skip", reason: "missing_coords", match: null };
  }

  if (!pointWithinBBox(lng, lat, thailandBBox)) {
    return { kind: "candidate", reason: "outside_thailand_bbox", match: null };
  }

  const point = turf.point([lng, lat]);
  const province = matchProvince(point, lat, lng, provinceFeatures);
  if (!province) {
    return { kind: "candidate", reason: "outside_thailand_polygon", match: null };
  }

  return { kind: "inside", reason: "inside_thailand_polygon", match: province };
}

function summarize(report) {
  return {
    generated_at: report.generated_at,
    mode: report.mode,
    source_like: report.source_like,
    total_scanned: report.total_scanned,
    active_scanned_with_coords: report.active_scanned_with_coords,
    candidate_count: report.candidate_count,
    inside_thailand_count: report.inside_thailand_count,
    skipped_count: report.skipped_count,
    candidate_reasons: report.candidate_reasons,
    candidates_by_source: report.candidates_by_source,
    top_candidate_provinces: report.top_candidate_provinces,
    top_inside_provinces: report.top_inside_provinces,
    applied_count: report.applied_count,
    restored_count: report.restored_count,
    out_file: outFile,
  };
}

async function buildReport() {
  const candidateRows = [];
  const candidateReasonCounts = new Map();
  const candidateSourceCounts = new Map();
  const candidateProvinceCounts = new Map();
  const insideProvinceCounts = new Map();
  const sampleCandidates = [];
  let totalScanned = 0;
  let skippedCount = 0;
  let insideThailandCount = 0;
  let lastId = null;

  while (true) {
    const page = await fetchPage(lastId);
    if (!page.length) break;
    lastId = page.at(-1).id;
    for (const row of page) {
      totalScanned += 1;
      const result = classifyRow(row);
      if (result.kind === "skip") {
        skippedCount += 1;
        continue;
      }

      if (result.kind === "inside") {
        insideThailandCount += 1;
        pushCount(
          insideProvinceCounts,
          result.match?.province_en || result.match?.province_th || row.province || "UNKNOWN",
        );
        continue;
      }

      pushCount(candidateReasonCounts, result.reason);
      pushCount(candidateSourceCounts, row.source || "NULL");
      pushCount(candidateProvinceCounts, row.province || "NULL");

      const candidate = {
        id: row.id,
        source: row.source,
        province: row.province,
        status_before: row.status,
        latitude: row.latitude,
        longitude: row.longitude,
        reason: result.reason,
      };
      candidateRows.push(candidate);
      if (sampleCandidates.length < 50) sampleCandidates.push(candidate);
    }

    const progress = {
      phase: "scan",
      scanned: totalScanned,
      candidates: candidateRows.length,
      last_id: lastId,
    };
    console.log(JSON.stringify(progress));

    if (maxRows > 0 && totalScanned >= maxRows) break;
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode,
    source_like: sourceLike,
    total_scanned: totalScanned,
    active_scanned_with_coords: totalScanned,
    candidate_count: candidateRows.length,
    inside_thailand_count: insideThailandCount,
    skipped_count: skippedCount,
    candidate_reasons: Object.fromEntries(candidateReasonCounts),
    candidates_by_source: Object.fromEntries(candidateSourceCounts),
    top_candidate_provinces: topEntries(candidateProvinceCounts),
    top_inside_provinces: topEntries(insideProvinceCounts),
    sample_candidates: sampleCandidates,
    applied_count: 0,
    restored_count: 0,
    candidates: reportOnlyCandidates ? candidateRows : candidateRows,
  };

  return report;
}

async function updateChunk(ids, payload) {
  const { error } = await supabase
    .from("venues")
    .update(payload)
    .in("id", ids);
  if (error) throw error;
}

async function applyQuarantine(report) {
  const nowIso = new Date().toISOString();
  let applied = 0;
  for (let i = 0; i < report.candidates.length; i += chunk) {
    const slice = report.candidates.slice(i, i + chunk);
    await updateChunk(
      slice.map((row) => row.id),
      {
        deleted_at: nowIso,
        is_deleted: true,
        status: "inactive",
      },
    );
    applied += slice.length;
    console.log(JSON.stringify({ phase: "apply", applied, total: report.candidates.length }));
  }
  report.applied_count = applied;
  report.applied_at = nowIso;
  return report;
}

async function restoreFromReport(report) {
  const groups = new Map();
  for (const row of report.candidates || []) {
    const key = row.status_before == null ? "__NULL__" : String(row.status_before);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.id);
  }

  let restored = 0;
  for (const [statusKey, ids] of groups.entries()) {
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk);
      const payload = {
        deleted_at: null,
        is_deleted: false,
      };
      if (statusKey !== "__NULL__") {
        payload.status = statusKey;
      }
      await updateChunk(slice, payload);
      restored += slice.length;
      console.log(JSON.stringify({ phase: "restore", restored, total: report.candidates.length }));
    }
  }

  report.restored_count = restored;
  report.restored_at = new Date().toISOString();
  return report;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
}

async function main() {
  if (mode === "restore") {
    if (!fs.existsSync(outFile)) {
      throw new Error(`Restore report not found: ${outFile}`);
    }
    const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
    await restoreFromReport(report);
    writeReport(report);
    console.log(JSON.stringify(summarize(report), null, 2));
    return;
  }

  const report = await buildReport();
  writeReport(report);
  console.log(JSON.stringify(summarize(report), null, 2));

  if (mode === "apply") {
    await applyQuarantine(report);
    writeReport(report);
    console.log(JSON.stringify(summarize(report), null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
