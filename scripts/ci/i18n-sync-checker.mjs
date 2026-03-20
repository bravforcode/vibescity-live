#!/usr/bin/env node
/**
 * i18n-sync-checker: Key parity checker between en.json and th.json.
 *
 * Reports:
 *  - missingInTh:   keys in en not present in th
 *  - untranslated:  keys where th === en (English placeholder)
 *  - orphanedInTh:  keys in th not present in en
 *  - inlineOnly:    keys in i18n.js inline messages (not in JSON files)
 *
 * Flags:
 *  --fix-missing   Add missing TH keys (copies EN value as placeholder)
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const EN_PATH = path.join(ROOT, "src", "locales", "en.json");
const TH_PATH = path.join(ROOT, "src", "locales", "th.json");
const I18N_JS = path.join(ROOT, "src", "i18n.js");
const REPORT_PATH = path.join(ROOT, "tmp", "i18n-sync-report.json");

const ARGS = process.argv.slice(2);
const FIX_MISSING = ARGS.includes("--fix-missing");

const KNOWN_SAFE_EQUAL = new Set([
  "VibeCity", "VibeCity Live", "VIBECITY", "Grab", "Bolt", "Lineman",
  "Language / ภาษา",
]);

// --- shared utils ---

function flatten(obj, prefix = "") {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(result, flatten(v, fullKey));
    } else if (typeof v === "string") {
      result[fullKey] = v;
    }
  }
  return result;
}

function setNested(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const loadJson = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const saveJson = async (p, data) =>
  fs.writeFile(p, `${JSON.stringify(data, null, 2)}\n`);

async function parseInlineMessages() {
  const src = await fs.readFile(I18N_JS, "utf8");
  const enKeys = new Map();
  const thKeys = new Map();

  const extractKeysFromBlock = (block) => {
    const result = new Map();
    const nsRe = /^\s{2,4}(\w+)\s*:\s*\{([\s\S]*?)\n\s{2,4}\}/gm;
    let m;
    while ((m = nsRe.exec(block)) !== null) {
      const nsName = m[1];
      const nsBlock = m[2];
      const kvRe = /^\s+(\w+)\s*:\s*["']([^"'\n]+)["']/gm;
      let nm;
      while ((nm = kvRe.exec(nsBlock)) !== null) {
        result.set(`${nsName}.${nm[1]}`, nm[2]);
      }
    }
    return result;
  };

  const enMatch = src.match(/\ben\s*:\s*\{([\s\S]*?)\n\s*\},?\s*\nth\s*:/);
  const thMatch = src.match(/\bth\s*:\s*\{([\s\S]*?)(?=\n\s*\}\s*;)/);

  if (enMatch) for (const [k, v] of extractKeysFromBlock(enMatch[1])) enKeys.set(k, v);
  if (thMatch) for (const [k, v] of extractKeysFromBlock(thMatch[1])) thKeys.set(k, v);

  return { en: enKeys, th: thKeys };
}

function containsLatin(str) { return /[A-Za-z]/.test(str); }

function isIcuOnly(str) {
  const stripped = str.replace(/\{[^}]+\}/g, "").trim();
  return stripped.length === 0 || !containsLatin(stripped);
}

async function main() {
  const [enJson, thJson] = await Promise.all([loadJson(EN_PATH), loadJson(TH_PATH)]);
  const { en: inlineEn, th: inlineTh } = await parseInlineMessages();

  const flatEn = flatten(enJson);
  const flatTh = flatten(thJson);

  for (const [k, v] of inlineEn) flatEn[k] = v;
  for (const [k, v] of inlineTh) flatTh[k] = v;

  const enKeySet = new Set(Object.keys(flatEn));
  const thKeySet = new Set(Object.keys(flatTh));

  const missingInTh = [];
  const untranslated = [];
  const orphanedInTh = [];
  const inlineOnlyKeys = [...inlineEn.keys()];

  for (const key of enKeySet) {
    const enVal = flatEn[key];
    if (!thKeySet.has(key)) { missingInTh.push({ key, en: enVal }); continue; }
    const thVal = flatTh[key];
    if (
      thVal === enVal &&
      containsLatin(enVal) &&
      !KNOWN_SAFE_EQUAL.has(enVal.trim()) &&
      !isIcuOnly(enVal)
    ) {
      untranslated.push({ key, en: enVal });
    }
  }

  for (const key of thKeySet) {
    if (!enKeySet.has(key)) orphanedInTh.push({ key, th: flatTh[key] });
  }

  console.log("\n[sync-checker] REPORT");
  console.log("=".repeat(60));
  console.log(`Missing in th:     ${missingInTh.length} keys`);
  console.log(`Untranslated:      ${untranslated.length} keys  (th === en)`);
  console.log(`Orphaned in th:    ${orphanedInTh.length} keys`);
  console.log(`Inline-only keys:  ${inlineOnlyKeys.length} (in i18n.js, not JSON)`);

  if (untranslated.length > 0) {
    const autoCount = untranslated.filter((x) => x.key.startsWith("auto.")).length;
    console.log(`\nCategory breakdown:`);
    console.log(`  auto.*:      ${autoCount} untranslated`);
    console.log(`  manual keys: ${untranslated.length - autoCount} untranslated`);
  }

  if (missingInTh.length > 0 && !FIX_MISSING) {
    console.log(`\nFirst 5 missing in th:`);
    for (const item of missingInTh.slice(0, 5)) console.log(`  ${item.key}: "${item.en}"`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      missingInTh: missingInTh.length,
      untranslated: untranslated.length,
      orphanedInTh: orphanedInTh.length,
      inlineOnlyCount: inlineOnlyKeys.length,
    },
    missingInTh,
    untranslated,
    orphanedInTh,
    inlineOnlyKeys,
  };

  await fs.mkdir(path.join(ROOT, "tmp"), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport: tmp/i18n-sync-report.json`);

  if (FIX_MISSING && missingInTh.length > 0) {
    console.log(`\n[sync-checker] Fixing ${missingInTh.length} missing TH keys...`);
    const thData = JSON.parse(await fs.readFile(TH_PATH, "utf8"));
    for (const { key, en } of missingInTh) {
      if (inlineOnlyKeys.includes(key)) continue;
      setNested(thData, key, en);
    }
    await saveJson(TH_PATH, thData);
    console.log(`[sync-checker] Done.`);
  }

  console.log("");
}

main().catch((err) => {
  console.error("[sync-checker] ERROR:", err.message);
  process.exit(1);
});
