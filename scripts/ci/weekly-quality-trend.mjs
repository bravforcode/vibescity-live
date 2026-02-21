#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from "node:fs/promises";

const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const API = process.env.GITHUB_API_URL || "https://api.github.com";

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "1";
    result[key] = value;
  }
  return result;
}

async function writeSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

async function setOutput(key, value) {
  if (!GITHUB_OUTPUT) return;
  await appendFile(GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function gh(pathname, params = {}) {
  if (!TOKEN) {
    throw new Error("GITHUB_TOKEN is required");
  }
  if (!REPO) {
    throw new Error("GITHUB_REPOSITORY is required");
  }

  const url = new URL(`${API}${pathname}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub API ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

async function fetchWorkflowRuns(workflowFile, options = {}) {
  const runs = [];
  const maxPages = toInt(options.maxPages, 4);

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await gh(`/repos/${REPO}/actions/workflows/${workflowFile}/runs`, {
      per_page: 100,
      page,
      branch: options.branch,
      event: options.event,
      status: "completed",
    });

    const batch = data.workflow_runs || [];
    runs.push(...batch);

    if (batch.length < 100) break;
  }

  return runs;
}

async function fetchJobsForRun(runId) {
  const jobs = [];
  for (let page = 1; page <= 3; page += 1) {
    const data = await gh(`/repos/${REPO}/actions/runs/${runId}/jobs`, {
      per_page: 100,
      page,
    });
    const batch = data.jobs || [];
    jobs.push(...batch);
    if (batch.length < 100) break;
  }
  return jobs;
}

function initStats(label) {
  return {
    label,
    total: 0,
    success: 0,
    failure: 0,
    cancelled: 0,
    skipped: 0,
    timed_out: 0,
    neutral: 0,
    action_required: 0,
    unknown: 0,
  };
}

function applyConclusion(stats, conclusion) {
  const key = conclusion || "unknown";
  if (!(key in stats)) {
    stats.unknown += 1;
  } else {
    stats[key] += 1;
  }
  stats.total += 1;
}

function passRateValue(stats) {
  if (stats.total === 0) return null;
  return Number(((stats.success / stats.total) * 100).toFixed(1));
}

function passRateText(stats) {
  const rate = passRateValue(stats);
  return rate === null ? "n/a" : `${rate.toFixed(1)}%`;
}

function findJob(jobs, name) {
  return jobs.find((job) => job.name === name);
}

async function main() {
  const args = parseArgs(process.argv);
  const days = toInt(args.days || process.env.TREND_DAYS, 7);
  const strictMin = toFloat(args.strictMin || process.env.TREND_STRICT_MIN_PASS_RATE, 95);
  const syntheticOverallMin = toFloat(
    args.syntheticMin || process.env.TREND_SYNTHETIC_OVERALL_MIN_PASS_RATE,
    95,
  );
  const title =
    args.title || process.env.TREND_TITLE || "Weekly Quality Trend Summary";
  const outputPath =
    args.output || process.env.TREND_OUTPUT_PATH || "reports/ci/weekly-quality-trend.json";
  const failOnBreach = String(process.env.TREND_ALERT_FAIL_ON_BREACH || "0") === "1";

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const ciRunsRaw = await fetchWorkflowRuns("ci.yml", {
    branch: "main",
    event: "push",
  });
  const syntheticRunsRaw = await fetchWorkflowRuns("synthetic-postdeploy-monitor.yml", {
    maxPages: 6,
  });

  const ciRuns = ciRunsRaw.filter((run) => new Date(run.created_at) >= since);
  const syntheticRuns = syntheticRunsRaw.filter((run) => new Date(run.created_at) >= since);

  const strictStats = initStats("Strict @map-required");
  const quarantineStats = initStats("Quarantine @map-quarantine");
  const syntheticApiStats = initStats("Synthetic API");
  const syntheticBrowserStats = initStats("Synthetic Browser");
  const syntheticOverallStats = initStats("Synthetic Overall");

  for (const run of ciRuns) {
    const jobs = await fetchJobsForRun(run.id);

    const strictJob = findJob(jobs, "e2e-map-required");
    if (strictJob) applyConclusion(strictStats, strictJob.conclusion);

    const quarantineJob = findJob(jobs, "e2e-map-quarantine");
    if (quarantineJob) applyConclusion(quarantineStats, quarantineJob.conclusion);
  }

  for (const run of syntheticRuns) {
    const jobs = await fetchJobsForRun(run.id);

    const apiJob = findJob(jobs, "synthetic-postdeploy");
    const browserJob = findJob(jobs, "browser-smoke-map-lite");

    if (apiJob) applyConclusion(syntheticApiStats, apiJob.conclusion);
    if (browserJob) applyConclusion(syntheticBrowserStats, browserJob.conclusion);

    if (apiJob || browserJob) {
      const apiOk = apiJob?.conclusion === "success";
      const browserOk = browserJob?.conclusion === "success";
      if (apiJob && browserJob) {
        applyConclusion(syntheticOverallStats, apiOk && browserOk ? "success" : "failure");
      } else {
        applyConclusion(syntheticOverallStats, apiOk || browserOk ? "success" : "failure");
      }
    }
  }

  const strictRate = passRateValue(strictStats);
  const quarantineRate = passRateValue(quarantineStats);
  const syntheticOverallRate = passRateValue(syntheticOverallStats);

  const breaches = [];
  if (strictRate !== null && strictRate < strictMin) {
    breaches.push(`strict pass rate ${strictRate.toFixed(1)}% < ${strictMin.toFixed(1)}%`);
  }
  if (syntheticOverallRate !== null && syntheticOverallRate < syntheticOverallMin) {
    breaches.push(
      `synthetic overall pass rate ${syntheticOverallRate.toFixed(1)}% < ${syntheticOverallMin.toFixed(1)}%`,
    );
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    window_days: days,
    ci_runs_analyzed: ciRuns.length,
    synthetic_runs_analyzed: syntheticRuns.length,
    thresholds: {
      strict_min_pass_rate: strictMin,
      synthetic_overall_min_pass_rate: syntheticOverallMin,
    },
    breaches,
    lanes: {
      strict_map_required: { ...strictStats, pass_rate: strictRate },
      map_quarantine: { ...quarantineStats, pass_rate: quarantineRate },
      synthetic_api: { ...syntheticApiStats, pass_rate: passRateValue(syntheticApiStats) },
      synthetic_browser: { ...syntheticBrowserStats, pass_rate: passRateValue(syntheticBrowserStats) },
      synthetic_overall: { ...syntheticOverallStats, pass_rate: syntheticOverallRate },
    },
  };

  const outputDir = outputPath.includes("/")
    ? outputPath.slice(0, outputPath.lastIndexOf("/"))
    : ".";
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2));

  const lines = [
    `## ${title}`,
    `- Window: last ${days} days`,
    `- Generated: ${snapshot.generated_at}`,
    `- CI runs analyzed: ${ciRuns.length}`,
    `- Synthetic runs analyzed: ${syntheticRuns.length}`,
    "",
    "| Lane | Pass Rate | Success | Failure | Cancelled | Skipped | Total |",
    "|---|---:|---:|---:|---:|---:|---:|",
    `| ${strictStats.label} | ${passRateText(strictStats)} | ${strictStats.success} | ${strictStats.failure} | ${strictStats.cancelled} | ${strictStats.skipped} | ${strictStats.total} |`,
    `| ${quarantineStats.label} | ${passRateText(quarantineStats)} | ${quarantineStats.success} | ${quarantineStats.failure} | ${quarantineStats.cancelled} | ${quarantineStats.skipped} | ${quarantineStats.total} |`,
    `| ${syntheticApiStats.label} | ${passRateText(syntheticApiStats)} | ${syntheticApiStats.success} | ${syntheticApiStats.failure} | ${syntheticApiStats.cancelled} | ${syntheticApiStats.skipped} | ${syntheticApiStats.total} |`,
    `| ${syntheticBrowserStats.label} | ${passRateText(syntheticBrowserStats)} | ${syntheticBrowserStats.success} | ${syntheticBrowserStats.failure} | ${syntheticBrowserStats.cancelled} | ${syntheticBrowserStats.skipped} | ${syntheticBrowserStats.total} |`,
    `| ${syntheticOverallStats.label} | ${passRateText(syntheticOverallStats)} | ${syntheticOverallStats.success} | ${syntheticOverallStats.failure} | ${syntheticOverallStats.cancelled} | ${syntheticOverallStats.skipped} | ${syntheticOverallStats.total} |`,
    "",
    "### Threshold Alerts",
    `- Strict minimum pass rate: ${strictMin.toFixed(1)}%`,
    `- Synthetic overall minimum pass rate: ${syntheticOverallMin.toFixed(1)}%`,
    `- Breach count: ${breaches.length}`,
    ...(breaches.length > 0 ? breaches.map((item) => `- ALERT: ${item}`) : ["- ALERT: none"]),
    "",
    `- Snapshot JSON: ${outputPath}`,
  ];

  console.log(lines.join("\n"));
  await writeSummary(lines);

  await setOutput("strict_pass_rate", strictRate === null ? "na" : strictRate.toFixed(1));
  await setOutput("quarantine_pass_rate", quarantineRate === null ? "na" : quarantineRate.toFixed(1));
  await setOutput(
    "synthetic_overall_pass_rate",
    syntheticOverallRate === null ? "na" : syntheticOverallRate.toFixed(1),
  );
  await setOutput("breach_count", String(breaches.length));
  await setOutput("breach", breaches.length > 0 ? "true" : "false");
  await setOutput("breach_message", breaches.join("; "));
  await setOutput("snapshot_path", outputPath);

  if (failOnBreach && breaches.length > 0) {
    process.exit(2);
  }
}

main().catch(async (error) => {
  const fallbackTitle = process.env.TREND_TITLE || "Weekly Quality Trend Summary";
  const lines = [
    `## ${fallbackTitle}`,
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await writeSummary(lines);
  process.exit(1);
});
