#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

async function appendSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function getParentDir(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "." : path.slice(0, idx) || ".";
}

const isMissingColumn = (error, columnName) => {
  const code = String(error?.code || "");
  const msg = String(error?.message || "").toLowerCase();
  return (
    (code === "42703" && msg.includes(columnName)) ||
    (msg.includes("column") && msg.includes(columnName) && msg.includes("does not exist"))
  );
};

async function fetchPaged(client, table, fields, pageSize, maxRows) {
  const out = [];
  let offset = 0;

  while (out.length < maxRows) {
    const { data, error } = await client
      .from(table)
      .select(fields)
      .range(offset, offset + pageSize - 1);

    if (error) return { ok: false, error };

    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (!rows.length || rows.length < pageSize) break;
    offset += pageSize;
  }

  return { ok: true, data: out.slice(0, maxRows) };
}

async function fetchVenues(client, pageSize, maxRows) {
  const baseFields = "id,slug,short_code";
  const baseFieldsNoShort = "id,slug";
  const baseFieldsNoSlug = "id,short_code";

  const attempt = await fetchPaged(client, "venues_public", baseFields, pageSize, maxRows);
  if (attempt.ok) return attempt.data;

  if (isMissingColumn(attempt.error, "short_code")) {
    const retry = await fetchPaged(client, "venues_public", baseFieldsNoShort, pageSize, maxRows);
    if (retry.ok) return retry.data;
  }

  if (isMissingColumn(attempt.error, "slug")) {
    const retry = await fetchPaged(client, "venues_public", baseFieldsNoSlug, pageSize, maxRows);
    if (retry.ok) return retry.data;
  }

  // Fallback to full venues table (service role required)
  const fallback = await fetchPaged(client, "venues", baseFields, pageSize, maxRows);
  if (fallback.ok) return fallback.data;

  if (isMissingColumn(fallback.error, "short_code")) {
    const retry = await fetchPaged(client, "venues", baseFieldsNoShort, pageSize, maxRows);
    if (retry.ok) return retry.data;
  }

  if (isMissingColumn(fallback.error, "slug")) {
    const retry = await fetchPaged(client, "venues", baseFieldsNoSlug, pageSize, maxRows);
    if (retry.ok) return retry.data;
  }

  throw fallback.error;
}

function normalizeSlug(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw ? raw : null;
}

function normalizeShortCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  return raw ? raw : null;
}

function isValidShortCode(value) {
  return /^[A-Z2-7]{7}$/.test(value);
}

function countDuplicates(values) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  return { duplicates, total: duplicates.reduce((sum, item) => sum + item.count, 0) };
}

async function main() {
  const outputPath =
    process.env.SEO_QUALITY_OUTPUT_PATH || "reports/ci/seo-data-quality.json";

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) {
    await appendSummary([
      "## SEO Data Quality",
      "- Status: SKIP",
      "- Reason: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    ]);
    return;
  }

  const pageSize = Math.min(Math.max(toInt(process.env.SEO_QUALITY_PAGE_SIZE, 1000), 100), 5000);
  const maxRows = Math.min(Math.max(toInt(process.env.SEO_QUALITY_MAX_ROWS, 20000), 100), 100000);

  const maxMissingSlugs = toInt(process.env.SEO_QUALITY_MAX_MISSING_SLUGS, 0);
  const maxMissingShortCodes = toInt(process.env.SEO_QUALITY_MAX_MISSING_SHORT_CODES, 0);
  const maxDuplicateSlugs = toInt(process.env.SEO_QUALITY_MAX_DUPLICATE_SLUGS, 0);
  const maxDuplicateShortCodes = toInt(process.env.SEO_QUALITY_MAX_DUPLICATE_SHORT_CODES, 0);
  const maxInvalidShortCodes = toInt(process.env.SEO_QUALITY_MAX_INVALID_SHORT_CODES, 0);
  const failOnAlert = toBool(process.env.SEO_QUALITY_FAIL_ON_ALERT, true);

  const adminClient = createClient(supabaseUrl, serviceKey);
  const venues = await fetchVenues(adminClient, pageSize, maxRows);

  const rows = Array.isArray(venues) ? venues : [];
  const missingSlugRows = rows.filter((row) => !normalizeSlug(row.slug));
  const missingShortCodeRows = rows.filter((row) => !normalizeShortCode(row.short_code));

  const slugValues = rows.map((row) => normalizeSlug(row.slug)).filter(Boolean);
  const shortValues = rows.map((row) => normalizeShortCode(row.short_code)).filter(Boolean);

  const { duplicates: duplicateSlugs, total: duplicateSlugCount } = countDuplicates(slugValues);
  const { duplicates: duplicateShortCodes, total: duplicateShortCodeCount } = countDuplicates(
    shortValues,
  );

  const invalidShortCodes = shortValues.filter((value) => !isValidShortCode(value));

  const reasons = [];
  if (missingSlugRows.length > maxMissingSlugs) {
    reasons.push(`missing_slugs=${missingSlugRows.length} > ${maxMissingSlugs}`);
  }
  if (missingShortCodeRows.length > maxMissingShortCodes) {
    reasons.push(`missing_short_codes=${missingShortCodeRows.length} > ${maxMissingShortCodes}`);
  }
  if (duplicateSlugCount > maxDuplicateSlugs) {
    reasons.push(`duplicate_slugs=${duplicateSlugCount} > ${maxDuplicateSlugs}`);
  }
  if (duplicateShortCodeCount > maxDuplicateShortCodes) {
    reasons.push(`duplicate_short_codes=${duplicateShortCodeCount} > ${maxDuplicateShortCodes}`);
  }
  if (invalidShortCodes.length > maxInvalidShortCodes) {
    reasons.push(`invalid_short_codes=${invalidShortCodes.length} > ${maxInvalidShortCodes}`);
  }

  const alert = reasons.length > 0;

  const payload = {
    generated_at: new Date().toISOString(),
    total_rows: rows.length,
    missing_slugs: missingSlugRows.length,
    missing_short_codes: missingShortCodeRows.length,
    duplicate_slugs: duplicateSlugs.slice(0, 25),
    duplicate_short_codes: duplicateShortCodes.slice(0, 25),
    invalid_short_codes: invalidShortCodes.slice(0, 25),
    thresholds: {
      max_missing_slugs: maxMissingSlugs,
      max_missing_short_codes: maxMissingShortCodes,
      max_duplicate_slugs: maxDuplicateSlugs,
      max_duplicate_short_codes: maxDuplicateShortCodes,
      max_invalid_short_codes: maxInvalidShortCodes,
    },
    alert,
    reasons,
  };

  await mkdir(getParentDir(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2));

  const lines = [
    "## SEO Data Quality",
    `- Rows checked: ${rows.length}`,
    `- Missing slugs: ${missingSlugRows.length}`,
    `- Missing short codes: ${missingShortCodeRows.length}`,
    `- Duplicate slugs: ${duplicateSlugCount}`,
    `- Duplicate short codes: ${duplicateShortCodeCount}`,
    `- Invalid short codes: ${invalidShortCodes.length}`,
    `- Alert: ${alert ? "yes" : "no"}`,
  ];
  if (reasons.length > 0) {
    lines.push("- Reasons:");
    lines.push(...reasons.map((reason) => `  - ${reason}`));
  }
  await appendSummary(lines);

  if (process.env.GITHUB_OUTPUT) {
    const outputLines = [
      `alert=${alert}`,
      `alert_text=${alert ? `SEO data quality: ${reasons.join("; ")}` : ""}`,
    ];
    await appendFile(process.env.GITHUB_OUTPUT, `${outputLines.join("\n")}\n`);
  }

  if (alert && failOnAlert) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const lines = [
    "## SEO Data Quality",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await appendSummary(lines);
  process.exit(1);
});
