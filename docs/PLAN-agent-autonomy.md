# PLAN-agent-autonomy

## Summary

- Project type: `WEB`
- Goal: add a hybrid autonomous sub-agent mesh that triages CI and observability signals, performs safe remediation on allowlisted surfaces, and blocks high-risk actions behind explicit approval packets.
- Execution plane: `scripts/agents/*.mjs`
- Reasoning plane: `.claude/agents/*` plus the existing `.agent/skills` / `.claude/skills`
- Control plane: GitHub Actions schedules, `workflow_run`, and manual dispatch

## Phases

1. Advisory triage
   - Normalize workflow and report inputs into one report shape in `reports/agents/`
   - Publish summaries to GitHub step summaries and optional issues
2. Safe auto-remediation
   - Allow only safe-surface actions from `autonomy.json`
   - Re-run relevant checks and write remediation artifacts
3. High-risk gate
   - Detect payment/auth/RLS/schema/destructive paths
   - Emit approval packets with exact proposed actions and rollback notes

## Deliverables

- `.agent/config/autonomy.json`
- `scripts/agents/triage-cycle.mjs`
- `scripts/agents/safe-remediate.mjs`
- `scripts/agents/build-approval-packet.mjs`
- `scripts/agents/publish-agent-report.mjs`
- `.claude/agents/ops-orchestrator.md`
- `.claude/agents/signal-triager.md`
- `.claude/agents/safe-remediator.md`
- `.claude/agents/high-risk-gatekeeper.md`
- `.claude/commands/ops-triage.md`
- `.claude/commands/ops-remediate-safe.md`
- `.claude/commands/ops-status.md`
- `.claude/commands/ops-review-high-risk.md`
- `.github/workflows/ops-agent-advisor.yml`
- `.github/workflows/ops-agent-triage-on-failure.yml`
- `.github/workflows/ops-agent-safe-remediation.yml`
- `.github/workflows/ops-agent-high-risk-review.yml`

## Guardrails

- Never auto-write under `supabase/migrations/**`
- Never auto-write payment, auth, RLS, schema, or destructive SQL/script surfaces
- Use approval packets instead of direct execution for blocked areas
- Keep GitHub output first-class: step summaries, issues, artifacts, and `reports/agents/*`

## Verification

- Triage a route-SLO style payload and confirm stable classification plus rerun command
- Confirm a migration path or auth signal flips `approval_required=true`
- Confirm safe remediation refuses blocked surfaces and only executes allowlisted write profiles
- Confirm GitHub publishing degrades cleanly when tokens or AI keys are absent
