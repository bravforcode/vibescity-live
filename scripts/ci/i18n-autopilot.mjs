#!/usr/bin/env node
/**
 * i18n-autopilot: Full i18n pipeline orchestrator.
 *
 * Steps (all failures are non-fatal — pipeline always continues):
 *   1. Detect hardcoded string violations
 *   2. If violations > 0: run codemod + repair
 *   3. Sync check (en vs th parity)
 *   4. If untranslated > 0 and ANTHROPIC_API_KEY set: auto-translate
 *   5. Orphan check
 *   6. Write final report to tmp/i18n-autopilot-report.json
 *
 * Always exits 0. Use reports to assess state.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "tmp", "i18n-autopilot-report.json");
const NODE = process.execPath;
const SCRIPTS = path.join(ROOT, "scripts", "ci");

const step = async (name, fn) => {
  console.log(`\n[autopilot] ── ${name}`);
  try {
    const result = await fn();
    console.log(`[autopilot] ✓ ${name}`);
    return result;
  } catch (err) {
    console.error(`[autopilot] ✗ ${name}: ${err.message}`);
    return null;
  }
};

const run = async (scriptName, extraArgs) => {
  const args = [path.join(SCRIPTS, scriptName)];
  if (extraArgs) args.push(...extraArgs);
  const { stdout, stderr } = await execFileP(NODE, args, {
    cwd: ROOT,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return stdout;
};

const loadJson = async (p) => {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
};

function parseViolationCount(stdout) {
  const m = stdout.match(/Total violations[:\s]+(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const m2 = stdout.match(/violations[:.\s]+(\d+)/i);
  return m2 ? parseInt(m2[1], 10) : null;
}

async function main() {
  console.log("\n[autopilot] i18n Autopilot Starting");
  console.log("=".repeat(60));

  const report = {
    timestamp: new Date().toISOString(),
    pipeline: {},
    status: "complete",
  };

  await fs.mkdir(path.join(ROOT, "tmp"), { recursive: true });

  // Step 1: Detect hardcoded violations
  const checkOut = await step("Hardcoded string check", () =>
    run("check-source-i18n-hardcoded.mjs")
  );

  const violations = checkOut !== null ? parseViolationCount(checkOut) : null;
  report.pipeline.violations = violations;

  // Step 2: Auto-fix if violations found
  if (violations !== null && violations > 0) {
    console.log(`\n[autopilot] Found ${violations} violations — running codemod...`);
    await step("Codemod (auto-wrap hardcoded strings)", () =>
      run("codemod-i18n-hardcoded.mjs")
    );
    await step("Repair codemod artifacts", () =>
      run("repair-i18n-codemod.mjs")
    );
    report.pipeline.codemodRan = true;
  } else {
    report.pipeline.codemodRan = false;
    if (violations === 0) console.log("[autopilot] No violations — codemod skipped.");
  }

  // Step 3: Sync check + auto-fix missing keys
  await step("Locale parity check (en vs th)", () =>
    run("i18n-sync-checker.mjs", ["--fix-missing"])
  );

  const syncReport = await loadJson(path.join(ROOT, "tmp", "i18n-sync-report.json"));
  if (syncReport) {
    report.pipeline.sync = syncReport.summary;
    console.log(
      `[autopilot]   Untranslated: ${syncReport.summary.untranslated} | Missing: ${syncReport.summary.missingInTh} | Orphaned: ${syncReport.summary.orphanedInTh}`
    );
    if (syncReport.summary.missingInTh > 0) {
      console.log(
        `[autopilot]   (Auto-fixed ${syncReport.summary.missingInTh} missing TH keys with EN placeholders)`
      );
    }
  }

  // Step 4: Auto-translate if API key available
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const untranslatedCount = syncReport?.summary?.untranslated ?? 0;

  if (untranslatedCount > 0 && hasApiKey) {
    console.log(
      `\n[autopilot] ${untranslatedCount} untranslated keys + ANTHROPIC_API_KEY found — auto-translating...`
    );
    await step("Auto-translate Thai keys (batch 20, pause 500ms)", () =>
      run("i18n-auto-translate.mjs")
    );
    const translateReport = await loadJson(
      path.join(ROOT, "tmp", "i18n-translate-report.json")
    );
    report.pipeline.translateRan = true;
    report.pipeline.translated = translateReport?.summary?.translated ?? null;
    if (translateReport?.summary) {
      console.log(
        `[autopilot]   Translated: ${translateReport.summary.translated} | Failed: ${translateReport.summary.failed} | Skipped: ${translateReport.summary.skipped}`
      );
    }
  } else if (untranslatedCount > 0 && !hasApiKey) {
    console.log(
      `\n[autopilot] ${untranslatedCount} untranslated keys found but ANTHROPIC_API_KEY not set.`
    );
    console.log(`[autopilot]   To auto-translate: ANTHROPIC_API_KEY=sk-... bun run i18n:autopilot`);
    report.pipeline.translateRan = false;
    report.pipeline.translateSkipReason = "no_api_key";
  } else {
    report.pipeline.translateRan = false;
  }

  // Step 5: Orphan check
  await step("Orphan key detection", () =>
    run("i18n-orphan-checker.mjs")
  );

  const orphanReport = await loadJson(path.join(ROOT, "tmp", "i18n-orphan-report.json"));
  if (orphanReport) {
    report.pipeline.orphans = orphanReport.summary;
    console.log(
      `[autopilot]   Orphaned: ${orphanReport.summary.orphaned} | Missing in locale: ${orphanReport.summary.missingInLocale}`
    );
  }

  // Step 6: Write final report
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  // Step 7: Track translation progress
  if (report.pipeline.translateRan) {
    await step("Update translation progress tracker", () =>
      run("i18n-translation-tracker.mjs")
    );
  }

  console.log("\n[autopilot] " + "─".repeat(58));
  console.log("[autopilot] Pipeline complete.");
  console.log(`[autopilot] Report: tmp/i18n-autopilot-report.json`);
  console.log("\n[autopilot] Summary:");
  if (report.pipeline.violations !== null) {
    console.log(`  Hardcoded violations: ${report.pipeline.violations}`);
  }
  if (report.pipeline.sync) {
    console.log(`  Untranslated TH keys: ${report.pipeline.sync.untranslated}`);
  }
  if (report.pipeline.orphans) {
    console.log(`  Orphaned locale keys: ${report.pipeline.orphans.orphaned}`);
    if (report.pipeline.orphans.missingInLocale > 0) {
      console.log(`  Missing in locale: ${report.pipeline.orphans.missingInLocale} (check src refs)`);
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error("[autopilot] FATAL:", err.message);
  process.exit(0); // Always exit 0 per spec
});
