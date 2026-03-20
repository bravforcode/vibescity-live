#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  appendStepSummary,
  asArray,
  isDeclaredWriteAllowed,
  loadAutonomyConfig,
  readJsonIfExists,
  setGithubOutputs,
  toRepoRelative,
  unique,
  writeAgentReport,
  writeText,
} from "./lib/runtime.mjs";

export const REMEDIATION_PROFILES = {
  "i18n-autopilot": {
    description: "Run i18n autopilot and parity sync.",
    commands: [
      {
        command: "bun",
        args: ["run", "i18n:autopilot"],
        writes: ["src/locales/**", "tmp/**", "reports/agents/**"],
      },
      {
        command: "bun",
        args: ["run", "i18n:sync"],
        writes: ["tmp/**", "reports/agents/**"],
      },
    ],
  },
  "performance-recheck": {
    description: "Re-run perf budget diagnostics.",
    commands: [
      {
        command: "node",
        args: ["scripts/ci/check-perf-budget.mjs", "--budget", "perf-budget.json"],
        writes: ["reports/ci/**", "reports/agents/**"],
      },
    ],
  },
  "route-slo-recheck": {
    description: "Re-run route SLO evaluation.",
    commands: [
      {
        command: "node",
        args: ["scripts/ci/evaluate-route-slo.mjs"],
        writes: ["reports/ci/**", "reports/agents/**"],
      },
    ],
  },
  "healthcheck-rerun": {
    description: "Re-run the postdeploy healthcheck.",
    commands: [
      {
        command: "npm",
        args: ["run", "healthcheck:postdeploy"],
        writes: ["reports/ci/**", "reports/agents/**"],
      },
    ],
  },
  "playwright-smoke-rerun": {
    description: "Re-run the smoke Playwright lane.",
    commands: [
      {
        command: "npm",
        args: ["run", "test:e2e:smoke"],
        writes: ["playwright-report/**", "reports/e2e/**", "reports/agents/**"],
      },
    ],
  },
  "map-preflight-rerun": {
    description: "Re-run the map preflight lane.",
    commands: [
      {
        command: "npm",
        args: ["run", "test:e2e:map-preflight"],
        writes: [
          "playwright-report/**",
          "reports/e2e/**",
          "test-results-mapprobe-preflight/**",
          "reports/agents/**",
        ],
      },
    ],
  },
  "map-required-rerun": {
    description: "Re-run the strict map-required lane.",
    commands: [
      {
        command: "npm",
        args: ["run", "test:e2e:map-required"],
        writes: ["playwright-report/**", "reports/e2e/**", "reports/agents/**"],
      },
    ],
  },
  "diagnostic-checklist": {
    description: "Run the read-only diagnostic checklist.",
    commands: [
      {
        command: "python",
        args: [".agent/scripts/checklist.py", "."],
        writes: ["reports/agents/**"],
      },
    ],
  },
};

export function parseArgs(argv) {
  const args = {
    execute: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--report":
        args.report = argv[index + 1];
        index += 1;
        break;
      case "--execute":
        args.execute = true;
        break;
      default:
        break;
    }
  }

  return args;
}

export function resolveCommand(command) {
  if (command === "node") return process.execPath;
  if (process.platform !== "win32") return command;
  if (command === "npm") return "npm.cmd";
  if (command === "npx") return "npx.cmd";
  return command;
}

export async function runCommand(definition) {
  return new Promise((resolve) => {
    const child = spawn(resolveCommand(definition.command), definition.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("close", (code) => {
      resolve({
        command: `${definition.command} ${definition.args.join(" ")}`.trim(),
        exit_code: code ?? 1,
        stdout,
        stderr,
        writes: definition.writes,
      });
    });
  });
}

function normalizeExecutionResult(definition, result) {
  return {
    command: result?.command || `${definition.command} ${asArray(definition.args).join(" ")}`.trim(),
    exit_code: Number.isInteger(result?.exit_code) ? result.exit_code : 1,
    stdout: String(result?.stdout || ""),
    stderr: String(result?.stderr || ""),
    writes: asArray(result?.writes || definition.writes),
  };
}

export async function executeSafeRemediation({
  root = process.cwd(),
  reportPath,
  execute = false,
  config: configOverride,
  commandRunner = runCommand,
}) {
  if (!reportPath) {
    throw new Error("Missing reportPath");
  }

  const config = configOverride || (await loadAutonomyConfig(root));
  const absoluteReportPath = path.isAbsolute(reportPath) ? reportPath : path.join(root, reportPath);
  const report = await readJsonIfExists(absoluteReportPath);
  if (!report) {
    throw new Error(`Report not found or invalid JSON: ${absoluteReportPath}`);
  }

  if (report.approval_required) {
    throw new Error(
      `Report ${report.event_id} is approval-gated. Use build-approval-packet.mjs instead.`,
    );
  }

  const profileName = report.safe_remediation_profile;
  const profile = profileName ? REMEDIATION_PROFILES[profileName] : null;
  if (!profile) {
    throw new Error(`No safe remediation profile for ${report.classification}`);
  }

  const declaredWrites = unique(profile.commands.flatMap((command) => asArray(command.writes)));
  const writeCheck = isDeclaredWriteAllowed(declaredWrites, config);
  if (!writeCheck.ok) {
    throw new Error(
      `Remediation profile ${profileName} is outside the allowlist. denied=${writeCheck.denied.join(",")} notAllowlisted=${writeCheck.not_allowlisted.join(",")}`,
    );
  }

  const executionResults = [];
  if (execute) {
    for (const command of profile.commands) {
      const result = normalizeExecutionResult(command, await commandRunner(command));
      executionResults.push(result);
      if (result.exit_code !== 0) break;
    }
  }

  const remediationEventId = `${report.event_id}-remediation`;
  const logPath = path.join(root, "reports/agents", `${remediationEventId}.log.txt`);
  const logLines = executionResults.flatMap((result) => [
    `$ ${result.command}`,
    result.stdout.trim(),
    result.stderr.trim(),
    `exit_code=${result.exit_code}`,
    "",
  ]);
  await writeText(logPath, `${logLines.filter(Boolean).join("\n")}\n`);

  const remediationReport = {
    event_id: remediationEventId,
    source: report.source,
    classification: report.classification,
    risk_level: report.risk_level,
    recommended_action: profile.description,
    auto_action_taken: execute ? `executed:${profileName}` : `planned:${profileName}`,
    approval_required: false,
    artifacts: [
      { kind: "source_report", path: toRepoRelative(root, absoluteReportPath) },
      { kind: "execution_log", path: toRepoRelative(root, logPath) },
    ],
    rerun_commands: report.rerun_commands,
    status: execute
      ? executionResults.every((result) => result.exit_code === 0)
        ? "remediated"
        : "remediation-failed"
      : "remediation-planned",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    parent_event_id: report.event_id,
    safe_remediation_profile: profileName,
    execution_results: executionResults,
  };

  const filePaths = await writeAgentReport(root, remediationReport);

  return {
    report,
    profileName,
    remediationReport,
    filePaths,
    logPath,
    reportPath: absoluteReportPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.report) {
    throw new Error("Missing --report <path>");
  }

  const root = process.cwd();
  const result = await executeSafeRemediation({
    root,
    reportPath: args.report,
    execute: args.execute,
  });

  const lines = [
    "## Ops Safe Remediation",
    `- Source report: \`${toRepoRelative(root, result.reportPath)}\``,
    `- Profile: \`${result.profileName}\``,
    `- Executed: ${args.execute ? "yes" : "no"}`,
    `- Status: \`${result.remediationReport.status}\``,
    `- JSON report: \`${result.filePaths.jsonRelative}\``,
    `- Markdown report: \`${result.filePaths.markdownRelative}\``,
  ];

  console.log(lines.join("\n"));
  await appendStepSummary(lines);
  await setGithubOutputs({
    remediation_report_path: result.filePaths.jsonRelative,
    remediation_markdown_path: result.filePaths.markdownRelative,
    remediation_status: result.remediationReport.status,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Safe remediation failed: ${error?.message || error}`);
    process.exit(1);
  });
}
