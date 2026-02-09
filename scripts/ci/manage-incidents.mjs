#!/usr/bin/env node

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
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
}) {
  const queryParameters = Object.entries(params || {}).map(([name, rawValue]) => {
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

  const payload = await response.json();
  const fields = asArray(payload?.schema?.fields);
  const rows = asArray(payload?.rows).map((row) => {
    const result = {};
    asArray(row?.f).forEach((cell, idx) => {
      const field = fields[idx]?.name || `f_${idx}`;
      result[field] = cell?.v;
    });
    return result;
  });
  return rows;
}

function boolFromAny(value) {
  if (value === true || value === "true" || value === "TRUE" || value === "1") {
    return true;
  }
  return false;
}

function streak(series, target) {
  let count = 0;
  for (const value of series) {
    if (value === target) count += 1;
    else break;
  }
  return count;
}

function extractTrendSignals(path, payload) {
  if (!payload || typeof payload !== "object") return [];
  const period = path.includes("monthly")
    ? "monthly"
    : path.includes("weekly")
      ? "weekly"
      : "synthetic-7d";
  const lanes = payload.lanes || {};
  const thresholds = payload.thresholds || {};

  const strictValue = Number(lanes?.strict_map_required?.pass_rate);
  const strictThreshold = Number(thresholds?.strict_min_pass_rate);
  const syntheticValue = Number(lanes?.synthetic_overall?.pass_rate);
  const syntheticThreshold = Number(thresholds?.synthetic_overall_min_pass_rate);

  const signals = [];
  if (Number.isFinite(strictValue) && Number.isFinite(strictThreshold)) {
    signals.push({
      source: "trend",
      signal_table: "quality_trend_events",
      breach_key: `trend:${period}:strict_pass_rate`,
      breached: strictValue < strictThreshold,
      severity: "required",
      lane: "e2e-map-required",
      title: `${period} strict pass rate below threshold`,
      details: `strict=${strictValue.toFixed(1)} threshold=${strictThreshold.toFixed(1)}`,
    });
  }
  if (Number.isFinite(syntheticValue) && Number.isFinite(syntheticThreshold)) {
    signals.push({
      source: "trend",
      signal_table: "quality_trend_events",
      breach_key: `trend:${period}:synthetic_overall_pass_rate`,
      breached: syntheticValue < syntheticThreshold,
      severity: "required",
      lane: "synthetic-overall",
      title: `${period} synthetic overall pass rate below threshold`,
      details: `synthetic=${syntheticValue.toFixed(1)} threshold=${syntheticThreshold.toFixed(1)}`,
    });
  }
  return signals;
}

function extractRouteSignals(payload) {
  if (!payload || typeof payload !== "object") return [];
  return asArray(payload.signals)
    .filter((signal) => signal?.severity !== "optional")
    .map((signal) => ({
      source: "route",
      signal_table: "route_check_events",
      breach_key: signal.breach_key,
      breached: signal.breached === true,
      severity: signal.severity || "required",
      lane: signal.lane || "synthetic-postdeploy",
      title: `Route SLO breach ${signal.endpoint_key} (${signal.breach_type})`,
      details: `${signal.method || "UNKNOWN"} ${signal.path || ""} status=${signal.latest_status ?? "n/a"} latency_p95=${signal.latency_ms_p95 ?? "n/a"} threshold=${signal.latency_threshold_ms_p95 ?? "n/a"}`,
    }));
}

async function fetchOpenIssues({ token, repository }) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues?state=open&labels=incident:auto&per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Fetch open issues failed: ${response.status} ${text.slice(0, 300)}`);
  }
  return response.json();
}

function issueKeyFromBody(body) {
  const match = String(body || "").match(/<!--\s*incident-key:\s*(.+?)\s*-->/i);
  return match?.[1]?.trim() || "";
}

async function createIssue({ token, repository, title, body, labels, dryRun }) {
  if (dryRun) return { number: 0, html_url: "", dry_run: true };
  const response = await fetch(`https://api.github.com/repos/${repository}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Create issue failed: ${response.status} ${text.slice(0, 400)}`);
  }
  return response.json();
}

async function commentIssue({ token, repository, issueNumber, body, dryRun }) {
  if (dryRun) return;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Comment issue #${issueNumber} failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }
}

async function closeIssue({ token, repository, issueNumber, dryRun }) {
  if (dryRun) return;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state: "closed" }),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Close issue #${issueNumber} failed: ${response.status} ${text.slice(0, 300)}`);
  }
}

function getParentDir(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "." : path.slice(0, idx) || ".";
}

async function main() {
  const threshold = toInt(process.env.INCIDENT_CONSECUTIVE_THRESHOLD, 3);
  const recoveryThreshold = toInt(
    process.env.INCIDENT_RECOVERY_THRESHOLD,
    threshold,
  );
  const dryRun = toBool(process.env.INCIDENT_DRY_RUN, false);
  const outputPath =
    process.env.INCIDENT_OUTPUT_PATH || "reports/ci/incident-manager-log.json";
  const localStatePath =
    process.env.INCIDENT_LOCAL_STATE_PATH || "reports/ci/incident-local-state.json";

  const routeSloPath =
    process.env.INCIDENT_ROUTE_SLO_PATH || "reports/ci/route-slo-evaluation.json";
  const syntheticTrendPath =
    process.env.INCIDENT_SYNTHETIC_TREND_PATH || "reports/ci/synthetic-trend-7d.json";
  const weeklyTrendPath =
    process.env.INCIDENT_WEEKLY_TREND_PATH || "reports/ci/weekly-quality-trend.json";
  const monthlyTrendPath =
    process.env.INCIDENT_MONTHLY_TREND_PATH || "reports/ci/monthly-quality-trend.json";

  const routeSlo = await readJsonIfExists(routeSloPath);
  const syntheticTrend = await readJsonIfExists(syntheticTrendPath);
  const weeklyTrend = await readJsonIfExists(weeklyTrendPath);
  const monthlyTrend = await readJsonIfExists(monthlyTrendPath);

  const rawSignals = [
    ...extractRouteSignals(routeSlo),
    ...extractTrendSignals(syntheticTrendPath, syntheticTrend),
    ...extractTrendSignals(weeklyTrendPath, weeklyTrend),
    ...extractTrendSignals(monthlyTrendPath, monthlyTrend),
  ];

  const signalByKey = new Map();
  for (const signal of rawSignals) {
    if (!signal?.breach_key) continue;
    signalByKey.set(signal.breach_key, signal);
  }
  const signals = [...signalByKey.values()];

  const projectId = process.env.BIGQUERY_PROJECT_ID || "";
  const dataset = process.env.BIGQUERY_DATASET || "";
  const routeTable = process.env.INCIDENT_ROUTE_TABLE || "route_check_events";
  const qualityTable = process.env.INCIDENT_QUALITY_TABLE || "quality_trend_events";
  const serviceAccount = await loadServiceAccount();
  const bqConfigured = Boolean(projectId && dataset && serviceAccount?.client_email);

  let accessToken = "";
  if (bqConfigured) {
    accessToken = await getGoogleAccessToken(serviceAccount);
  }

  let localState = {};
  if (!bqConfigured) {
    localState = (await readJsonIfExists(localStatePath)) || {};
  }

  const token = process.env.GITHUB_TOKEN || "";
  const repository = process.env.GITHUB_REPOSITORY || "";
  const runUrl =
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "";

  const result = {
    generated_at: new Date().toISOString(),
    threshold,
    recovery_threshold: recoveryThreshold,
    dry_run: dryRun,
    bigquery_configured: bqConfigured,
    signals_evaluated: signals.length,
    opened: [],
    updated: [],
    closed: [],
    skipped: [],
    errors: [],
  };

  const canManageIssues = Boolean(token && repository);
  const openIssues = canManageIssues
    ? await fetchOpenIssues({ token, repository })
    : [];
  const openByKey = new Map();
  for (const issue of asArray(openIssues)) {
    const incidentKey = issueKeyFromBody(issue.body);
    if (incidentKey) {
      openByKey.set(incidentKey, issue);
    }
  }

  for (const signal of signals) {
    let history = [];
    try {
      if (bqConfigured) {
        const table = signal.signal_table === "route_check_events" ? routeTable : qualityTable;
        const rows = await runBigQueryQuery({
          accessToken,
          projectId,
          query: `
            SELECT breached
            FROM \`${projectId}.${dataset}.${table}\`
            WHERE breach_key = @breach_key
            ORDER BY observed_at DESC
            LIMIT @max_rows
          `,
          params: {
            breach_key: signal.breach_key,
            max_rows: Math.max(threshold, recoveryThreshold) + 5,
          },
        });
        history = rows.map((row) => boolFromAny(row.breached));
      } else {
        history = asArray(localState[signal.breach_key]).map((item) => item === true);
      }
    } catch (error) {
      result.errors.push(
        `history query failed for ${signal.breach_key}: ${error?.message || error}`,
      );
      continue;
    }

    if (history.length === 0 || history[0] !== signal.breached) {
      history = [signal.breached, ...history];
    }

    if (!bqConfigured) {
      localState[signal.breach_key] = history.slice(0, 20);
    }

    const breachStreak = streak(history, true);
    const recoveryStreak = streak(history, false);
    const existingIssue = openByKey.get(signal.breach_key);

    if (signal.breached && breachStreak >= threshold) {
      if (!canManageIssues) {
        result.skipped.push({
          breach_key: signal.breach_key,
          breached: signal.breached,
          breach_streak: breachStreak,
          reason: "github token/repository missing for incident actions",
        });
        continue;
      }

      const title = `[Incident][Auto] ${signal.breach_key}`;
      const labels = uniq([
        "incident:auto",
        "incident:synthetic",
        signal.source === "route" ? "incident:route-slo" : "incident:trend",
      ]);
      const issueBody = [
        `Auto-generated incident for consecutive breach signal \`${signal.breach_key}\`.`,
        "",
        `- Consecutive breach threshold: ${threshold}`,
        `- Current streak: ${breachStreak}`,
        `- Source: ${signal.source}`,
        `- Lane: ${signal.lane}`,
        `- Details: ${signal.details}`,
        `- Run: ${runUrl || "n/a"}`,
        "",
        `<!-- incident-key: ${signal.breach_key} -->`,
      ].join("\n");

      if (!existingIssue) {
        try {
          const created = await createIssue({
            token,
            repository,
            title,
            body: issueBody,
            labels,
            dryRun,
          });
          result.opened.push({
            breach_key: signal.breach_key,
            issue_number: created.number || 0,
            dry_run: dryRun,
          });
          if (!dryRun && created?.number) {
            openByKey.set(signal.breach_key, created);
          }
        } catch (error) {
          result.errors.push(
            `open issue failed for ${signal.breach_key}: ${error?.message || error}`,
          );
        }
      } else {
        const comment = [
          `Breach persists for \`${signal.breach_key}\`.`,
          `- Current streak: ${breachStreak}`,
          `- Lane: ${signal.lane}`,
          `- Details: ${signal.details}`,
          `- Run: ${runUrl || "n/a"}`,
        ].join("\n");
        try {
          await commentIssue({
            token,
            repository,
            issueNumber: existingIssue.number,
            body: comment,
            dryRun,
          });
          result.updated.push({
            breach_key: signal.breach_key,
            issue_number: existingIssue.number,
            dry_run: dryRun,
          });
        } catch (error) {
          result.errors.push(
            `update issue failed for ${signal.breach_key}: ${error?.message || error}`,
          );
        }
      }
      continue;
    }

    if (!signal.breached && existingIssue && recoveryStreak >= recoveryThreshold) {
      if (!canManageIssues) {
        result.skipped.push({
          breach_key: signal.breach_key,
          breached: signal.breached,
          recovery_streak: recoveryStreak,
          reason: "github token/repository missing for incident actions",
        });
        continue;
      }

      const comment = [
        `Recovery detected for \`${signal.breach_key}\`.`,
        `- Recovery threshold: ${recoveryThreshold}`,
        `- Current recovery streak: ${recoveryStreak}`,
        `- Run: ${runUrl || "n/a"}`,
      ].join("\n");
      try {
        await commentIssue({
          token,
          repository,
          issueNumber: existingIssue.number,
          body: comment,
          dryRun,
        });
        await closeIssue({
          token,
          repository,
          issueNumber: existingIssue.number,
          dryRun,
        });
        result.closed.push({
          breach_key: signal.breach_key,
          issue_number: existingIssue.number,
          dry_run: dryRun,
        });
      } catch (error) {
        result.errors.push(
          `close issue failed for ${signal.breach_key}: ${error?.message || error}`,
        );
      }
      continue;
    }

    result.skipped.push({
      breach_key: signal.breach_key,
      breached: signal.breached,
      breach_streak: breachStreak,
      recovery_streak: recoveryStreak,
      reason: signal.breached
        ? `breach streak ${breachStreak} < threshold ${threshold}`
        : "no open incident or recovery threshold not met",
    });
  }

  if (!bqConfigured) {
    await mkdir(getParentDir(localStatePath), { recursive: true });
    await writeFile(localStatePath, JSON.stringify(localState, null, 2));
  }

  await mkdir(getParentDir(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2));

  const lines = [
    "## Incident Automation",
    `- Signals evaluated: ${result.signals_evaluated}`,
    `- BigQuery source: ${bqConfigured ? "enabled" : "disabled (local fallback)"}`,
    `- GitHub issues integration: ${canManageIssues ? "enabled" : "disabled"}`,
    `- Dry run: ${dryRun ? "yes" : "no"}`,
    `- Opened: ${result.opened.length}`,
    `- Updated: ${result.updated.length}`,
    `- Closed: ${result.closed.length}`,
    `- Errors: ${result.errors.length}`,
    `- Log: \`${outputPath}\``,
  ];
  if (result.errors.length > 0) {
    lines.push("- Error details:");
    lines.push(...result.errors.map((err) => `  - ${err}`));
  }
  console.log(lines.join("\n"));
  await appendSummary(lines);

  if (result.errors.length > 0 && toBool(process.env.INCIDENT_FAIL_ON_ERROR, false)) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const lines = [
    "## Incident Automation",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await appendSummary(lines);
  process.exit(1);
});
