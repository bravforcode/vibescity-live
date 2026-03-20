import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRecoveryReports } from "../../scripts/agents/resolve-recovery.mjs";

const tempRoots = [];

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function createTestRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "vibecity-agent-recovery-"));
  tempRoots.push(root);

  await writeJson(path.join(root, ".agent/config/autonomy.json"), {
    automation: {
      auto_recovery: {
        enabled: true,
        lookback_days: 14,
      },
    },
  });

  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("recovery resolver integration", () => {
  it("marks matching primary reports as resolved and leaves unrelated reports untouched", async () => {
    const root = await createTestRoot();
    const now = new Date().toISOString();

    const matchingReportPath = path.join(root, "reports/agents", "ci-failure.json");
    const unrelatedWorkflowPath = path.join(root, "reports/agents", "other-workflow.json");
    const childReportPath = path.join(root, "reports/agents", "ci-failure-remediation.json");

    await writeJson(matchingReportPath, {
      event_id: "ci-failure",
      source: "workflow_run:111",
      workflow_name: "CI",
      classification: "e2e-regression",
      risk_level: "medium",
      recommended_action: "rerun smoke",
      auto_action_taken: "none",
      approval_required: false,
      artifacts: [],
      rerun_commands: ["npm run test:e2e:smoke"],
      status: "triaged",
      created_at: now,
      updated_at: now,
    });

    await writeJson(unrelatedWorkflowPath, {
      event_id: "weekly-quality",
      source: "workflow_run:222",
      workflow_name: "Weekly Quality Trend",
      classification: "quality-trend-breach",
      risk_level: "medium",
      recommended_action: "inspect trend",
      auto_action_taken: "none",
      approval_required: false,
      artifacts: [],
      rerun_commands: ["python .agent/scripts/checklist.py ."],
      status: "triaged",
      created_at: now,
      updated_at: now,
    });

    await writeJson(childReportPath, {
      event_id: "ci-failure-remediation",
      parent_event_id: "ci-failure",
      source: "workflow_run:111",
      workflow_name: "CI",
      classification: "e2e-regression",
      risk_level: "medium",
      recommended_action: "rerun smoke",
      auto_action_taken: "executed:playwright-smoke-rerun",
      approval_required: false,
      artifacts: [],
      rerun_commands: ["npm run test:e2e:smoke"],
      status: "remediated",
      created_at: now,
      updated_at: now,
    });

    const result = await resolveRecoveryReports({
      root,
      workflowName: "CI",
    });

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].event_id).toBe("ci-failure");

    const matchingReport = JSON.parse(await readFile(matchingReportPath, "utf8"));
    const unrelatedReport = JSON.parse(await readFile(unrelatedWorkflowPath, "utf8"));
    const childReport = JSON.parse(await readFile(childReportPath, "utf8"));

    expect(matchingReport.status).toBe("resolved");
    expect(matchingReport.auto_action_taken).toContain("auto-resolved:CI");
    expect(matchingReport.recovery.workflow_name).toBe("CI");
    expect(unrelatedReport.status).toBe("triaged");
    expect(childReport.status).toBe("remediated");
  });
});
