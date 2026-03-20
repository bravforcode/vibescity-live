import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REMEDIATION_PROFILES,
  executeSafeRemediation,
} from "../../scripts/agents/safe-remediate.mjs";

const tempRoots = [];

const TEST_CONFIG = {
  allow_write_paths: [
    "reports/agents/**",
    "reports/ci/**",
    "tmp/**",
    "src/locales/**",
    "playwright-report/**",
    "reports/e2e/**",
    "test-results-mapprobe-preflight/**",
  ],
  deny_write_paths: [
    "supabase/migrations/**",
    "**/*payment*",
    "**/*stripe*",
    "**/*auth*",
    "**/*session*",
    "**/*token*",
    "**/*rls*",
    "**/*schema*",
    "scripts/**/*.sql",
  ],
  high_risk_rules: [],
};

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function createTestRoot(profileName, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "vibecity-agent-remediation-"));
  tempRoots.push(root);

  await writeJson(path.join(root, ".agent/config/autonomy.json"), TEST_CONFIG);

  const reportPath = path.join(root, "reports/agents", `${profileName}.json`);
  const report = {
    event_id: `event-${profileName}`,
    source: "integration-test",
    classification: `${profileName}-classification`,
    risk_level: "medium",
    recommended_action: `Handle ${profileName}`,
    auto_action_taken: "none",
    approval_required: false,
    artifacts: [],
    rerun_commands: REMEDIATION_PROFILES[profileName].commands.map(
      (command) => `${command.command} ${command.args.join(" ")}`.trim(),
    ),
    status: "open",
    safe_remediation_profile: profileName,
    ...overrides,
  };
  await writeJson(reportPath, report);

  return {
    root,
    reportPath,
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("safe remediation integration", () => {
  for (const [profileName, profile] of Object.entries(REMEDIATION_PROFILES)) {
    it(`executes the ${profileName} profile and writes remediation artifacts`, async () => {
      const { root, reportPath } = await createTestRoot(profileName);
      const commandRunner = vi.fn(async (definition) => ({
        command: `${definition.command} ${definition.args.join(" ")}`.trim(),
        exit_code: 0,
        stdout: `stubbed:${profileName}`,
        stderr: "",
        writes: definition.writes,
      }));

      const result = await executeSafeRemediation({
        root,
        reportPath,
        execute: true,
        commandRunner,
      });

      expect(commandRunner).toHaveBeenCalledTimes(profile.commands.length);
      expect(result.profileName).toBe(profileName);
      expect(result.remediationReport.safe_remediation_profile).toBe(profileName);
      expect(result.remediationReport.status).toBe("remediated");
      expect(result.remediationReport.auto_action_taken).toBe(`executed:${profileName}`);
      expect(result.remediationReport.execution_results).toHaveLength(profile.commands.length);
      expect(result.remediationReport.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "source_report" }),
          expect.objectContaining({ kind: "execution_log" }),
        ]),
      );

      const writtenReport = JSON.parse(await readFile(result.filePaths.jsonPath, "utf8"));
      const writtenMarkdown = await readFile(result.filePaths.markdownPath, "utf8");
      const writtenLog = await readFile(result.logPath, "utf8");

      expect(writtenReport.status).toBe("remediated");
      expect(writtenReport.execution_results).toHaveLength(profile.commands.length);
      expect(writtenMarkdown).toContain(`Agent Report: ${result.remediationReport.classification}`);
      expect(writtenLog).toContain(`stubbed:${profileName}`);
    });
  }

  it("rejects approval-gated reports before executing any profile", async () => {
    const { root, reportPath } = await createTestRoot("route-slo-recheck", {
      approval_required: true,
    });
    const commandRunner = vi.fn();

    await expect(
      executeSafeRemediation({
        root,
        reportPath,
        execute: true,
        commandRunner,
      }),
    ).rejects.toThrow(/approval-gated/);
    expect(commandRunner).not.toHaveBeenCalled();
  });
});
