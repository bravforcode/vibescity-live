#!/usr/bin/env node

/**
 * BigQuery analytics warehouse provisioning (idempotent + production-safe).
 *
 * Purpose:
 * - Ensure an analytics warehouse table exists for daily archived product analytics
 * - Use field-based DAY partitioning on `day` and clustering for common filters
 * - Apply partition retention (expirationMs) (best-effort)
 *
 * Safety:
 * - Never deletes or truncates data.
 * - Does not attempt to migrate existing unpartitioned tables.
 */

import { createSign } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

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

function msFromDays(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return null;
  return Math.trunc(d * 24 * 60 * 60 * 1000);
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
    scope: "https://www.googleapis.com/auth/bigquery",
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

  const payloadJson = await response.json();
  if (!payloadJson?.access_token) {
    throw new Error("OAuth response missing access_token");
  }
  return payloadJson.access_token;
}

async function fetchJson(url, { accessToken, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, json, text };
}

function unionSchema(existingFields, requiredFields) {
  const next = [];
  const seen = new Set();

  for (const field of Array.isArray(existingFields) ? existingFields : []) {
    if (!field?.name) continue;
    next.push(field);
    seen.add(field.name);
  }

  for (const field of Array.isArray(requiredFields) ? requiredFields : []) {
    if (!field?.name) continue;
    if (seen.has(field.name)) continue;
    next.push(field);
    seen.add(field.name);
  }

  return next;
}

function tableSchemaAnalyticsArchiveDaily() {
  return {
    fields: [
      { name: "day", type: "DATE", mode: "NULLABLE" },
      { name: "venue_ref", type: "STRING", mode: "NULLABLE" },
      { name: "event_type", type: "STRING", mode: "NULLABLE" },
      { name: "events_count", type: "INT64", mode: "NULLABLE" },
      { name: "unique_visitors", type: "INT64", mode: "NULLABLE" },
      { name: "created_at", type: "TIMESTAMP", mode: "NULLABLE" },
      { name: "source_env", type: "STRING", mode: "NULLABLE" },
      { name: "exported_at", type: "TIMESTAMP", mode: "NULLABLE" },
    ],
  };
}

async function ensureDataset({
  accessToken,
  projectId,
  dataset,
  datasetLocation,
  allowCreate,
  log,
}) {
  const getUrl =
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}`;
  const getRes = await fetchJson(getUrl, { accessToken });
  if (getRes.ok) {
    log.push({ step: "dataset:get", dataset, status: "ok" });
    return { exists: true };
  }
  if (getRes.status !== 404) {
    log.push({
      step: "dataset:get",
      dataset,
      status: "error",
      http_status: getRes.status,
    });
    throw new Error(
      `Failed to fetch dataset ${dataset}: ${getRes.status} ${getRes.text.slice(0, 200)}`,
    );
  }

  if (!allowCreate) {
    log.push({ step: "dataset:create", dataset, status: "skipped" });
    return { exists: false };
  }

  const createUrl =
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`;
  const createRes = await fetchJson(createUrl, {
    accessToken,
    method: "POST",
    body: {
      datasetReference: { projectId, datasetId: dataset },
      location: datasetLocation,
    },
  });

  if (!createRes.ok) {
    log.push({
      step: "dataset:create",
      dataset,
      status: "error",
      http_status: createRes.status,
    });
    throw new Error(
      `Failed to create dataset ${dataset}: ${createRes.status} ${createRes.text.slice(0, 200)}`,
    );
  }

  log.push({ step: "dataset:create", dataset, status: "ok" });
  return { exists: true };
}

function tableCreateBody({
  projectId,
  dataset,
  table,
  schema,
  partitionField,
  partitionExpirationMs,
  clusteringFields,
}) {
  const body = {
    tableReference: {
      projectId,
      datasetId: dataset,
      tableId: table,
    },
    schema,
    timePartitioning: {
      type: "DAY",
      field: partitionField,
    },
  };

  if (partitionExpirationMs) {
    body.timePartitioning.expirationMs = String(partitionExpirationMs);
  }

  if (Array.isArray(clusteringFields) && clusteringFields.length > 0) {
    body.clustering = { fields: clusteringFields };
  }

  return body;
}

async function ensureTable({
  accessToken,
  projectId,
  dataset,
  table,
  schema,
  partitionField,
  partitionExpirationMs,
  clusteringFields,
  allowCreate,
  applyRetention,
  log,
}) {
  const getUrl =
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables/${table}`;
  const getRes = await fetchJson(getUrl, { accessToken });
  if (getRes.ok) {
    log.push({ step: "table:get", table, status: "ok" });

    const existing = getRes.json || {};
    const existingFields = existing?.schema?.fields || [];
    const requiredFields = schema?.fields || [];
    const mergedFields = unionSchema(existingFields, requiredFields);
    const needsSchemaPatch = mergedFields.length !== existingFields.length;

    const timePartitioning = existing?.timePartitioning || null;
    const isPartitionedCorrectly =
      timePartitioning?.type === "DAY" && timePartitioning?.field === partitionField;

    if (!isPartitionedCorrectly) {
      log.push({
        step: "table:partitioning",
        table,
        status: "warning",
        message:
          "Table exists but is not field-partitioned as expected; skipping retention updates.",
      });
    }

    const patchBody = {};
    if (needsSchemaPatch) {
      patchBody.schema = { fields: mergedFields };
    }

    if (applyRetention && isPartitionedCorrectly && partitionExpirationMs) {
      patchBody.timePartitioning = {
        ...timePartitioning,
        expirationMs: String(partitionExpirationMs),
      };
    }

    const existingCluster = existing?.clustering?.fields;
    const wantCluster =
      Array.isArray(clusteringFields) && clusteringFields.length > 0 ? clusteringFields : null;
    const needsClusterPatch =
      wantCluster &&
      (!Array.isArray(existingCluster) ||
        existingCluster.join(",") !== wantCluster.join(","));
    if (needsClusterPatch) {
      patchBody.clustering = { fields: wantCluster };
    }

    if (Object.keys(patchBody).length === 0) {
      log.push({ step: "table:patch", table, status: "noop" });
      return { exists: true, patched: false };
    }

    const patchRes = await fetchJson(getUrl, {
      accessToken,
      method: "PATCH",
      body: patchBody,
    });
    if (!patchRes.ok) {
      log.push({
        step: "table:patch",
        table,
        status: "error",
        http_status: patchRes.status,
      });
      throw new Error(
        `Failed to patch table ${table}: ${patchRes.status} ${patchRes.text.slice(0, 200)}`,
      );
    }

    log.push({ step: "table:patch", table, status: "ok" });
    return { exists: true, patched: true };
  }

  if (getRes.status !== 404) {
    log.push({ step: "table:get", table, status: "error", http_status: getRes.status });
    throw new Error(
      `Failed to fetch table ${table}: ${getRes.status} ${getRes.text.slice(0, 200)}`,
    );
  }

  if (!allowCreate) {
    log.push({ step: "table:create", table, status: "skipped" });
    return { exists: false };
  }

  const createUrl =
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables`;
  const createBody = tableCreateBody({
    projectId,
    dataset,
    table,
    schema,
    partitionField,
    partitionExpirationMs,
    clusteringFields,
  });

  const createRes = await fetchJson(createUrl, {
    accessToken,
    method: "POST",
    body: createBody,
  });
  if (!createRes.ok) {
    log.push({ step: "table:create", table, status: "error", http_status: createRes.status });
    throw new Error(
      `Failed to create table ${table}: ${createRes.status} ${createRes.text.slice(0, 200)}`,
    );
  }

  log.push({ step: "table:create", table, status: "ok" });
  return { exists: true };
}

async function main() {
  const outputPath =
    process.env.BIGQUERY_ANALYTICS_PROVISION_OUTPUT_PATH ||
    "reports/ci/bigquery-analytics-provision-log.json";
  const failOnError = toBool(process.env.BIGQUERY_PROVISION_FAIL_ON_ERROR, false);

  const projectId = process.env.BIGQUERY_PROJECT_ID || "";
  const dataset =
    process.env.BIGQUERY_ANALYTICS_DATASET || process.env.BIGQUERY_DATASET || "";
  const table = process.env.BIGQUERY_ANALYTICS_TABLE || "analytics_events_archive_daily";
  const datasetLocation = process.env.BIGQUERY_DATASET_LOCATION || "US";
  const allowCreateDataset = toBool(process.env.BIGQUERY_ALLOW_CREATE_DATASET, false);
  const allowCreateTables = toBool(process.env.BIGQUERY_ALLOW_CREATE_TABLES, true);
  const applyRetention = toBool(process.env.BIGQUERY_APPLY_PARTITION_RETENTION, true);
  const retentionDays = toInt(process.env.BIGQUERY_ANALYTICS_PARTITION_RETENTION_DAYS, 365);
  const partitionExpirationMs = msFromDays(retentionDays);

  const log = [];
  const startedAt = new Date().toISOString();

  try {
    await mkdir("reports/ci", { recursive: true });

    if (!projectId || !dataset) {
      throw new Error(
        "Missing BIGQUERY_PROJECT_ID or BIGQUERY_DATASET/BIGQUERY_ANALYTICS_DATASET.",
      );
    }

    const serviceAccount = await loadServiceAccount();
    if (!serviceAccount) {
      throw new Error(
        "Missing BIGQUERY_SERVICE_ACCOUNT_JSON (or BIGQUERY_SERVICE_ACCOUNT_JSON_PATH).",
      );
    }

    const accessToken = await getGoogleAccessToken(serviceAccount);

    await appendSummary([
      "## BigQuery Analytics Provisioning",
      `- Project: \`${projectId}\``,
      `- Dataset: \`${dataset}\``,
      `- Table: \`${table}\``,
      `- Partition field: \`day\` (DAY)`,
      `- Retention: ${retentionDays} days (apply=${applyRetention ? "yes" : "no"})`,
    ]);

    const ds = await ensureDataset({
      accessToken,
      projectId,
      dataset,
      datasetLocation,
      allowCreate: allowCreateDataset,
      log,
    });
    if (!ds.exists) {
      throw new Error(
        `Dataset ${dataset} does not exist and BIGQUERY_ALLOW_CREATE_DATASET is disabled.`,
      );
    }

    await ensureTable({
      accessToken,
      projectId,
      dataset,
      table,
      schema: tableSchemaAnalyticsArchiveDaily(),
      partitionField: "day",
      partitionExpirationMs,
      clusteringFields: ["source_env", "event_type", "venue_ref"],
      allowCreate: allowCreateTables,
      applyRetention,
      log,
    });

    await writeFile(
      outputPath,
      JSON.stringify(
        {
          ok: true,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          config: {
            projectId,
            dataset,
            table,
            datasetLocation,
            allowCreateDataset,
            allowCreateTables,
            applyRetention,
            retentionDays,
          },
          steps: log,
        },
        null,
        2,
      ),
    );

    await appendSummary([
      "",
      "- Result: OK",
      `- Log: \`${outputPath}\``,
    ]);

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push({ step: "fatal", status: "error", message });
    try {
      await mkdir("reports/ci", { recursive: true });
      await writeFile(
        outputPath,
        JSON.stringify(
          {
            ok: false,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            error: message,
            steps: log,
          },
          null,
          2,
        ),
      );
    } catch {
      // ignore secondary write failures
    }

    await appendSummary([
      "## BigQuery Analytics Provisioning",
      `- Result: FAILED`,
      `- Error: ${message}`,
    ]);

    process.exit(failOnError ? 1 : 0);
  }
}

await main();

