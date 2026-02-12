#!/usr/bin/env node
/**
 * CI Guard: SQL Editor runlist safety checks.
 *
 * Checks:
 * 1) Forbidden: ALTER TABLE public.shops
 * 2) Forbidden: unguarded cron.schedule usage
 * 3) Required: every CREATE POLICY has DROP POLICY IF EXISTS for same policy/table
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RUNLIST_DIR = join(process.cwd(), "scripts", "sql");
const RUNLIST_NAME_RE = /^sql_editor_runlist_\d{8}\.sql$/;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRunlists() {
  return readdirSync(RUNLIST_DIR)
    .filter((name) => RUNLIST_NAME_RE.test(name))
    .map((name) => join(RUNLIST_DIR, name));
}

function stripInlineComment(line) {
  const idx = line.indexOf("--");
  return idx === -1 ? line : line.slice(0, idx);
}

function checkForbiddenShopsAlter(filePath, content, errors) {
  const lines = content.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = stripInlineComment(raw);
    if (/^\s*alter\s+table\s+public\.shops\b/i.test(line)) {
      errors.push(`${filePath}:${i + 1} forbidden statement: ALTER TABLE public.shops`);
    }
  });
}

function checkCronGuards(filePath, content, errors) {
  const lines = content.split(/\r?\n/);
  const scheduleLines = [];

  lines.forEach((raw, i) => {
    const line = stripInlineComment(raw);
    if (/cron\.schedule\s*\(/i.test(line)) {
      scheduleLines.push(i + 1);
      if (/^\s*select\s+cron\.schedule\s*\(/i.test(line)) {
        errors.push(
          `${filePath}:${i + 1} unguarded cron schedule pattern (SELECT cron.schedule(...))`
        );
      }
    }
  });

  if (scheduleLines.length === 0) return;

  const hasExtensionGuard = /if\s+exists\s*\(\s*select\s+1\s+from\s+pg_extension\s+where\s+extname\s*=\s*'pg_cron'\s*\)/i.test(
    content
  );
  const hasCronSchemaGuard = /schema_name\s*=\s*'cron'/i.test(content);
  const hasDoBlock = /do\s+\$\$/i.test(content);

  if (!hasDoBlock || !hasExtensionGuard || !hasCronSchemaGuard) {
    errors.push(
      `${filePath}: cron.schedule is used but required guards are missing (DO $$ + pg_cron extension check + cron schema check)`
    );
  }
}

function parseCreatePolicies(content) {
  const regex =
    /create\s+policy\s+("([^"]+)"|[a-zA-Z0-9_]+)\s+on\s+([a-zA-Z0-9_."]+)/gi;
  const results = [];
  for (const match of content.matchAll(regex)) {
    const fullPolicy = match[1];
    const tableRef = match[3];
    results.push({ policy: fullPolicy, table: tableRef });
  }
  return results;
}

function checkPolicyDropPair(filePath, content, errors) {
  const creates = parseCreatePolicies(content);
  for (const c of creates) {
    const dropRe = new RegExp(
      `drop\\s+policy\\s+if\\s+exists\\s+${escapeRegex(c.policy)}\\s+on\\s+${escapeRegex(c.table)}`,
      "i"
    );
    if (!dropRe.test(content)) {
      errors.push(
        `${filePath}: missing DROP POLICY IF EXISTS for CREATE POLICY ${c.policy} ON ${c.table}`
      );
    }
  }
}

function main() {
  const runlists = findRunlists();
  if (runlists.length === 0) {
    console.error("No sql_editor_runlist_YYYYMMDD.sql files found under scripts/sql.");
    process.exit(1);
  }

  const errors = [];

  for (const filePath of runlists) {
    const content = readFileSync(filePath, "utf8");
    checkForbiddenShopsAlter(filePath, content, errors);
    checkCronGuards(filePath, content, errors);
    checkPolicyDropPair(filePath, content, errors);
  }

  if (errors.length > 0) {
    console.error("Runlist guard check failed:");
    errors.forEach((err) => console.error(`- ${err}`));
    process.exit(1);
  }

  console.log(`Runlist guard check passed for ${runlists.length} file(s).`);
}

main();
