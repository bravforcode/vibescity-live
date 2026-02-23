#!/usr/bin/env node

import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { parseStringPromise } from "xml2js";

const args = process.argv.slice(2);
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

function arg(name, fallback = "") {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function appendSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function parseJUnit(parsed) {
  const root = parsed.testsuites || parsed.testsuite || {};
  const suites = toArray(root.testsuite || parsed.testsuite || []);

  const failures = [];
  let total = 0;
  let failed = 0;
  let skipped = 0;

  for (const suite of suites) {
    const cases = toArray(suite.testcase);
    for (const testCase of cases) {
      total += 1;

      const hasFailure =
        toArray(testCase.failure).length > 0 || toArray(testCase.error).length > 0;
      const hasSkip = toArray(testCase.skipped).length > 0;

      if (hasFailure) {
        failed += 1;
        const className = testCase.classname || suite.name || "unknown";
        const name = testCase.name || "unnamed test";
        failures.push(`${className} :: ${name}`);
      } else if (hasSkip) {
        skipped += 1;
      }
    }
  }

  const passed = Math.max(total - failed - skipped, 0);
  return { total, passed, failed, skipped, failures };
}

async function main() {
  const lane = arg("--lane", "e2e");
  const junitPath = arg("--junit", "reports/e2e/junit.xml");
  const maxFailures = Number.parseInt(arg("--max-failures", "10"), 10);

  const header = `## E2E Summary: ${lane}`;

  if (!existsSync(junitPath)) {
    const lines = [
      header,
      "- Status: unable to parse JUnit report",
      `- Report path not found: \`${junitPath}\``,
    ];
    console.log(lines.join("\n"));
    await appendSummary(lines);
    return;
  }

  try {
    const xml = await readFile(junitPath, "utf8");
    const parsed = await parseStringPromise(xml, {
      explicitArray: false,
      mergeAttrs: true,
    });

    const { total, passed, failed, skipped, failures } = parseJUnit(parsed);
    const lines = [
      header,
      `- Total: ${total}`,
      `- Passed: ${passed}`,
      `- Failed: ${failed}`,
      `- Skipped: ${skipped}`,
    ];

    if (failed > 0) {
      lines.push("", "### Failures");
      for (const name of failures.slice(0, Math.max(maxFailures, 1))) {
        lines.push(`- ${name}`);
      }
      if (failures.length > maxFailures) {
        lines.push(`- ... and ${failures.length - maxFailures} more`);
      }
      lines.push("- See Playwright artifact for full details.");
    }

    console.log(lines.join("\n"));
    await appendSummary(lines);
  } catch (err) {
    const lines = [
      header,
      "- Status: unable to parse JUnit report",
      `- Parse error: ${err?.message || err}`,
    ];
    console.error(lines.join("\n"));
    await appendSummary(lines);
  }
}

main();
