#!/usr/bin/env node
/**
 * i18n-orphan-checker: Find locale keys never referenced in source,
 * and source t() calls referencing keys missing from locale files.
 *
 * Reports:
 *  - orphaned:  keys in locale file not referenced in any src file
 *  - missing:   t("key") calls in source with no matching locale key
 *
 * Flags:
 *  --prune   Remove orphaned keys from both en.json and th.json
 *
 * Note: Dynamic keys (t(variable), t(`template`)) are skipped — static only.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

const ROOT = process.cwd();
const EN_PATH = path.join(ROOT, "src", "locales", "en.json");
const TH_PATH = path.join(ROOT, "src", "locales", "th.json");
const I18N_JS = path.join(ROOT, "src", "i18n.js");
const REPORT_PATH = path.join(ROOT, "tmp", "i18n-orphan-report.json");

const ARGS = process.argv.slice(2);
const PRUNE = ARGS.includes("--prune");

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

function pruneObject(obj, pruneSet, prefix = "") {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (pruneSet.has(fullKey)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const pruned = pruneObject(v, pruneSet, fullKey);
      if (Object.keys(pruned).length > 0) result[k] = pruned;
    } else {
      result[k] = v;
    }
  }
  return result;
}

const loadJson = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const saveJson = async (p, data) =>
  fs.writeFile(p, `${JSON.stringify(data, null, 2)}\n`);

async function parseInlineKeys() {
  const src = await fs.readFile(I18N_JS, "utf8");
  const keys = new Set();
  const nsRe = /^\s{2,4}(\w+)\s*:\s*\{([\s\S]*?)\n\s{2,4}\}/gm;
  let m;
  while ((m = nsRe.exec(src)) !== null) {
    const nsName = m[1];
    const nsBlock = m[2];
    const kvRe = /^\s+(\w+)\s*:\s*["']([^"'\n]+)["']/gm;
    let nm;
    while ((nm = kvRe.exec(nsBlock)) !== null) {
      keys.add(`${nsName}.${nm[1]}`);
    }
  }
  return keys;
}

// Regex patterns for static t() calls
const T_PATTERNS = [
  /\$t\(\s*['"]([^'"]+)['"]/g,
  /\bt\(\s*['"]([^'"]+)['"]/g,
  /i18n\.global\.t\(\s*['"]([^'"]+)['"]/g,
  /i18n\.t\(\s*['"]([^'"]+)['"]/g,
  /\bte\(\s*['"]([^'"]+)['"]/g,
  /\btc\(\s*['"]([^'"]+)['"]/g,
];

async function extractReferencedKeys(files) {
  const referenced = new Set();
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    for (const pattern of T_PATTERNS) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(content)) !== null) {
        referenced.add(m[1]);
      }
    }
  }
  return referenced;
}

async function main() {
  // Build effective locale key set
  const enJson = await loadJson(EN_PATH);
  const inlineKeys = await parseInlineKeys();
  const flatEn = flatten(enJson);
  const effectiveLocaleKeys = new Set([...Object.keys(flatEn), ...inlineKeys]);

  // Scan source files
  const files = await glob("src/**/*.{vue,js,ts}", {
    cwd: ROOT,
    absolute: true,
    ignore: ["**/*.spec.*", "**/*.test.*", "**/i18n.js", "**/_old*"],
  });

  const referencedKeys = await extractReferencedKeys(files);

  // Categorize
  const orphaned = [];
  const missingInLocale = [];

  for (const key of effectiveLocaleKeys) {
    if (!referencedKeys.has(key)) {
      orphaned.push(key);
    }
  }

  for (const key of referencedKeys) {
    if (!effectiveLocaleKeys.has(key)) {
      missingInLocale.push(key);
    }
  }

  const autoOrphaned = orphaned.filter((k) => k.startsWith("auto."));
  const manualOrphaned = orphaned.filter((k) => !k.startsWith("auto."));

  console.log("\n[orphan-checker] REPORT");
  console.log("=".repeat(60));
  console.log(`Scanned: ${files.length} source files`);
  console.log(`Referenced keys: ${referencedKeys.size} (static only)`);
  console.log(`\nOrphaned keys (in locale, unused): ${orphaned.length}`);
  console.log(`  auto.*:  ${autoOrphaned.length}`);
  console.log(`  manual:  ${manualOrphaned.length}`);
  console.log(`\nMissing keys (in source, not in locale): ${missingInLocale.length}`);

  if (manualOrphaned.length > 0) {
    console.log(`\nManual orphaned keys:`);
    for (const k of manualOrphaned.slice(0, 10)) console.log(`  ${k}`);
  }

  if (missingInLocale.length > 0) {
    console.log(`\nMissing in locale (first 10):`);
    for (const k of missingInLocale.slice(0, 10)) console.log(`  ${k}`);
  }

  console.log(
    `\nNote: Dynamic t(variable) keys are excluded from static analysis.`
  );

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      scannedFiles: files.length,
      referencedKeys: referencedKeys.size,
      orphaned: orphaned.length,
      autoOrphaned: autoOrphaned.length,
      manualOrphaned: manualOrphaned.length,
      missingInLocale: missingInLocale.length,
    },
    orphaned: { auto: autoOrphaned, manual: manualOrphaned },
    missingInLocale,
  };

  await fs.mkdir(path.join(ROOT, "tmp"), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport: tmp/i18n-orphan-report.json`);

  if (PRUNE && orphaned.length > 0) {
    console.log(`\n[orphan-checker] Pruning ${orphaned.length} orphaned keys...`);
    const pruneSet = new Set(orphaned);
    const [enData, thData] = await Promise.all([
      loadJson(EN_PATH),
      loadJson(TH_PATH),
    ]);
    await Promise.all([
      saveJson(EN_PATH, pruneObject(enData, pruneSet)),
      saveJson(TH_PATH, pruneObject(thData, pruneSet)),
    ]);
    console.log(`[orphan-checker] Pruned from en.json and th.json.`);
  }

  console.log("");
}

main().catch((err) => {
  console.error("[orphan-checker] ERROR:", err.message);
  process.exit(1);
});
