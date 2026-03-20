#!/usr/bin/env node

import path from "node:path";
import {
  hashValue,
  loadAutonomyConfig,
  readJsonIfExists,
  setGithubOutputs,
  toRepoRelative,
  writeAgentReport,
} from "./lib/runtime.mjs";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") {
      args.report = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.report) {
    throw new Error("Missing --report <path>");
  }

  const root = process.cwd();
  await loadAutonomyConfig(root);

  const reportPath = path.isAbsolute(args.report) ? args.report : path.join(root, args.report);
  const report = await readJsonIfExists(reportPath);
  if (!report) {
    throw new Error(`Report not found or invalid JSON: ${reportPath}`);
  }

  const approvalEventId = `${report.event_id}-approval`;
  const approvalToken = hashValue(`${report.event_id}:approval`)
    .slice(0, 12)
    .toUpperCase();

  const approvalPacket = {
    event_id: approvalEventId,
    source: report.source,
    classification: report.classification,
    risk_level: report.risk_level,
    recommended_action: report.recommended_action,
    auto_action_taken: "blocked-pending-approval",
    approval_required: true,
    artifacts: [{ kind: "source_report", path: toRepoRelative(root, reportPath) }],
    rerun_commands: report.rerun_commands,
    status: "pending-approval",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    parent_event_id: report.event_id,
    approval_token: approvalToken,
    blocked_rules: report.high_risk_matches || [],
    impact_summary: [
      "This event touched a blocked or approval-gated surface.",
      "No auto-remediation was executed.",
      "A human must review the exact proposed actions before any privileged run continues.",
    ],
    rollback_notes: [
      "Keep execution dry-run until approval is confirmed.",
      "Prefer explicit revert commands or a revert commit over destructive resets.",
      "Re-run the listed validation commands after any approved change.",
    ],
    exact_proposed_actions: report.rerun_commands,
  };

  const filePaths = await writeAgentReport(root, approvalPacket);

  console.log(
    [
      "## Ops Approval Packet",
      `- Source report: \`${toRepoRelative(root, reportPath)}\``,
      `- Approval token: \`${approvalToken}\``,
      `- JSON report: \`${filePaths.jsonRelative}\``,
      `- Markdown report: \`${filePaths.markdownRelative}\``,
    ].join("\n"),
  );

  await setGithubOutputs({
    approval_packet_path: filePaths.jsonRelative,
    approval_packet_markdown_path: filePaths.markdownRelative,
    approval_token: approvalToken,
  });
}

main().catch((error) => {
  console.error(`Approval packet generation failed: ${error?.message || error}`);
  process.exit(1);
});
