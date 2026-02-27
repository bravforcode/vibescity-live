#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [k, ...rest] = line.split("=");
    if (!process.env[k]) process.env[k] = rest.join("=").trim().replace(/^"|"$/g, "");
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf("=");
  return i > 0 ? [a.slice(0, i).replace(/^--/, ""), a.slice(i + 1)] : [a.replace(/^--/, ""), "1"];
}));
const mode = args.mode || "run"; // backfill | report | run
const sourceLike = args.source || "osm";
const batch = Number(args.batch || 3000);
const parallel = Number(args.parallel || 24);
const updateChunk = Number(args.chunk || 400);
const maxRows = Number(args.max || 0);
const outFile = args.out ? path.resolve(args.out) : path.resolve("scripts/reports/th-admin-coverage.json");

let findTambon;
try {
  ({ findTambon } = await import("thai-geolocate"));
} catch {
  throw new Error("Missing package 'thai-geolocate'. Run: bun add --no-save thai-geolocate");
}
const supabase = createClient(url, key);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableSupabaseError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "PGRST002" || message.includes("schema cache") || message.includes("timed out");
}

async function withRetry(fn, label, attempts = 5) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableSupabaseError(error) || i === attempts) throw error;
      const waitMs = Math.min(1000 * i, 4000);
      console.warn(JSON.stringify({ phase: "retry", label, attempt: i, wait_ms: waitMs, error: error?.message || String(error) }));
      await sleep(waitMs);
    }
  }
  throw lastError;
}

async function mapPool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

function classifyCategory(category) {
  const c = String(category || "").toLowerCase();
  return {
    shops: /(shop|store|retail|market|shopping|convenience|supermarket|mall|department)/.test(c) ? 1 : 0,
    cafes: /(cafe|coffee)/.test(c) ? 1 : 0,
    malls: /(mall|shopping mall|plaza|center|hypermarket|supercenter)/.test(c) ? 1 : 0,
    department_stores: /(department[_ ]?store|department store)/.test(c) ? 1 : 0,
  };
}

const TH_PROVINCES_77_EN = [
  "Amnat Charoen", "Ang Thong", "Bangkok", "Bueng Kan", "Buriram", "Chachoengsao", "Chai Nat", "Chaiyaphum",
  "Chanthaburi", "Chiang Mai", "Chiang Rai", "Chon Buri", "Chumphon", "Kalasin", "Kamphaeng Phet", "Kanchanaburi",
  "Khon Kaen", "Krabi", "Lampang", "Lamphun", "Loei", "Lopburi", "Mae Hong Son", "Maha Sarakham", "Mukdahan",
  "Nakhon Nayok", "Nakhon Pathom", "Nakhon Phanom", "Nakhon Ratchasima", "Nakhon Sawan", "Nakhon Si Thammarat",
  "Nan", "Narathiwat", "Nong Bua Lamphu", "Nong Khai", "Nonthaburi", "Pathum Thani", "Pattani", "Phang Nga",
  "Phatthalung", "Phayao", "Phetchabun", "Phetchaburi", "Phichit", "Phitsanulok", "Phrae", "Phuket", "Prachin Buri",
  "Prachuap Khiri Khan", "Ranong", "Ratchaburi", "Rayong", "Roi Et", "Sa Kaeo", "Sakon Nakhon", "Samut Prakan",
  "Samut Sakhon", "Samut Songkhram", "Saraburi", "Satun", "Sing Buri", "Sisaket", "Songkhla", "Sukhothai",
  "Suphan Buri", "Surat Thani", "Surin", "Tak", "Trang", "Trat", "Ubon Ratchathani", "Udon Thani", "Uthai Thani",
  "Uttaradit", "Yala", "Yasothon",
];

function asUpdate(row, hit) {
  const p = hit?.province || {}, a = hit?.amphoe || {}, t = hit?.tambon || {};
  const full = Boolean(p.pcode && a.pcode && t.pcode);
  return {
    id: row.id,
    province_th: p.nameTH || null, province_en: p.nameEN || null,
    district_th: a.nameTH || null, district_en: a.nameEN || null,
    subdistrict_th: t.nameTH || null, subdistrict_en: t.nameEN || null,
    province_code: p.pcode || null, district_code: a.pcode || null, subdistrict_code: t.pcode || null,
    admin_source: "thai-geolocate",
    admin_confidence: full ? 100 : 60,
    admin_resolved_at: new Date().toISOString(),
  };
}

async function fetchPage(lastId) {
  return withRetry(async () => {
    let q = supabase
      .from("venues")
      .select("id,category,province,latitude,longitude")
      .order("id", { ascending: true })
      .limit(batch)
      .ilike("source", `${sourceLike}%`);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }, "fetchPage");
}

async function bulkUpdate(rows) {
  let changed = 0;
  for (let i = 0; i < rows.length; i += updateChunk) {
    const slice = rows.slice(i, i + updateChunk);
    const { data, error } = await withRetry(
      () => supabase.rpc("bulk_update_venue_admin", { p_rows: slice }),
      "bulk_update_venue_admin",
    );
    if (error) throw error;
    changed += Number(data || 0);
  }
  return changed;
}

async function canUseBulkAdminRpc() {
  const { error } = await supabase.rpc("bulk_update_venue_admin", { p_rows: [] });
  if (!error) return true;
  return String(error?.code || "") !== "PGRST202" && !String(error?.message || "").includes("Could not find the function");
}

async function updateProvinceFallback(rows) {
  const byProvince = new Map();
  for (const r of rows) {
    if (!r?.id || !r?.province_en) continue;
    if (!byProvince.has(r.province_en)) byProvince.set(r.province_en, []);
    byProvince.get(r.province_en).push(r.id);
  }
  let updated = 0;
  for (const [province, ids] of byProvince.entries()) {
    for (let i = 0; i < ids.length; i += updateChunk) {
      const slice = ids.slice(i, i + updateChunk);
      const { error } = await withRetry(
        () => supabase.from("venues").update({ province }).in("id", slice),
        "province_fallback_update",
      );
      if (error) throw error;
      updated += slice.length;
    }
  }
  return updated;
}

function addCoverage(coverage, row, hit) {
  const pEn = hit?.province?.nameEN || row.province || "UNKNOWN";
  const dEn = hit?.amphoe?.nameEN || "UNKNOWN";
  const stats = classifyCategory(row.category);
  const dk = `${pEn}::${dEn}`;

  if (!coverage.provinces.has(pEn)) {
    coverage.provinces.set(pEn, {
      province: pEn,
      venue_count: 0,
      with_coords: 0,
      resolved_admin: 0,
      shops: 0,
      cafes: 0,
      malls: 0,
      department_stores: 0,
    });
  }
  if (!coverage.districts.has(dk)) {
    coverage.districts.set(dk, {
      province: pEn,
      district: dEn,
      venue_count: 0,
      resolved_admin: 0,
      shops: 0,
      cafes: 0,
      malls: 0,
      department_stores: 0,
    });
  }
  const p = coverage.provinces.get(pEn);
  const d = coverage.districts.get(dk);
  p.venue_count += 1;
  d.venue_count += 1;
  if (row.latitude != null && row.longitude != null) {
    p.with_coords += 1;
    coverage.rows_with_coords += 1;
  }
  if (hit?.province?.nameEN && hit?.amphoe?.nameEN && hit?.tambon?.nameEN) {
    p.resolved_admin += 1;
    d.resolved_admin += 1;
    coverage.rows_resolved_admin += 1;
  }
  p.shops += stats.shops;
  p.cafes += stats.cafes;
  p.malls += stats.malls;
  p.department_stores += stats.department_stores;
  d.shops += stats.shops;
  d.cafes += stats.cafes;
  d.malls += stats.malls;
  d.department_stores += stats.department_stores;
  coverage.category_totals.shops += stats.shops;
  coverage.category_totals.cafes += stats.cafes;
  coverage.category_totals.malls += stats.malls;
  coverage.category_totals.department_stores += stats.department_stores;
}

async function processAll({ doUpdate, doReport }) {
  const useBulkAdminRpc = doUpdate ? await canUseBulkAdminRpc() : false;
  const coverage = {
    rows_with_coords: 0,
    rows_resolved_admin: 0,
    category_totals: { shops: 0, cafes: 0, malls: 0, department_stores: 0 },
    provinces: new Map(),
    districts: new Map(),
  };
  let lastId = "", scanned = 0, resolved = 0, updated = 0, loops = 0;

  while (true) {
    if (maxRows > 0 && scanned >= maxRows) break;
    const rows = await fetchPage(lastId);
    if (!rows.length) break;
    loops += 1;
    lastId = rows[rows.length - 1].id;
    if (maxRows > 0 && scanned + rows.length > maxRows) {
      rows.length = maxRows - scanned;
      if (!rows.length) break;
    }
    scanned += rows.length;

    const resolvedRows = await mapPool(rows, parallel, async (r) => {
      if (r.latitude == null || r.longitude == null) return { row: r, hit: null, update: null };
      try {
        const hit = await findTambon(Number(r.latitude), Number(r.longitude), { province: 1, amphoe: 1, tambon: 2 });
        const update = asUpdate(r, hit);
        return { row: r, hit, update };
      } catch {
        return { row: r, hit: null, update: null };
      }
    });

    const updates = resolvedRows.map((x) => x.update).filter(Boolean);
    resolved += updates.length;

    if (doUpdate && updates.length) {
      if (useBulkAdminRpc) {
        updated += await bulkUpdate(updates);
      } else {
        updated += await updateProvinceFallback(updates);
      }
    }

    if (doReport) {
      for (const item of resolvedRows) addCoverage(coverage, item.row, item.hit);
    }

    console.log(JSON.stringify({ phase: doUpdate ? "backfill" : "report", loops, scanned, resolved, updated, lastId, useBulkAdminRpc }));
  }

  let report = null;
  if (doReport) {
    const provinceRows = Array.from(coverage.provinces.values()).sort((a, b) => a.province.localeCompare(b.province));
    const districtRows = Array.from(coverage.districts.values()).sort((a, b) => {
      const p = a.province.localeCompare(b.province);
      return p !== 0 ? p : a.district.localeCompare(b.district);
    });
    const presentProvinceSet = new Set(provinceRows.map((r) => r.province).filter((p) => p !== "UNKNOWN"));
    const missingProvinces = TH_PROVINCES_77_EN.filter((p) => !presentProvinceSet.has(p));
    report = {
      generated_at: new Date().toISOString(),
      source_like: `${sourceLike}%`,
      total_rows: scanned,
      rows_with_coords: coverage.rows_with_coords,
      rows_resolved_admin: coverage.rows_resolved_admin,
      rows_resolved_admin_pct: scanned ? Number(((coverage.rows_resolved_admin * 100) / scanned).toFixed(2)) : 0,
      provinces_expected: TH_PROVINCES_77_EN.length,
      provinces_with_data: presentProvinceSet.size,
      provinces_missing_count: missingProvinces.length,
      provinces_missing: missingProvinces,
      district_count: coverage.districts.size,
      category_totals: coverage.category_totals,
      province_breakdown: provinceRows,
      district_breakdown: districtRows,
    };
  }

  return {
    scanned,
    resolved,
    updated,
    useBulkAdminRpc,
    report,
  };
}

async function runMode() {
  const doUpdate = mode === "run" || mode === "backfill";
  const doReport = mode === "run" || mode === "report";
  const out = await processAll({ doUpdate, doReport });
  const summary = {
    generated_at: new Date().toISOString(),
    source_like: `${sourceLike}%`,
    mode,
    batch,
    parallel,
    scanned: out.scanned,
    resolved_from_coords: out.resolved,
    updated_rows: out.updated,
    used_bulk_admin_rpc: out.useBulkAdminRpc,
    report_written: Boolean(out.report),
    output_path: out.report ? outFile : null,
  };
  if (out.report) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(out.report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ phase: mode, ...summary }));
}

await runMode();
