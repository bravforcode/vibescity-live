#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PLAYWRIGHT_CLI = join(process.cwd(), "node_modules", "playwright", "cli.js");

const METADATA_PATH =
  process.argv[2] || "tests/e2e/quarantine-map-sla.json";
const OWNER_RE = /^@[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const TICKET_RE = /^[A-Z][A-Z0-9]+-\d+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDiscoveredFile(file) {
  if (file.startsWith("tests/")) {
    return file;
  }
  return `tests/e2e/${file}`;
}

function parseListOutput(stdout) {
  const tests = [];
  const lines = stdout.split(/\r?\n/);
  const rowRe = /^\s+\[[^\]]+\]\s+›\s+(.+?):(\d+):(\d+)\s+›\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(rowRe);
    if (!match) continue;

    const file = normalizeDiscoveredFile(match[1].trim());
    const title = match[4].trim();
    tests.push({
      file,
      title,
      id: `${file}::${title}`,
    });
  }

  return tests;
}

async function discoverQuarantineTests() {
  const args = [
    PLAYWRIGHT_CLI,
    "test",
    '--project=Desktop Chromium',
    "--grep",
    "@map-quarantine",
    "--list",
  ];

  if (!existsSync(PLAYWRIGHT_CLI)) {
    throw new Error(
      `Playwright CLI not found at ${PLAYWRIGHT_CLI}. Run npm ci first.`,
    );
  }

  const { stdout, stderr } = await execFileAsync(process.execPath, args, {
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      PW_NO_WEBSERVER: process.env.PW_NO_WEBSERVER || "1",
    },
  });

  if (stderr?.trim()) {
    console.warn(`[warn] playwright --list stderr: ${stderr.trim()}`);
  }

  return parseListOutput(stdout);
}

async function loadMetadata() {
  if (!existsSync(METADATA_PATH)) {
    throw new Error(`Metadata file not found: ${METADATA_PATH}`);
  }

  const raw = await readFile(METADATA_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const tests = Array.isArray(parsed) ? parsed : parsed.tests;

  if (!Array.isArray(tests)) {
    throw new Error(
      `Metadata must be an array or an object with "tests" array: ${METADATA_PATH}`,
    );
  }

  return tests;
}

function validateMetadata(discoveredTests, metadataEntries) {
  const errors = [];
  const today = utcToday();
  const discoveredIds = new Set(discoveredTests.map((t) => t.id));
  const metadataIds = new Set();

  for (const entry of metadataEntries) {
    if (!entry || typeof entry !== "object") {
      errors.push("Invalid metadata entry: expected object");
      continue;
    }

    const { id, owner, ticket, expires_on: expiresOn, reason } = entry;

    if (!id || typeof id !== "string") {
      errors.push("Metadata entry missing string 'id'");
      continue;
    }

    if (metadataIds.has(id)) {
      errors.push(`Duplicate metadata id: ${id}`);
      continue;
    }
    metadataIds.add(id);

    if (!OWNER_RE.test(owner || "")) {
      errors.push(`Invalid owner format for ${id}: "${owner}"`);
    }

    if (!TICKET_RE.test(ticket || "")) {
      errors.push(`Invalid ticket format for ${id}: "${ticket}"`);
    }

    if (!ISO_DATE_RE.test(expiresOn || "")) {
      errors.push(`Invalid expires_on date format for ${id}: "${expiresOn}"`);
    } else if (expiresOn < today) {
      errors.push(`Expired quarantine SLA for ${id}: expires_on=${expiresOn}`);
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 8) {
      errors.push(`Reason must be a descriptive string for ${id}`);
    }
  }

  for (const test of discoveredTests) {
    if (!metadataIds.has(test.id)) {
      errors.push(`Missing SLA metadata for quarantined test: ${test.id}`);
    }
  }

  for (const entry of metadataEntries) {
    if (!entry?.id) continue;
    if (!discoveredIds.has(entry.id)) {
      errors.push(`Stale SLA metadata (test not found): ${entry.id}`);
    }
  }

  return errors;
}

async function writeSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

async function main() {
  const discoveredTests = await discoverQuarantineTests();
  const metadataEntries = await loadMetadata();
  const errors = validateMetadata(discoveredTests, metadataEntries);

  const summary = [
    "## Map Quarantine SLA",
    `- Quarantined tests discovered: ${discoveredTests.length}`,
    `- SLA entries provided: ${metadataEntries.length}`,
    `- Validation status: ${errors.length === 0 ? "PASS" : "FAIL"}`,
  ];

  if (errors.length > 0) {
    summary.push("", "### SLA Validation Errors");
    for (const err of errors) {
      summary.push(`- ${err}`);
    }
  }

  console.log(summary.join("\n"));
  await writeSummary(summary);

  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  const lines = [
    "## Map Quarantine SLA",
    "- Validation status: FAIL",
    `- Error: ${err?.message || err}`,
  ];
  console.error(lines.join("\n"));
  await writeSummary(lines);
  process.exit(1);
});
