#!/usr/bin/env node

/**
 * Export Supabase `public.analytics_events_archive_daily` to BigQuery (warehouse-ready).
 *
 * Safety / Idempotency:
 * - Deletes the target day partition for (day, source_env) before insert (bounded DELETE).
 * - Never touches raw/PII tables; exports only daily aggregate rows.
 *
 * Expected BigQuery schema (provisioned by scripts/ci/provision-bigquery-analytics.mjs):
 * - day (DATE), venue_ref (STRING), event_type (STRING)
 * - events_count (INT64), unique_visitors (INT64), created_at (TIMESTAMP)
 * - source_env (STRING), exported_at (TIMESTAMP)
 */

import { createSign } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

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

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function appendSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

async function loadServiceAccount() {
  const rawJson = process.env.BIGQUERY_SERVICE_ACCOUNT_JSON;
  const jsonPath = process.env.BIGQUERY_SERVICE_ACCOUNT_JSON_PATH;
  if (rawJson) return JSON.parse(rawJson);
  if (jsonPath && existsSync(jsonPath)) {
    const raw = await readFile(jsonPath, "utf8");
    return JSON.parse(raw);
  }
  return null;
}

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope:
      "https://www.googleapis.com/auth/bigquery https://www.googleapis.com/auth/bigquery.insertdata",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  const assertion = `${signingInput}.${base64Url(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OAuth token request failed: ${response.status} ${response.statusText} ${text.slice(0, 400)}`,
    );
  }

  const tokenData = await response.json();
  if (!tokenData?.access_token) {
    throw new Error("OAuth token response missing access_token");
  }
  return tokenData.access_token;
}

function bigQueryValue(value) {
  if (value === null || value === undefined) return { value: null };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { value: String(value), type: "INT64" }
      : { value: String(value), type: "FLOAT64" };
  }
  if (typeof value === "boolean") {
    return { value: value ? "true" : "false", type: "BOOL" };
  }
  return { value: String(value), type: "STRING" };
}

async function runBigQueryQuery({
  accessToken,
  projectId,
  query,
  params,
  paramTypes,
}) {
  const queryParameters = Object.entries(params || {}).map(([name, rawValue]) => {
    const typeHint = paramTypes?.[name];
    if (typeHint) {
      return {
        name,
        parameterType: { type: typeHint },
        parameterValue: { value: rawValue === null ? null : String(rawValue) },
      };
    }

    const normalized = bigQueryValue(rawValue);
    return {
      name,
      parameterType: { type: normalized.type || "STRING" },
      parameterValue: { value: normalized.value },
    };
  });

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        useLegacySql: false,
        query,
        parameterMode: "NAMED",
        queryParameters,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `BigQuery query failed: ${response.status} ${response.statusText} ${text.slice(0, 400)}`,
    );
  }

  return response.json();
}

async function insertRowsIntoBigQuery({
  accessToken,
  projectId,
  dataset,
  table,
  rows,
}) {
  if (!rows.length) return { inserted: 0, errors: [] };
  const endpoint =
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables/${table}/insertAll`;
  const chunkSize = toInt(process.env.BIGQUERY_INSERT_CHUNK_SIZE, 500);
  let inserted = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const body = {
      skipInvalidRows: true,
      ignoreUnknownValues: true,
      rows: chunk.map((json, idx) => ({
        insertId: `${Date.now()}-${i}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        json,
      })),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      errors.push(
        `insertAll ${table} failed: ${response.status} ${response.statusText} ${text.slice(0, 300)}`,
      );
      continue;
    }

    const payload = await response.json();
    if (Array.isArray(payload?.insertErrors) && payload.insertErrors.length > 0) {
      errors.push(
        `insertAll ${table} returned insertErrors for ${payload.insertErrors.length} rows`,
      );
      inserted += Math.max(chunk.length - payload.insertErrors.length, 0);
    } else {
      inserted += chunk.length;
    }
  }

  return { inserted, errors };
}

function isoDayUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDay(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function listDaysInclusive(startDay, endDay) {
  const out = [];
  const start = new Date(`${startDay}T00:00:00Z`);
  const end = new Date(`${endDay}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return out;
  if (start > end) return out;

  const cur = new Date(start);
  while (cur <= end) {
    out.push(isoDayUTC(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function fetchArchiveDailyForDay({ supabase, day, pageSize }) {
  let offset = 0;
  const rows = [];

  for (;;) {
    const { data, error } = await supabase
      .from("analytics_events_archive_daily")
      .select("day, venue_ref, event_type, events_count, unique_visitors, created_at")
      .eq("day", day)
      .order("venue_ref", { ascending: true })
      .order("event_type", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Supabase select failed (day=${day}): ${error.message}`);
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }

  return rows;
}

async function main() {
  const outputPath =
    process.env.ANALYTICS_EXPORT_OUTPUT_PATH ||
    "reports/ci/analytics-warehouse-export-log.json";
  const failOnError = toBool(process.env.ANALYTICS_EXPORT_FAIL_ON_ERROR, true);

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const projectId = process.env.BIGQUERY_PROJECT_ID || "";
  const dataset =
    process.env.BIGQUERY_ANALYTICS_DATASET || process.env.BIGQUERY_DATASET || "";
  const table = process.env.BIGQUERY_ANALYTICS_TABLE || "analytics_events_archive_daily";

  const sourceEnv =
    process.env.ANALYTICS_EXPORT_SOURCE ||
    process.env.ENV ||
    process.env.NODE_ENV ||
    "unknown";
  const pageSize = toInt(process.env.ANALYTICS_EXPORT_PAGE_SIZE, 5000);
  const deleteBeforeInsert = toBool(process.env.ANALYTICS_EXPORT_DELETE_BEFORE_INSERT, true);

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const defaultDay = isoDayUTC(yesterday);

  const startDay = parseIsoDay(process.env.ANALYTICS_EXPORT_START_DAY) || defaultDay;
  const endDay = parseIsoDay(process.env.ANALYTICS_EXPORT_END_DAY) || startDay;
  const days = listDaysInclusive(startDay, endDay);

  const startedAt = new Date().toISOString();
  const log = {
    ok: false,
    started_at: startedAt,
    finished_at: null,
    config: {
      bigquery: { projectId, dataset, table },
      supabase: { url: supabaseUrl ? "set" : "missing", service_role_key: supabaseServiceKey ? "set" : "missing" },
      source_env: sourceEnv,
      start_day: startDay,
      end_day: endDay,
      delete_before_insert: deleteBeforeInsert,
      page_size: pageSize,
    },
    runs: [],
    errors: [],
  };

  try {
    await mkdir("reports/ci", { recursive: true });

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    }
    if (!projectId || !dataset) {
      throw new Error("Missing BIGQUERY_PROJECT_ID or BIGQUERY_DATASET/BIGQUERY_ANALYTICS_DATASET.");
    }
    if (!days.length) {
      throw new Error(
        `Invalid date range: start=${startDay} end=${endDay} (expected YYYY-MM-DD)`,
      );
    }

    const serviceAccount = await loadServiceAccount();
    if (!serviceAccount) {
      throw new Error(
        "Missing BIGQUERY_SERVICE_ACCOUNT_JSON (or BIGQUERY_SERVICE_ACCOUNT_JSON_PATH).",
      );
    }

    const accessToken = await getGoogleAccessToken(serviceAccount);
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await appendSummary([
      "## Analytics Warehouse Export",
      `- Source: Supabase \`analytics_events_archive_daily\``,
      `- Target: \`${projectId}.${dataset}.${table}\``,
      `- Range: \`${startDay}\` .. \`${endDay}\``,
      `- source_env: \`${sourceEnv}\``,
      `- Idempotent: ${deleteBeforeInsert ? "DELETE partition then insert" : "insert only"}`,
    ]);

    for (const day of days) {
      const exportedAt = new Date().toISOString();
      const run = {
        day,
        fetched_rows: 0,
        deleted_rows_estimate: null,
        inserted_rows: 0,
        errors: [],
        exported_at: exportedAt,
      };

      try {
        const rows = await fetchArchiveDailyForDay({ supabase, day, pageSize });
        run.fetched_rows = rows.length;

        if (!rows.length) {
          log.runs.push(run);
          continue;
        }

        if (deleteBeforeInsert) {
          await runBigQueryQuery({
            accessToken,
            projectId,
            query: `DELETE FROM \`${projectId}.${dataset}.${table}\`
WHERE day = @day AND source_env = @source_env`,
            params: { day, source_env: sourceEnv },
            paramTypes: { day: "DATE", source_env: "STRING" },
          });
        }

        const bqRows = rows.map((r) => ({
          day: r.day,
          venue_ref: r.venue_ref,
          event_type: r.event_type,
          events_count: Number.parseInt(String(r.events_count ?? "0"), 10) || 0,
          unique_visitors: Number.parseInt(String(r.unique_visitors ?? "0"), 10) || 0,
          created_at: r.created_at,
          source_env: sourceEnv,
          exported_at: exportedAt,
        }));

        const { inserted, errors } = await insertRowsIntoBigQuery({
          accessToken,
          projectId,
          dataset,
          table,
          rows: bqRows,
        });
        run.inserted_rows = inserted;
        run.errors.push(...errors);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        run.errors.push(message);
        log.errors.push(`day=${day}: ${message}`);
      }

      log.runs.push(run);
    }

    log.ok = log.errors.length === 0;
    log.finished_at = new Date().toISOString();

    await writeFile(outputPath, JSON.stringify(log, null, 2));

    await appendSummary([
      "",
      `- Days: ${days.length}`,
      `- Errors: ${log.errors.length}`,
      `- Log: \`${outputPath}\``,
    ]);

    process.exit(log.ok ? 0 : failOnError ? 1 : 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.ok = false;
    log.finished_at = new Date().toISOString();
    log.errors.push(message);
    try {
      await mkdir("reports/ci", { recursive: true });
      await writeFile(outputPath, JSON.stringify(log, null, 2));
    } catch {
      // ignore
    }

    await appendSummary([
      "## Analytics Warehouse Export",
      `- Result: FAILED`,
      `- Error: ${message}`,
    ]);

    process.exit(failOnError ? 1 : 0);
  }
}

await main();

