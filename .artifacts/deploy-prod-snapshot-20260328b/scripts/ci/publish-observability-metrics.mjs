#!/usr/bin/env node

import { createSign } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function labelValue(value, fallback = "unknown") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/[^a-zA-Z0-9_:.-]/g, "_");
  return normalized.slice(0, 100) || fallback;
}

function normalizeLokiUrl(raw) {
  if (!raw) return "";
  const url = String(raw).replace(/\/+$/, "");
  if (url.endsWith("/loki/api/v1/push")) return url;
  return `${url}/loki/api/v1/push`;
}

function toNsTimestamp(value) {
  const ts = Number.isFinite(Date.parse(value || "")) ? Date.parse(value) : Date.now();
  return `${Math.trunc(ts)}000000`;
}

function getParentDir(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "." : path.slice(0, idx) || ".";
}

async function appendSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

async function setOutput(key, value) {
  if (!GITHUB_OUTPUT) return;
  await appendFile(GITHUB_OUTPUT, `${key}=${value}\n`);
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

  if (rawJson) {
    return JSON.parse(rawJson);
  }

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

function buildReleaseEvents(snapshot, ctx) {
  if (!snapshot || typeof snapshot !== "object") return [];
  return [
    {
      observed_at: snapshot.generated_at || ctx.generatedAt,
      workflow: ctx.workflow,
      lane: ctx.lane,
      repository: ctx.repository,
      run_id: ctx.runId,
      run_url: ctx.runUrl,
      synthetic_api_result: snapshot?.synthetic?.api?.result || "unknown",
      synthetic_api_classification:
        snapshot?.synthetic?.api?.classification || "unknown",
      synthetic_browser_result: snapshot?.synthetic?.browser?.result || "unknown",
      overall_status: snapshot?.synthetic?.overall || "unknown",
      classification: "release_health",
      source_file: ctx.paths.releaseSnapshot,
    },
  ];
}

function buildRouteRows(routeSloEvaluation, ctx) {
  if (!routeSloEvaluation || typeof routeSloEvaluation !== "object") return [];
  return asArray(routeSloEvaluation.signals).map((signal) => ({
    observed_at: signal.observed_at || routeSloEvaluation.generated_at || ctx.generatedAt,
    workflow: signal.workflow || ctx.workflow,
    lane: signal.lane || ctx.lane,
    repository: ctx.repository,
    run_id: signal.run_id || ctx.runId,
    run_url: signal.run_url || ctx.runUrl,
    endpoint_key: signal.endpoint_key || "unknown",
    method: signal.method || "UNKNOWN",
    path: signal.path || "",
    breach_type: signal.breach_type || "unknown",
    breach_key: signal.breach_key || "",
    breached: signal.breached === true,
    required: signal.required !== false,
    severity: signal.severity || "required",
    latest_status: signal.latest_status ?? null,
    latency_ms_p95: signal.latency_ms_p95 ?? null,
    latency_threshold_ms_p95: signal.latency_threshold_ms_p95 ?? null,
    checks_found: signal.checks_found ?? null,
    classification: "route_slo",
    status: signal.breached === true ? "breach" : "ok",
    source_file: ctx.paths.routeSloEvaluation,
  }));
}

function resolveTrendPeriod(path, payload) {
  if (path.includes("monthly")) return "monthly";
  if (path.includes("weekly")) return "weekly";
  if (path.includes("synthetic-trend-7d")) return "synthetic-7d";
  if (Number(payload?.window_days) === 30) return "monthly";
  if (Number(payload?.window_days) === 7) return "weekly";
  return "trend";
}

function buildTrendRows(path, payload, ctx) {
  if (!payload || typeof payload !== "object") return [];
  const period = resolveTrendPeriod(path, payload);
  const observedAt = payload.generated_at || ctx.generatedAt;
  const lanes = payload.lanes || {};
  const thresholds = payload.thresholds || {};

  const definitions = [
    {
      metric: "strict_pass_rate",
      value: lanes?.strict_map_required?.pass_rate,
      threshold: thresholds?.strict_min_pass_rate,
      breachKey: `trend:${period}:strict_pass_rate`,
      lane: "e2e-map-required",
    },
    {
      metric: "synthetic_overall_pass_rate",
      value: lanes?.synthetic_overall?.pass_rate,
      threshold: thresholds?.synthetic_overall_min_pass_rate,
      breachKey: `trend:${period}:synthetic_overall_pass_rate`,
      lane: "synthetic-overall",
    },
    {
      metric: "quarantine_pass_rate",
      value: lanes?.map_quarantine?.pass_rate,
      threshold: null,
      breachKey: `trend:${period}:quarantine_pass_rate`,
      lane: "e2e-map-quarantine",
    },
  ];

  return definitions.map((item) => {
    const value = Number.isFinite(Number(item.value)) ? Number(item.value) : null;
    const threshold = Number.isFinite(Number(item.threshold))
      ? Number(item.threshold)
      : null;
    const breached = value !== null && threshold !== null ? value < threshold : false;
    return {
      observed_at: observedAt,
      workflow: ctx.workflow,
      lane: item.lane,
      repository: ctx.repository,
      run_id: ctx.runId,
      run_url: ctx.runUrl,
      period,
      metric: item.metric,
      metric_value: value,
      threshold_value: threshold,
      breached,
      breach_key: item.breachKey,
      classification: "quality_trend",
      status: breached ? "breach" : "ok",
      source_file: path,
    };
  });
}

function buildLighthouseRows(summary, ctx) {
  if (!summary || typeof summary !== "object") return [];
  const outcome = String(summary.result || summary.outcome || "unknown").toLowerCase();
  const breached = !["success", "passed", "ok"].includes(outcome);
  return [
    {
      observed_at: summary.generated_at || ctx.generatedAt,
      workflow: ctx.workflow,
      lane: "weekly-lighthouse",
      repository: ctx.repository,
      run_id: ctx.runId,
      run_url: ctx.runUrl,
      period: "weekly",
      metric: "lighthouse_outcome",
      metric_value: outcome,
      threshold_value: "non-blocking",
      breached,
      breach_key: "lighthouse:weekly:outcome",
      classification: "lighthouse",
      status: breached ? "breach" : "ok",
      source_file: ctx.paths.weeklyLighthouseSummary,
    },
  ];
}

function rowsToLokiLogs(rows) {
  return rows.map((row) => ({
    ts: toNsTimestamp(row.observed_at),
    labels: {
      service: "vibecity-ci",
      workflow: labelValue(row.workflow),
      lane: labelValue(row.lane),
      classification: labelValue(row.classification || "metric"),
      status: labelValue(row.status || (row.breached ? "breach" : "ok")),
    },
    line: JSON.stringify(row),
  }));
}

function groupLokiStreams(logs) {
  const map = new Map();
  for (const entry of logs) {
    const key = JSON.stringify(entry.labels);
    if (!map.has(key)) {
      map.set(key, { stream: entry.labels, values: [] });
    }
    map.get(key).values.push([entry.ts, entry.line]);
  }
  return [...map.values()];
}

async function pushToLoki(url, logs) {
  if (!logs.length) return { pushed: 0 };
  const streams = groupLokiStreams(logs);

  const headers = { "Content-Type": "application/json" };
  const user = process.env.GRAFANA_LOKI_USER || "";
  const token = process.env.GRAFANA_LOKI_TOKEN || "";

  if (user && token) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
  } else if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ streams }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Loki push failed: ${response.status} ${response.statusText} ${text.slice(0, 300)}`,
    );
  }

  return { pushed: logs.length, streams: streams.length };
}

async function main() {
  const failOnError = toBool(process.env.OBS_METRICS_FAIL_ON_ERROR, false);
  const outputPath =
    process.env.OBS_METRICS_OUTPUT_PATH || "reports/ci/metrics-export-log.json";

  const ctx = {
    generatedAt: new Date().toISOString(),
    workflow: process.env.GITHUB_WORKFLOW || process.env.OBS_WORKFLOW || "unknown",
    lane: process.env.OBS_LANE || process.env.GITHUB_JOB || "unknown",
    repository: process.env.GITHUB_REPOSITORY || "unknown",
    runId: process.env.GITHUB_RUN_ID || "",
    runUrl:
      process.env.GITHUB_SERVER_URL &&
      process.env.GITHUB_REPOSITORY &&
      process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : "",
    paths: {
      routeReport:
        process.env.OBS_ROUTE_REPORT_PATH || "reports/ci/postdeploy-route-health.json",
      routeSloEvaluation:
        process.env.OBS_ROUTE_SLO_PATH || "reports/ci/route-slo-evaluation.json",
      releaseSnapshot:
        process.env.OBS_RELEASE_SNAPSHOT_PATH || "reports/ci/release-health-snapshot.json",
      syntheticTrend:
        process.env.OBS_SYNTHETIC_TREND_PATH || "reports/ci/synthetic-trend-7d.json",
      weeklyTrend:
        process.env.OBS_WEEKLY_TREND_PATH || "reports/ci/weekly-quality-trend.json",
      monthlyTrend:
        process.env.OBS_MONTHLY_TREND_PATH || "reports/ci/monthly-quality-trend.json",
      weeklyLighthouseSummary:
        process.env.OBS_LIGHTHOUSE_SUMMARY_PATH ||
        "reports/ci/weekly-lighthouse-summary.json",
    },
  };

  const releaseSnapshot = await readJsonIfExists(ctx.paths.releaseSnapshot);
  const routeSloEvaluation = await readJsonIfExists(ctx.paths.routeSloEvaluation);
  const syntheticTrend = await readJsonIfExists(ctx.paths.syntheticTrend);
  const weeklyTrend = await readJsonIfExists(ctx.paths.weeklyTrend);
  const monthlyTrend = await readJsonIfExists(ctx.paths.monthlyTrend);
  const weeklyLighthouseSummary = await readJsonIfExists(
    ctx.paths.weeklyLighthouseSummary,
  );

  const releaseEvents = buildReleaseEvents(releaseSnapshot, ctx);
  const routeEvents = buildRouteRows(routeSloEvaluation, ctx);
  const qualityEvents = [
    ...buildTrendRows(ctx.paths.syntheticTrend, syntheticTrend, ctx),
    ...buildTrendRows(ctx.paths.weeklyTrend, weeklyTrend, ctx),
    ...buildTrendRows(ctx.paths.monthlyTrend, monthlyTrend, ctx),
    ...buildLighthouseRows(weeklyLighthouseSummary, ctx),
  ];

  const allRowsForLoki = [...releaseEvents, ...routeEvents, ...qualityEvents];

  const report = {
    generated_at: ctx.generatedAt,
    workflow: ctx.workflow,
    lane: ctx.lane,
    repository: ctx.repository,
    run_id: ctx.runId,
    counts: {
      release_health_events: releaseEvents.length,
      route_check_events: routeEvents.length,
      quality_trend_events: qualityEvents.length,
      total_logs: allRowsForLoki.length,
    },
    sinks: {
      bigquery: {
        configured: false,
        status: "skip",
        errors: [],
        tables: {},
      },
      loki: {
        configured: false,
        status: "skip",
        errors: [],
        pushed: 0,
        streams: 0,
      },
    },
    source_paths: ctx.paths,
  };

  const projectId = process.env.BIGQUERY_PROJECT_ID || "";
  const dataset = process.env.BIGQUERY_DATASET || "";
  const serviceAccount = await loadServiceAccount();
  const bqConfigured = Boolean(projectId && dataset && serviceAccount?.client_email);

  if (bqConfigured) {
    report.sinks.bigquery.configured = true;
    try {
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const tableMap = {
        release_health_events: releaseEvents,
        route_check_events: routeEvents,
        quality_trend_events: qualityEvents,
      };
      for (const [table, rows] of Object.entries(tableMap)) {
        const result = await insertRowsIntoBigQuery({
          accessToken,
          projectId,
          dataset,
          table,
          rows,
        });
        report.sinks.bigquery.tables[table] = {
          attempted: rows.length,
          inserted: result.inserted,
          errors: result.errors,
        };
        report.sinks.bigquery.errors.push(...result.errors);
      }
      report.sinks.bigquery.status =
        report.sinks.bigquery.errors.length > 0 ? "partial" : "pass";
    } catch (error) {
      report.sinks.bigquery.status = "fail";
      report.sinks.bigquery.errors.push(error?.message || String(error));
    }
  }

  const lokiUrl = normalizeLokiUrl(process.env.GRAFANA_LOKI_URL || "");
  const lokiConfigured = Boolean(lokiUrl);
  if (lokiConfigured) {
    report.sinks.loki.configured = true;
    try {
      const logs = rowsToLokiLogs(allRowsForLoki);
      const result = await pushToLoki(lokiUrl, logs);
      report.sinks.loki.status = "pass";
      report.sinks.loki.pushed = result.pushed;
      report.sinks.loki.streams = result.streams || 0;
    } catch (error) {
      report.sinks.loki.status = "fail";
      report.sinks.loki.errors.push(error?.message || String(error));
    }
  }

  await mkdir(getParentDir(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));

  const lines = [
    "## Observability Metrics Publish",
    `- Output log: \`${outputPath}\``,
    `- Release events: ${releaseEvents.length}`,
    `- Route events: ${routeEvents.length}`,
    `- Quality events: ${qualityEvents.length}`,
    "",
    `- BigQuery: ${report.sinks.bigquery.status.toUpperCase()} (configured=${report.sinks.bigquery.configured ? "yes" : "no"})`,
    `- Loki: ${report.sinks.loki.status.toUpperCase()} (configured=${report.sinks.loki.configured ? "yes" : "no"})`,
  ];
  if (report.sinks.bigquery.errors.length > 0) {
    lines.push("- BigQuery errors:");
    lines.push(...report.sinks.bigquery.errors.map((err) => `  - ${err}`));
  }
  if (report.sinks.loki.errors.length > 0) {
    lines.push("- Loki errors:");
    lines.push(...report.sinks.loki.errors.map((err) => `  - ${err}`));
  }
  console.log(lines.join("\n"));
  await appendSummary(lines);

  await setOutput("observability_metrics_log_path", outputPath);
  await setOutput("bigquery_status", report.sinks.bigquery.status);
  await setOutput("loki_status", report.sinks.loki.status);

  const hasBlockingFailure =
    (report.sinks.bigquery.configured && report.sinks.bigquery.status === "fail") ||
    (report.sinks.loki.configured && report.sinks.loki.status === "fail");
  if (failOnError && hasBlockingFailure) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const lines = [
    "## Observability Metrics Publish",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await appendSummary(lines);
  process.exit(1);
});
