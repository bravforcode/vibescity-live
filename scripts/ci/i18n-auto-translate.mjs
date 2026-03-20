#!/usr/bin/env node
/**
 * i18n-auto-translate: Auto-translate untranslated TH keys using Claude API.
 *
 * Sources untranslated keys from tmp/i18n-sync-report.json (run sync-checker first),
 * or performs inline scan if report is missing.
 *
 * Flags:
 *  --dry-run        Print translations without writing th.json
 *  --max-keys N     Limit keys to translate (cost control)
 *  --batch-size N   Override batch size (default: 20)
 *
 * Requires: ANTHROPIC_API_KEY env variable
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const EN_PATH = path.join(ROOT, "src", "locales", "en.json");
const TH_PATH = path.join(ROOT, "src", "locales", "th.json");
const SYNC_REPORT = path.join(ROOT, "tmp", "i18n-sync-report.json");
const TRANSLATE_REPORT = path.join(ROOT, "tmp", "i18n-translate-report.json");

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const MAX_KEYS_IDX = ARGS.indexOf("--max-keys");
const MAX_KEYS = MAX_KEYS_IDX !== -1 ? parseInt(ARGS[MAX_KEYS_IDX + 1], 10) : Infinity;
const BATCH_IDX = ARGS.indexOf("--batch-size");
const BATCH_SIZE = BATCH_IDX !== -1 ? parseInt(ARGS[BATCH_IDX + 1], 10) : 20;

const KNOWN_SAFE_EQUAL = new Set([
  "VibeCity", "VibeCity Live", "VIBECITY", "Grab", "Bolt", "Lineman",
  "Language / ภาษา",
]);

// --- shared utils ---

function flatten(obj, prefix) {
  if (!prefix) prefix = "";
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

function containsLatin(str) { return /[A-Za-z]/.test(str); }

function isIcuOnly(str) {
  const stripped = str.replace(/\{[^}]+\}/g, "").trim();
  return stripped.length === 0 || !containsLatin(stripped);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPrompt(batch) {
  const inputObj = {};
  for (const item of batch) inputObj[item.key] = item.en;

  return (
    "You are translating UI text for VibeCity, a nightlife and entertainment discovery app in Thailand.\n" +
    "Translate the following English UI strings to natural Thai.\n" +
    "Use casual, friendly Thai appropriate for a young adult audience.\n" +
    "Keep formatting tokens like {count}, {lvl}, {km}, {name} exactly as-is.\n" +
    "Keep emoji characters exactly as-is.\n" +
    "For ALL CAPS status labels like OPEN NOW, use casual Thai equivalents.\n" +
    "Return ONLY a JSON object mapping the given keys to their Thai translations. No explanation, no markdown.\n\n" +
    JSON.stringify(inputObj, null, 2)
  );
}

async function translateBatch(client, batch) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: buildPrompt(batch) }],
  });

  const text = (response.content[0]?.text || "").trim();
  const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(clean);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[auto-translate] ERROR: ANTHROPIC_API_KEY env variable is not set.");
    console.error("  Set it and re-run: ANTHROPIC_API_KEY=sk-... bun run i18n:translate");
    process.exit(1);
  }

  let Anthropic;
  try {
    const mod = await import("@anthropic-ai/sdk");
    Anthropic = mod.default;
  } catch {
    console.error("[auto-translate] ERROR: @anthropic-ai/sdk not installed.");
    console.error("  Run: bun add -D @anthropic-ai/sdk");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Load untranslated keys
  let untranslated = [];

  try {
    const syncReport = await loadJson(SYNC_REPORT);
    untranslated = syncReport.untranslated || [];
    console.log(`[auto-translate] Loaded ${untranslated.length} untranslated keys from sync report.`);
  } catch {
    console.log("[auto-translate] No sync report found — scanning inline...");
    const [enJson, thJson] = await Promise.all([loadJson(EN_PATH), loadJson(TH_PATH)]);
    const flatEn = flatten(enJson);
    const flatTh = flatten(thJson);
    for (const [key, enVal] of Object.entries(flatEn)) {
      const thVal = flatTh[key];
      if (
        thVal === enVal &&
        containsLatin(enVal) &&
        !KNOWN_SAFE_EQUAL.has(enVal.trim()) &&
        !isIcuOnly(enVal) &&
        enVal.length >= 2
      ) {
        untranslated.push({ key, en: enVal });
      }
    }
    console.log(`[auto-translate] Found ${untranslated.length} untranslated keys.`);
  }

  // Filter & cap
  const capCount = isFinite(MAX_KEYS) ? MAX_KEYS : untranslated.length;
  const candidates = untranslated
    .filter((x) => x.en.length >= 2 && !isIcuOnly(x.en) && !KNOWN_SAFE_EQUAL.has(x.en.trim()))
    .slice(0, capCount);

  if (candidates.length === 0) {
    console.log("[auto-translate] Nothing to translate.");
    return;
  }

  const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);
  console.log(
    `[auto-translate] Translating ${candidates.length} keys in ${totalBatches} batches (size: ${BATCH_SIZE})...`
  );
  if (DRY_RUN) console.log("[auto-translate] DRY RUN — th.json will NOT be modified.\n");

  const thData = await loadJson(TH_PATH);

  let translated = 0;
  let failed = 0;
  const failedKeys = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}: `);

    let parsed = null;
    try {
      parsed = await translateBatch(client, batch);
    } catch (firstErr) {
      await sleep(2000);
      try {
        parsed = await translateBatch(client, batch);
      } catch (secondErr) {
        const msg = String(secondErr.message || secondErr).slice(0, 60);
        console.log(`FAILED (${msg})`);
        failed += batch.length;
        for (const item of batch) failedKeys.push(item.key);
        continue;
      }
    }

    let batchTranslated = 0;
    for (const item of batch) {
      const thVal = parsed[item.key];
      if (typeof thVal === "string" && thVal.length > 0) {
        if (!DRY_RUN) setNested(thData, item.key, thVal);
        else console.log(`  ${item.key}: "${thVal}"`);
        batchTranslated++;
        translated++;
      } else {
        failed++;
        failedKeys.push(item.key);
      }
    }

    if (!DRY_RUN) console.log(`${batchTranslated}/${batch.length} translated`);

    if (i + BATCH_SIZE < candidates.length) await sleep(500);
  }

  if (!DRY_RUN) {
    await saveJson(TH_PATH, thData);
    console.log(`\n[auto-translate] Updated th.json`);
  }

  console.log(`\n[auto-translate] Done.`);
  console.log(`  Translated: ${translated}`);
  console.log(`  Failed:     ${failed}`);
  console.log(`  Skipped:    ${untranslated.length - candidates.length}`);

  if (failedKeys.length > 0) {
    console.log(`\n  Failed keys (first 10):`);
    for (const k of failedKeys.slice(0, 10)) console.log(`    ${k}`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    summary: { translated, failed, skipped: untranslated.length - candidates.length },
    failedKeys,
  };

  await fs.mkdir(path.join(ROOT, "tmp"), { recursive: true });
  await fs.writeFile(TRANSLATE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`  Report: tmp/i18n-translate-report.json\n`);
}

main().catch((err) => {
  console.error("[auto-translate] ERROR:", err.message);
  process.exit(1);
});
