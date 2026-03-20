#!/usr/bin/env node

import path from "node:path";
import {
  appendStepSummary,
  asArray,
  createStableEventId,
  hashValue,
  listAgentReports,
  loadAutonomyConfig,
  loadSignalInputs,
  maxRiskLevel,
  normalizeRiskLevel,
  readJsonIfExists,
  setGithubOutputs,
  summarizeReports,
  writeAgentReport,
} from "./lib/runtime.mjs";
import { classifySignalContext } from "./lib/classification.mjs";
import { maybeGenerateAnthropicAdvice } from "./lib/anthropic.mjs";

function parseArgs(argv) {
  const args = {
    inputs: [],
    force: false,
    noAi: false,
    status: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--input":
        args.inputs.push(argv[index + 1]);
        index += 1;
        break;
      case "--trigger":
        args.trigger = argv[index + 1];
        index += 1;
        break;
      case "--workflow":
        args.workflow = argv[index + 1];
        index += 1;
        break;
      case "--source":
        args.source = argv[index + 1];
        index += 1;
        break;
      case "--conclusion":
        args.conclusion = argv[index + 1];
        index += 1;
        break;
      case "--status":
        args.status = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--no-ai":
        args.noAi = true;
        break;
      default:
        break;
    }
  }

  return args;
}

function renderStatusBoard(reports) {
  const counts = summarizeReports(reports);
  const lines = [
    "## Ops Agent Status",
    `- Total reports: ${counts.total}`,
    `- Low: ${counts.low}`,
    `- Medium: ${counts.medium}`,
    `- High: ${counts.high}`,
    `- Critical: ${counts.critical}`,
    `- Approval required: ${counts.approval_required}`,
    "",
  ];

  for (const report of reports.slice(0, 10)) {
    lines.push(
      `- [${report.risk_level}] ${report.classification} :: ${report.event_id} :: ${report.status}`,
    );
  }

  return lines.join("\n");
}

function isAutoRemediationEligible(report, config) {
  const automation = config.automation?.auto_remediation;
  if (!automation?.enabled) return false;
  if (!automation.execute_safe_profiles) return false;
  if (report.approval_required) return false;
  if (!report.safe_remediation_profile) return false;
  if (
    automation.skip_if_deduped &&
    report.deduped
  ) {
    return false;
  }
  const eligibleStatuses = asArray(automation.eligible_statuses);
  if (eligibleStatuses.length > 0 && !eligibleStatuses.includes(report.status)) {
    return false;
  }
  const allowedProfiles = asArray(automation.profiles);
  if (allowedProfiles.length > 0 && !allowedProfiles.includes(report.safe_remediation_profile)) {
    return false;
  }
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const config = await loadAutonomyConfig(root);

  if (args.status) {
    const reports = await listAgentReports(root);
    const board = renderStatusBoard(reports);
    console.log(board);
    await appendStepSummary(board.split("\n"));
    return;
  }

  const defaultInputs = asArray(config.trigger_matrix?.[args.trigger]?.default_inputs);
  const inputCandidates = [...defaultInputs, ...args.inputs];
  const inputRecords = await loadSignalInputs(root, inputCandidates);
  const inputFiles = inputRecords.map((record) => record.relativePath);

  const context = {
    triggerKey: args.trigger,
    workflowName: args.workflow || "",
    source: args.source || args.trigger || args.workflow || "manual",
    conclusion: args.conclusion || "failure",
    inputFiles,
    inputRecords,
  };

  const classification = classifySignalContext(context, config);
  const dedupeSeed = JSON.stringify({
    source: context.source,
    workflow: context.workflowName,
    trigger: classification.triggerKey,
    classification: classification.classification,
    risk: classification.riskLevel,
    inputs: inputFiles,
  });
  const eventId = createStableEventId(dedupeSeed);
  const existingReport = await readJsonIfExists(path.join(root, "reports/agents", `${eventId}.json`));
  const occurrences = Number(existingReport?.occurrences || 0) + 1;
  const now = new Date().toISOString();
  const withinCooldown =
    !args.force &&
    existingReport?.updated_at &&
    Date.now() - Date.parse(existingReport.updated_at) <
      Number(config.cooldown_minutes || 0) * 60 * 1000;

  const report = {
    event_id: eventId,
    source: context.source,
    classification: classification.classification,
    risk_level: normalizeRiskLevel(classification.riskLevel),
    recommended_action: classification.recommendedAction,
    auto_action_taken: existingReport?.auto_action_taken || "none",
    approval_required: classification.approvalRequired,
    artifacts: [],
    rerun_commands: classification.rerunCommands,
    status: classification.status,
    created_at: existingReport?.created_at || now,
    updated_at: now,
    occurrences,
    dedupe_key: hashValue(dedupeSeed),
    deduped: Boolean(existingReport && withinCooldown),
    cooldown_minutes: config.cooldown_minutes,
    trigger: classification.triggerKey,
    workflow_name: context.workflowName,
    conclusion: context.conclusion,
    input_files: inputFiles,
    high_risk_matches: classification.highRiskMatches,
    safe_remediation_profile: classification.safeRemediationProfile,
    signal_summary: classification.summary,
  };

  if (!args.noAi) {
    const aiAdvice = await maybeGenerateAnthropicAdvice({ report, config });
    report.ai_assist = aiAdvice;
    if (aiAdvice?.recommended_action) {
      report.recommended_action = aiAdvice.recommended_action;
    }
    if (aiAdvice?.risk_level) {
      report.risk_level = maxRiskLevel(report.risk_level, aiAdvice.risk_level);
    }
  } else {
    report.ai_assist = {
      used: false,
      reason: "AI explicitly disabled",
    };
  }

  const filePaths = await writeAgentReport(root, report);
  const autoRemediationEligible = isAutoRemediationEligible(report, config);
  report.artifacts = [
    ...inputFiles.map((file) => ({ kind: "input", path: file })),
    { kind: "report_json", path: filePaths.jsonRelative },
    { kind: "report_markdown", path: filePaths.markdownRelative },
  ];
  await writeAgentReport(root, report);

  const lines = [
    "## Ops Triage",
    `- Event ID: \`${report.event_id}\``,
    `- Source: \`${report.source}\``,
    `- Classification: \`${report.classification}\``,
    `- Risk: \`${report.risk_level}\``,
    `- Approval required: ${report.approval_required ? "yes" : "no"}`,
    `- Dedupe hit: ${report.deduped ? "yes" : "no"}`,
    `- Auto remediation eligible: ${autoRemediationEligible ? "yes" : "no"}`,
    `- JSON report: \`${filePaths.jsonRelative}\``,
    `- Markdown report: \`${filePaths.markdownRelative}\``,
  ];

  console.log(lines.join("\n"));
  await appendStepSummary(lines);
  await setGithubOutputs({
    report_path: filePaths.jsonRelative,
    report_markdown_path: filePaths.markdownRelative,
    event_id: report.event_id,
    risk_level: report.risk_level,
    classification: report.classification,
    approval_required: report.approval_required,
    deduped: report.deduped,
    safe_remediation_profile: report.safe_remediation_profile || "",
    auto_remediation_eligible: autoRemediationEligible,
  });
}

main().catch((error) => {
  console.error(`Ops triage failed: ${error?.message || error}`);
  process.exit(1);
});
