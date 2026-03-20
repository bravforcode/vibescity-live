#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  appendStepSummary,
  asArray,
  listAgentReports,
  loadAutonomyConfig,
  setGithubOutputs,
  writeAgentReport,
} from "./lib/runtime.mjs";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--workflow":
        args.workflow = argv[index + 1];
        index += 1;
        break;
      case "--lookback-days":
        args.lookbackDays = Number(argv[index + 1]);
        index += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

function isPrimaryReport(report) {
  return !report.parent_event_id && !String(report.event_id || "").endsWith("-approval");
}

function shouldResolveReport(report, workflowName, lookbackDays) {
  if (!isPrimaryReport(report)) return false;
  if (String(report.status || "").toLowerCase() === "resolved") return false;
  if (String(report.workflow_name || "") !== String(workflowName || "")) return false;

  const updatedAt = Date.parse(String(report.updated_at || report.created_at || ""));
  if (!Number.isFinite(updatedAt)) return false;

  const ageMs = Date.now() - updatedAt;
  return ageMs <= lookbackDays * 24 * 60 * 60 * 1000;
}

export async function resolveRecoveryReports({
  root = process.cwd(),
  workflowName,
  lookbackDays,
}) {
  const config = await loadAutonomyConfig(root);
  const effectiveLookbackDays = Number.isFinite(lookbackDays)
    ? lookbackDays
    : Number(config.automation?.auto_recovery?.lookback_days || 14);

  const reports = await listAgentReports(root);
  const resolved = [];

  for (const report of reports) {
    if (!shouldResolveReport(report, workflowName, effectiveLookbackDays)) {
      continue;
    }

    const nextAutoAction = asArray([report.auto_action_taken, `auto-resolved:${workflowName}`])
      .filter(Boolean)
      .join(" | ");

    const updatedReport = {
      ...report,
      status: "resolved",
      updated_at: new Date().toISOString(),
      auto_action_taken: nextAutoAction,
      recovery: {
        workflow_name: workflowName,
        resolved_at: new Date().toISOString(),
      },
    };

    const filePaths = await writeAgentReport(root, updatedReport);
    resolved.push({
      event_id: updatedReport.event_id,
      report_path: filePaths.jsonRelative,
      markdown_path: filePaths.markdownRelative,
      classification: updatedReport.classification,
    });
  }

  return {
    workflowName,
    lookbackDays: effectiveLookbackDays,
    resolved,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workflow) {
    throw new Error("Missing --workflow <workflow-name>");
  }

  const result = await resolveRecoveryReports({
    root: process.cwd(),
    workflowName: args.workflow,
    lookbackDays: args.lookbackDays,
  });

  const lines = [
    "## Ops Recovery Resolver",
    `- Workflow: \`${result.workflowName}\``,
    `- Lookback days: ${result.lookbackDays}`,
    `- Resolved reports: ${result.resolved.length}`,
    ...result.resolved.map(
      (entry) => `- ${entry.classification} :: \`${entry.report_path}\``,
    ),
  ];

  console.log(lines.join("\n"));
  await appendStepSummary(lines);
  await setGithubOutputs({
    resolved_count: result.resolved.length,
    resolved_report_paths: result.resolved.map((entry) => entry.report_path).join(","),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Recovery resolution failed: ${error?.message || error}`);
    process.exit(1);
  });
}
