#!/usr/bin/env node
/**
 * i18n-translation-tracker: Track translation progress over time.
 *
 * Maintains tmp/i18n-translation-history.json with cumulative stats:
 *  - Keys translated per run
 *  - Failed keys (retry list)
 *  - Translation velocity (keys/run)
 *  - Timestamp history
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const HISTORY_PATH = path.join(ROOT, "tmp", "i18n-translation-history.json");
const TRANSLATE_REPORT = path.join(ROOT, "tmp", "i18n-translate-report.json");
const SYNC_REPORT = path.join(ROOT, "tmp", "i18n-sync-report.json");

const loadJson = async (p) => {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
};

const saveJson = async (p, data) => {
  await fs.writeFile(p, `${JSON.stringify(data, null, 2)}\n`);
};

async function main() {
  const translateReport = await loadJson(TRANSLATE_REPORT);
  const syncReport = await loadJson(SYNC_REPORT);

  if (!translateReport) {
    console.log("[tracker] No recent translation report — skipping.");
    return;
  }

  let history = await loadJson(HISTORY_PATH);
  if (!history) {
    history = {
      created: new Date().toISOString(),
      runs: [],
      totalTranslated: 0,
      totalFailed: 0,
      failedKeys: new Set(),
      avgKeysPerRun: 0,
    };
  }

  const translated = translateReport.summary?.translated ?? 0;
  const failed = translateReport.summary?.failed ?? 0;
  const skipped = translateReport.summary?.skipped ?? 0;

  history.runs.push({
    timestamp: translateReport.timestamp,
    translated,
    failed,
    skipped,
  });

  history.totalTranslated += translated;
  history.totalFailed += failed;

  // Track failed keys for retry
  if (Array.isArray(translateReport.failedKeys)) {
    for (const key of translateReport.failedKeys) {
      history.failedKeys.add(key);
    }
  }

  history.avgKeysPerRun =
    history.totalTranslated / Math.max(1, history.runs.length);

  // Convert Set back to array for JSON
  const historyForJson = {
    ...history,
    failedKeys: Array.from(history.failedKeys),
    lastRun: history.runs[history.runs.length - 1],
  };

  await fs.mkdir(path.join(ROOT, "tmp"), { recursive: true });
  await saveJson(HISTORY_PATH, historyForJson);

  console.log("\n[tracker] Translation Progress");
  console.log("=".repeat(60));
  console.log(`Total translated (all time): ${history.totalTranslated}`);
  console.log(`Total failed (all time):     ${history.totalFailed}`);
  console.log(`Average per run:             ${history.avgKeysPerRun.toFixed(1)} keys`);
  console.log(`Number of runs:              ${history.runs.length}`);

  if (history.failedKeys.size > 0) {
    console.log(`\nFailed keys (needs retry): ${history.failedKeys.size}`);
    for (const k of Array.from(history.failedKeys).slice(0, 5)) {
      console.log(`  ${k}`);
    }
  }

  if (syncReport?.summary?.untranslated) {
    const remaining = syncReport.summary.untranslated - history.totalTranslated;
    const runsNeeded = Math.ceil(remaining / history.avgKeysPerRun);
    if (remaining > 0) {
      console.log(`\nProjection:`);
      console.log(`  Remaining untranslated: ${remaining} keys`);
      console.log(`  Estimated runs to complete: ${runsNeeded}`);
    } else {
      console.log(`\n✅ All translations complete!`);
    }
  }

  console.log(`\nHistory: tmp/i18n-translation-history.json\n`);
}

main().catch((err) => {
  console.error("[tracker] ERROR:", err.message);
  process.exit(1);
});
