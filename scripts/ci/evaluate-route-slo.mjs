#!/usr/bin/env node

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.max(0, Math.min(sorted.length - 1, rank));
  return Number(sorted[idx].toFixed(2));
}

function parsePathFromUrl(raw) {
  if (!raw) return "";
  try {
    return new URL(raw).pathname || "";
  } catch {
    const withoutHost = String(raw).replace(/^https?:\/\/[^/]+/i, "");
    return withoutHost.split("?")[0] || "";
  }
}

function stringifyStatuses(values) {
  if (!Array.isArray(values) || values.length === 0) return "n/a";
  return values.join(", ");
}

async function appendSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

async function setOutput(key, value) {
  if (!GITHUB_OUTPUT) return;
  await appendFile(GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function readJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

function getParentDir(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "." : path.slice(0, idx) || ".";
}

function normalizeChecks(routeChecks) {
  return (Array.isArray(routeChecks) ? routeChecks : []).map((check) => {
    const method = String(check?.method || "UNKNOWN").toUpperCase();
    const path = parsePathFromUrl(check?.url || "");
    const status = toNumber(check?.status);
    const latencyMs = toNumber(check?.latency_ms);
    const readOnly = check?.read_only === true || check?.read_only === "true";

    return {
      phase: check?.phase || "unknown",
      name: check?.name || "",
      method,
      path,
      url: check?.url || "",
      status,
      latency_ms: latencyMs,
      read_only: readOnly,
      required: check?.required !== false,
      ok: check?.ok !== false,
      error_category: check?.error_category || null,
      error_message: check?.error_message || "",
    };
  });
}

function selectAllowedStatuses(endpoint, readOnlyMode) {
  const source = readOnlyMode
    ? endpoint.allowed_statuses_read_only
    : endpoint.allowed_statuses_write_mode;
  return Array.isArray(source)
    ? source.map((value) => Number(value)).filter(Number.isFinite)
    : [];
}

async function main() {
  const reportPath =
    process.env.ROUTE_HEALTH_REPORT_PATH || "reports/ci/postdeploy-route-health.json";
  const configPath =
    process.env.ROUTE_SLO_CONFIG_PATH || "scripts/ci/route-slo-thresholds.json";
  const outputPath =
    process.env.ROUTE_SLO_OUTPUT_PATH || "reports/ci/route-slo-evaluation.json";
  const failOnRequired = String(process.env.ROUTE_SLO_FAIL_ON_REQUIRED ?? "1") === "1";
  const severityForOptional =
    process.env.ROUTE_SLO_OPTIONAL_SEVERITY || "optional";

  if (!existsSync(reportPath)) {
    throw new Error(`Route health report not found: ${reportPath}`);
  }
  if (!existsSync(configPath)) {
    throw new Error(`Route SLO config not found: ${configPath}`);
  }

  const report = await readJson(reportPath);
  const config = await readJson(configPath);
  const endpoints = Array.isArray(config?.endpoints) ? config.endpoints : [];
  if (endpoints.length === 0) {
    throw new Error(`No endpoints in route SLO config: ${configPath}`);
  }

  const routeChecks = normalizeChecks(report?.route_checks);
  const readOnlyMode = report?.read_only === true || report?.read_only === "true";
  const generatedAt = new Date().toISOString();
  const workflow = process.env.GITHUB_WORKFLOW || "unknown";
  const runId = process.env.GITHUB_RUN_ID || "";
  const runUrl =
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "";

  const endpointResults = [];
  const signals = [];

  for (const endpoint of endpoints) {
    const endpointKey = String(endpoint.endpoint_key || "").trim();
    const method = String(endpoint.method || "GET").toUpperCase();
    const path = String(endpoint.path || "").trim();
    const required = endpoint.required !== false;
    const severity = required ? "required" : severityForOptional;
    const allowedStatuses = selectAllowedStatuses(endpoint, readOnlyMode);
    const latencyLimit = toNumber(endpoint.max_latency_ms_p95);

    if (!endpointKey || !path) {
      throw new Error(
        `Invalid endpoint config entry. endpoint_key/path are required. Got: ${JSON.stringify(endpoint)}`,
      );
    }

    const matched = routeChecks.filter(
      (check) => check.method === method && check.path === path,
    );
    const latest = matched.length > 0 ? matched[matched.length - 1] : null;
    const statuses = matched
      .map((item) => item.status)
      .filter((value) => Number.isFinite(value));
    const latencies = matched
      .map((item) => item.latency_ms)
      .filter((value) => Number.isFinite(value) && value >= 0);

    const latencyP95 = percentile(latencies, 95);
    const missingBreach = matched.length === 0 && required;
    const statusBreach =
      matched.length > 0 &&
      latest?.status !== null &&
      allowedStatuses.length > 0 &&
      !allowedStatuses.includes(latest.status);
    const latencyBreach =
      latencyLimit !== null && latencyP95 !== null && latencyP95 > latencyLimit;

    const breachTypes = [];
    if (missingBreach) breachTypes.push("missing");
    if (statusBreach) breachTypes.push("status");
    if (latencyBreach) breachTypes.push("latency");

    const breached = breachTypes.length > 0;
    const endpointResult = {
      endpoint_key: endpointKey,
      method,
      path,
      required,
      severity,
      read_only_mode: readOnlyMode,
      checks_found: matched.length,
      observed_statuses: statuses,
      latest_status: latest?.status ?? null,
      observed_latency_samples: latencies,
      latency_ms_p95: latencyP95,
      max_latency_ms_p95: latencyLimit,
      allowed_statuses: allowedStatuses,
      missing_breach: missingBreach,
      status_breach: statusBreach,
      latency_breach: latencyBreach,
      breached,
      breach_types: breachTypes,
      latest_error_category: latest?.error_category ?? null,
      latest_error_message: latest?.error_message ?? "",
    };
    endpointResults.push(endpointResult);

    const signalTemplates = [
      {
        breach_type: "missing",
        breached: missingBreach,
      },
      {
        breach_type: "status",
        breached: statusBreach,
      },
      {
        breach_type: "latency",
        breached: latencyBreach,
      },
    ];

    for (const signal of signalTemplates) {
      if (signal.breach_type === "latency" && latencyLimit === null) continue;
      const breachKey = `route:${endpointKey}:${signal.breach_type}`;
      signals.push({
        observed_at: generatedAt,
        workflow,
        run_id: runId,
        run_url: runUrl,
        lane: "synthetic-postdeploy",
        endpoint_key: endpointKey,
        method,
        path,
        breach_type: signal.breach_type,
        breach_key: breachKey,
        breached: signal.breached,
        required,
        severity,
        latest_status: latest?.status ?? null,
        latency_ms_p95: latencyP95,
        latency_threshold_ms_p95: latencyLimit,
        allowed_statuses: allowedStatuses,
        checks_found: matched.length,
      });
    }
  }

  const requiredBreaches = endpointResults.filter(
    (item) => item.required && item.breached,
  );
  const optionalBreaches = endpointResults.filter(
    (item) => !item.required && item.breached,
  );

  const evaluation = {
    generated_at: generatedAt,
    workflow,
    run_id: runId,
    run_url: runUrl,
    source_report_path: reportPath,
    source_config_path: configPath,
    read_only_mode: readOnlyMode,
    fail_on_required: failOnRequired,
    totals: {
      endpoints: endpointResults.length,
      required_endpoints: endpointResults.filter((item) => item.required).length,
      optional_endpoints: endpointResults.filter((item) => !item.required).length,
      required_breaches: requiredBreaches.length,
      optional_breaches: optionalBreaches.length,
      breached_endpoints: endpointResults.filter((item) => item.breached).length,
    },
    endpoint_results: endpointResults,
    signals,
    breaches: signals.filter((item) => item.breached),
    status: requiredBreaches.length > 0 ? "fail" : "pass",
  };

  await mkdir(getParentDir(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(evaluation, null, 2));

  const lines = [
    "## Route-Level SLO Evaluation",
    `- Source report: \`${reportPath}\``,
    `- SLO config: \`${configPath}\``,
    `- Output: \`${outputPath}\``,
    `- Read-only mode: ${readOnlyMode ? "yes" : "no"}`,
    `- Required breaches: ${requiredBreaches.length}`,
    `- Optional breaches: ${optionalBreaches.length}`,
    "",
    "| Endpoint | Required | Latest Status | Allowed Statuses | p95 Latency | Limit | Breach |",
    "|---|---:|---:|---|---:|---:|---|",
    ...endpointResults.map((item) => {
      const breachText = item.breached
        ? `${item.breach_types.join(", ")}`
        : "none";
      return `| ${item.endpoint_key} | ${item.required ? "yes" : "no"} | ${item.latest_status ?? "n/a"} | ${stringifyStatuses(item.allowed_statuses)} | ${item.latency_ms_p95 ?? "n/a"} | ${item.max_latency_ms_p95 ?? "n/a"} | ${breachText} |`;
    }),
  ];
  await appendSummary(lines);
  console.log(lines.join("\n"));

  await setOutput("route_slo_required_breach_count", String(requiredBreaches.length));
  await setOutput("route_slo_optional_breach_count", String(optionalBreaches.length));
  await setOutput(
    "route_slo_status",
    requiredBreaches.length > 0 ? "fail" : "pass",
  );
  await setOutput(
    "route_slo_breach",
    requiredBreaches.length > 0 ? "true" : "false",
  );
  await setOutput("route_slo_output_path", outputPath);

  if (failOnRequired && requiredBreaches.length > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const lines = [
    "## Route-Level SLO Evaluation",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await appendSummary(lines);
  process.exit(1);
});
