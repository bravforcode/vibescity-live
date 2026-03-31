#!/usr/bin/env node

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

async function writeSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function normalize(result) {
  return result || "unknown";
}

function isSuccess(result) {
  return normalize(result) === "success";
}

async function loadRouteReport(path) {
  if (!path || !existsSync(path)) {
    return null;
  }
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return parsed;
}

async function main() {
  const apiResult = normalize(process.env.SYNTHETIC_API_RESULT);
  const browserResult = normalize(process.env.SYNTHETIC_BROWSER_RESULT);
  const apiClassification = process.env.SYNTHETIC_API_CLASSIFICATION || "unknown";
  const routeReportPath =
    process.env.SYNTHETIC_API_ROUTE_REPORT_PATH ||
    "reports/ci/postdeploy-route-health.json";
  const routeReport = await loadRouteReport(routeReportPath);
  const routeChecks = Array.isArray(routeReport?.route_checks)
    ? routeReport.route_checks
    : [];
  const routeFailures = routeChecks.filter((item) => item?.ok === false);

  const overall = isSuccess(apiResult) && isSuccess(browserResult) ? "green" : "red";

  const snapshot = {
    generated_at: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY || "unknown",
    run_id: process.env.GITHUB_RUN_ID || "unknown",
    run_url:
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : "",
    synthetic: {
      api: {
        result: apiResult,
        classification: apiClassification,
        route_report: routeReport
          ? {
              path: routeReportPath,
              status: routeReport.status || "unknown",
              total_checks: routeChecks.length,
              failed_checks: routeFailures.length,
            }
          : null,
      },
      browser: {
        result: browserResult,
      },
      overall,
    },
  };

  await mkdir("reports/ci", { recursive: true });
  await writeFile("reports/ci/release-health-snapshot.json", JSON.stringify(snapshot, null, 2));

  const lines = [
    "## Release Health Snapshot",
    `- Generated: ${snapshot.generated_at}`,
    `- API synthetic: ${apiResult}`,
    `- API classification: ${apiClassification}`,
    `- API route checks: ${routeChecks.length}`,
    `- API route failures: ${routeFailures.length}`,
    `- Browser synthetic: ${browserResult}`,
    `- Overall: ${overall}`,
    "- Snapshot JSON: reports/ci/release-health-snapshot.json",
  ];

  console.log(lines.join("\n"));
  await writeSummary(lines);
}

main().catch(async (error) => {
  const lines = [
    "## Release Health Snapshot",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await writeSummary(lines);
  process.exit(1);
});
