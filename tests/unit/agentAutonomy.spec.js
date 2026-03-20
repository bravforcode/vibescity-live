import { describe, expect, it } from "vitest";
import { classifySignalContext } from "../../scripts/agents/lib/classification.mjs";
import { collectHighRiskMatches, isDeclaredWriteAllowed } from "../../scripts/agents/lib/runtime.mjs";

const config = {
  allow_write_paths: [
    "reports/agents/**",
    "reports/ci/**",
    "tmp/**",
    "src/locales/**",
    "docs/**",
    ".claude/commands/**",
    ".claude/agents/**",
    ".agent/config/**",
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
  high_risk_rules: [
    {
      id: "schema",
      keywords: ["schema", "migration", "ddl", "sql"],
      paths: ["supabase/migrations/**", "**/*schema*", "scripts/**/*.sql"],
      reason: "Schema and migration changes require human approval.",
    },
    {
      id: "auth",
      keywords: ["auth", "login", "session", "token", "oauth", "jwt"],
      paths: ["**/*auth*", "**/*session*", "**/*token*"],
      reason: "Authentication and session changes require human approval.",
    },
  ],
  trigger_matrix: {
    "route-slo": {
      rerun_commands: ["node scripts/ci/evaluate-route-slo.mjs"],
    },
    "workflow_failure": {
      rerun_commands: ["python .agent/scripts/checklist.py ."],
    },
  },
};

describe("agent autonomy guardrails", () => {
  it("flags migration paths as high risk", () => {
    const hits = collectHighRiskMatches(
      {
        paths: [
          "supabase/migrations/20260318123000_restore_get_feed_cards_runtime_budget.sql",
        ],
      },
      config,
    );

    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("schema");
  });

  it("classifies route SLO failures consistently", () => {
    const result = classifySignalContext(
      {
        triggerKey: "route-slo",
        workflowName: "Synthetic Postdeploy Monitor",
        source: "workflow_run:123",
        conclusion: "failure",
        inputFiles: ["reports/ci/route-slo-evaluation.json"],
        inputRecords: [
          {
            relativePath: "reports/ci/route-slo-evaluation.json",
            parsed: {
              signals: [
                {
                  breach_key: "route:feed:p95",
                  breached: true,
                  severity: "required",
                },
              ],
            },
          },
        ],
      },
      config,
    );

    expect(result.classification).toBe("route-slo-breach");
    expect(result.approvalRequired).toBe(false);
    expect(result.rerunCommands).toContain("node scripts/ci/evaluate-route-slo.mjs");
    expect(result.safeRemediationProfile).toBe("route-slo-recheck");
  });

  it("rejects write profiles outside the allowlist", () => {
    const result = isDeclaredWriteAllowed(
      ["reports/agents/**", "supabase/migrations/**"],
      config,
    );

    expect(result.ok).toBe(false);
    expect(result.denied).toContain("supabase/migrations/**");
  });
});
