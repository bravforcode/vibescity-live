#!/usr/bin/env node

/**
 * BigQuery observability provisioning (idempotent + production-safe).
 *
 * Purpose:
 * - Ensure the three observability tables exist with field-based day partitioning on `observed_at`
 * - Apply partition retention (expirationMs) per table
 * - Optionally set dataset-level defaults (off by default)
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

async function readJsonIfExists(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

async function fetchJson(url, { accessToken, method = "GET", body, query } = {}) {
  const fullUrl = query
    ? `${url}?${new URLSearchParams(query).toString()}`
    : url;
  const response = await fetch(fullUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text().catch(() => "");
  const json = text ? JSON.parse(text) : null;
  return { ok: response.ok, status: response.status, json };
}

function tableSchemaReleaseHealth() {
  return {
    fields: [
      { name: "observed_at", type: "TIMESTAMP", mode: "NULLABLE" },
      { name: "workflow", type: "STRING", mode: "NULLABLE" },
      { name: "lane", type: "STRING", mode: "NULLABLE" },
      { name: "repository", type: "STRING", mode: "NULLABLE" },
      { name: "run_id", type: "STRING", mode: "NULLABLE" },
      { name: "run_url", type: "STRING", mode: "NULLABLE" },
      { name: "synthetic_api_result", type: "STRING", mode: "NULLABLE" },
      { name: "synthetic_api_classification", type: "STRING", mode: "NULLABLE" },
      { name: "synthetic_browser_result", type: "STRING", mode: "NULLABLE" },
      { name: "overall_status", type: "STRING", mode: "NULLABLE" },
      { name: "classification", type: "STRING", mode: "NULLABLE" },
      { name: "source_file", type: "STRING", mode: "NULLABLE" },
    ],
  };
}

function tableSchemaRouteChecks() {
  return {
    fields: [
      { name: "observed_at", type: "TIMESTAMP", mode: "NULLABLE" },
      { name: "workflow", type: "STRING", mode: "NULLABLE" },
      { name: "lane", type: "STRING", mode: "NULLABLE" },
      { name: "repository", type: "STRING", mode: "NULLABLE" },
      { name: "run_id", type: "STRING", mode: "NULLABLE" },
      { name: "run_url", type: "STRING", mode: "NULLABLE" },
      { name: "endpoint_key", type: "STRING", mode: "NULLABLE" },
      { name: "method", type: "STRING", mode: "NULLABLE" },
      { name: "path", type: "STRING", mode: "NULLABLE" },
      { name: "breach_type", type: "STRING", mode: "NULLABLE" },
      { name: "breach_key", type: "STRING", mode: "NULLABLE" },
      { name: "breached", type: "BOOL", mode: "NULLABLE" },
      { name: "required", type: "BOOL", mode: "NULLABLE" },
      { name: "severity", type: "STRING", mode: "NULLABLE" },
      { name: "latest_status", type: "INT64", mode: "NULLABLE" },
      { name: "latency_ms_p95", type: "FLOAT64", mode: "NULLABLE" },
      { name: "latency_threshold_ms_p95", type: "FLOAT64", mode: "NULLABLE" },
      { name: "checks_found", type: "INT64", mode: "NULLABLE" },
      { name: "classification", type: "STRING", mode: "NULLABLE" },
      { name: "status", type: "STRING", mode: "NULLABLE" },
      { name: "source_file", type: "STRING", mode: "NULLABLE" },
    ],
  };
}

function tableSchemaQualityTrends() {
  return {
    fields: [
      { name: "observed_at", type: "TIMESTAMP", mode: "NULLABLE" },
      { name: "workflow", type: "STRING", mode: "NULLABLE" },
      { name: "lane", type: "STRING", mode: "NULLABLE" },
      { name: "repository", type: "STRING", mode: "NULLABLE" },
      { name: "run_id", type: "STRING", mode: "NULLABLE" },
      { name: "run_url", type: "STRING", mode: "NULLABLE" },
      { name: "period", type: "STRING", mode: "NULLABLE" },
      { name: "metric", type: "STRING", mode: "NULLABLE" },
      // Stored as STRING because some metrics (ex: lighthouse_outcome) are non-numeric.
      { name: "metric_value", type: "STRING", mode: "NULLABLE" },
      { name: "threshold_value", type: "STRING", mode: "NULLABLE" },
      { name: "breached", type: "BOOL", mode: "NULLABLE" },
      { name: "breach_key", type: "STRING", mode: "NULLABLE" },
      { name: "classification", type: "STRING", mode: "NULLABLE" },
      { name: "status", type: "STRING", mode: "NULLABLE" },
      { name: "source_file", type: "STRING", mode: "NULLABLE" },
    ],
  };
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

async function ensureDataset({
  accessToken,
  projectId,
  dataset,
  location,
  allowCreate,
  setDatasetDefaults,
  defaultTableExpirationMs,
  defaultPartitionExpirationMs,
}) {
  const baseUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}`;
  const getResp = await fetchJson(baseUrl, { accessToken });

  if (getResp.status === 404) {
    if (!allowCreate) {
      return {
        status: "missing",
        warnings: [`Dataset ${projectId}.${dataset} not found (creation disabled).`],
      };
    }

    const createResp = await fetchJson(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`,
      {
        accessToken,
        method: "POST",
        body: {
          datasetReference: { projectId, datasetId: dataset },
          location: location || "US",
        },
      },
    );
    if (!createResp.ok) {
      return {
        status: "error",
        warnings: [
          `Create dataset failed: ${createResp.status} ${JSON.stringify(createResp.json)?.slice(0, 300)}`,
        ],
      };
    }
  }

  if (!setDatasetDefaults) {
    return { status: "ok", warnings: [] };
  }

  const patchBody = {};
  if (defaultTableExpirationMs) {
    patchBody.defaultTableExpirationMs = String(defaultTableExpirationMs);
  }
  if (defaultPartitionExpirationMs) {
    patchBody.defaultPartitionExpirationMs = String(defaultPartitionExpirationMs);
  }

  if (Object.keys(patchBody).length === 0) {
    return { status: "ok", warnings: [] };
  }

  const patchResp = await fetchJson(baseUrl, {
    accessToken,
    method: "PATCH",
    body: patchBody,
  });
  if (!patchResp.ok) {
    return {
      status: "error",
      warnings: [
        `Patch dataset defaults failed: ${patchResp.status} ${JSON.stringify(patchResp.json)?.slice(0, 300)}`,
      ],
    };
  }

  return { status: "ok", warnings: [] };
}

async function ensureTable({
  accessToken,
  projectId,
  dataset,
  table,
  schema,
  clusteringFields,
  partitionField,
  partitionExpirationMs,
  allowCreate,
  applyRetention,
}) {
  const tableUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables/${table}`;
  const getResp = await fetchJson(tableUrl, { accessToken });

  const result = {
    table,
    status: "unknown",
    created: false,
    partitioned: false,
    schema_added_fields: 0,
    warnings: [],
  };

  if (getResp.status === 404) {
    if (!allowCreate) {
      result.status = "missing";
      result.warnings.push(`Table ${projectId}.${dataset}.${table} not found (creation disabled).`);
      return result;
    }

    const createBody = {
      tableReference: { projectId, datasetId: dataset, tableId: table },
      schema,
      timePartitioning: {
        type: "DAY",
        field: partitionField,
        ...(applyRetention && partitionExpirationMs
          ? { expirationMs: String(partitionExpirationMs) }
          : {}),
      },
      clustering: { fields: clusteringFields },
    };

    const createResp = await fetchJson(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables`,
      { accessToken, method: "POST", body: createBody },
    );

    if (!createResp.ok) {
      result.status = "error";
      result.warnings.push(
        `Create table failed: ${createResp.status} ${JSON.stringify(createResp.json)?.slice(0, 300)}`,
      );
      return result;
    }

    result.status = "ok";
    result.created = true;
    result.partitioned = true;
    return result;
  }

  if (!getResp.ok) {
    result.status = "error";
    result.warnings.push(
      `Fetch table failed: ${getResp.status} ${JSON.stringify(getResp.json)?.slice(0, 300)}`,
    );
    return result;
  }

  // Existing table: add missing schema fields and apply retention if already partitioned.
  const tableObj = getResp.json || {};
  const existingFields = tableObj?.schema?.fields || [];
  const requiredFields = schema?.fields || [];
  const nextFields = unionSchema(existingFields, requiredFields);
  result.schema_added_fields = Math.max(nextFields.length - existingFields.length, 0);

  const existingPartitionField = tableObj?.timePartitioning?.field || "";
  const isPartitioned =
    Boolean(tableObj?.timePartitioning?.type) && String(existingPartitionField) === partitionField;
  result.partitioned = isPartitioned;

  const patchBody = {};
  if (result.schema_added_fields > 0) {
    patchBody.schema = { fields: nextFields };
  }

  if (Array.isArray(clusteringFields) && clusteringFields.length > 0) {
    patchBody.clustering = { fields: clusteringFields };
  }

  if (applyRetention && isPartitioned && partitionExpirationMs) {
    patchBody.timePartitioning = {
      ...tableObj.timePartitioning,
      expirationMs: String(partitionExpirationMs),
    };
  } else if (applyRetention && !isPartitioned) {
    if (!tableObj?.timePartitioning?.type) {
      result.warnings.push(
        `Table is not partitioned; cannot apply partition retention. (No timePartitioning on existing table)`,
      );
    } else if (existingPartitionField && existingPartitionField !== partitionField) {
      result.warnings.push(
        `Table partition field is '${existingPartitionField}', expected '${partitionField}'. Retention patch skipped.`,
      );
    }
  }

  if (Object.keys(patchBody).length === 0) {
    result.status = "ok";
    return result;
  }

  const patchResp = await fetchJson(tableUrl, {
    accessToken,
    method: "PATCH",
    body: patchBody,
    query: { fields: Object.keys(patchBody).join(",") },
  });

  if (!patchResp.ok) {
    result.status = "error";
    result.warnings.push(
      `Patch table failed: ${patchResp.status} ${JSON.stringify(patchResp.json)?.slice(0, 300)}`,
    );
    return result;
  }

  result.status = "ok";
  return result;
}

async function main() {
  const outputPath =
    process.env.BIGQUERY_PROVISION_OUTPUT_PATH || "reports/ci/bigquery-provision-log.json";
  const failOnError = toBool(process.env.BIGQUERY_PROVISION_FAIL_ON_ERROR, false);

  const projectId = process.env.BIGQUERY_PROJECT_ID || "";
  const dataset = process.env.BIGQUERY_DATASET || "";
  const serviceAccount = await loadServiceAccount();

  const configured = Boolean(projectId && dataset && serviceAccount?.client_email);
  const report = {
    generated_at: new Date().toISOString(),
    configured,
    project_id: projectId,
    dataset,
    status: "skip",
    dataset_result: null,
    tables: {},
    warnings: [],
    errors: [],
  };

  if (!configured) {
    report.warnings.push("BigQuery not configured (missing project/dataset/service account).");
  } else {
    const accessToken = await getGoogleAccessToken(serviceAccount);

    const allowCreateDataset = toBool(process.env.BIGQUERY_ALLOW_CREATE_DATASET, false);
    const allowCreateTables = toBool(process.env.BIGQUERY_ALLOW_CREATE_TABLES, true);
    const setDatasetDefaults = toBool(process.env.BIGQUERY_SET_DATASET_DEFAULTS, false);
    const applyRetention = toBool(process.env.BIGQUERY_APPLY_PARTITION_RETENTION, true);

    const retentionDays = toInt(process.env.BIGQUERY_OBS_PARTITION_RETENTION_DAYS, 365);
    const retentionMs = msFromDays(retentionDays);

    const defaultTableExpirationMs = msFromDays(
      toInt(process.env.BIGQUERY_DATASET_DEFAULT_TABLE_RETENTION_DAYS, 0),
    );
    const defaultPartitionExpirationMs = msFromDays(
      toInt(process.env.BIGQUERY_DATASET_DEFAULT_PARTITION_RETENTION_DAYS, 0),
    );

    const datasetLocation = process.env.BIGQUERY_DATASET_LOCATION || "US";
    const datasetResult = await ensureDataset({
      accessToken,
      projectId,
      dataset,
      location: datasetLocation,
      allowCreate: allowCreateDataset,
      setDatasetDefaults,
      defaultTableExpirationMs,
      defaultPartitionExpirationMs,
    });
    report.dataset_result = datasetResult;
    report.warnings.push(...(datasetResult.warnings || []));

    const tables = [
      {
        name: "release_health_events",
        schema: tableSchemaReleaseHealth(),
        clustering: ["workflow", "lane", "synthetic_api_classification", "overall_status"],
      },
      {
        name: "route_check_events",
        schema: tableSchemaRouteChecks(),
        clustering: ["lane", "endpoint_key", "breach_type", "status"],
      },
      {
        name: "quality_trend_events",
        schema: tableSchemaQualityTrends(),
        clustering: ["period", "lane", "metric", "status"],
      },
    ];

    for (const tbl of tables) {
      const tableRes = await ensureTable({
        accessToken,
        projectId,
        dataset,
        table: tbl.name,
        schema: tbl.schema,
        clusteringFields: tbl.clustering,
        partitionField: "observed_at",
        partitionExpirationMs: retentionMs,
        allowCreate: allowCreateTables,
        applyRetention,
      });
      report.tables[tbl.name] = tableRes;
      report.warnings.push(...(tableRes.warnings || []));
      if (tableRes.status === "error") {
        report.errors.push(`Table ${tbl.name}: provisioning error`);
      }
    }

    report.status = report.errors.length > 0 ? "partial" : "pass";
  }

  await mkdir(outputPath.includes("/") ? outputPath.slice(0, outputPath.lastIndexOf("/")) : ".", {
    recursive: true,
  });
  await writeFile(outputPath, JSON.stringify(report, null, 2));

  const lines = [
    "## BigQuery Observability Provisioning",
    `- Output log: \`${outputPath}\``,
    `- Configured: ${report.configured ? "yes" : "no"}`,
    report.configured
      ? `- Dataset: \`${projectId}.${dataset}\``
      : "- Dataset: n/a",
    report.configured
      ? `- Partition retention: ${toInt(process.env.BIGQUERY_OBS_PARTITION_RETENTION_DAYS, 365)} days (apply=${toBool(process.env.BIGQUERY_APPLY_PARTITION_RETENTION, true) ? "yes" : "no"})`
      : "",
    report.configured
      ? `- Dataset defaults: set=${toBool(process.env.BIGQUERY_SET_DATASET_DEFAULTS, false) ? "yes" : "no"}`
      : "",
    "",
    "| Table | Status | Created | Partitioned | Schema Added |",
    "|---|---|---:|---:|---:|",
    ...Object.entries(report.tables).map(([name, tbl]) => {
      return `| ${name} | ${tbl.status} | ${tbl.created ? "yes" : "no"} | ${tbl.partitioned ? "yes" : "no"} | ${tbl.schema_added_fields ?? 0} |`;
    }),
  ].filter(Boolean);

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("- Warnings:");
    lines.push(...report.warnings.slice(0, 10).map((w) => `  - ${w}`));
    if (report.warnings.length > 10) {
      lines.push(`  - (and ${report.warnings.length - 10} more)`);
    }
  }

  console.log(lines.join("\n"));
  await appendSummary(lines);

  if (failOnError && report.errors.length > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const lines = [
    "## BigQuery Observability Provisioning",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await appendSummary(lines);
  process.exit(1);
});

