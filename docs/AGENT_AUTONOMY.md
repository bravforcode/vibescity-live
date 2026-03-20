# VibeCity Agent Autonomy

This document describes the autonomous sub-agent mesh added for VibeCity operations.

Current operating mode is `auto-max`:

- safe surfaces auto-triage
- safe remediation profiles auto-execute
- GitHub issues and PR comments auto-publish
- recovered workflows auto-resolve prior reports
- high-risk surfaces remain approval-gated

## Surface Area

- Config: `.agent/config/autonomy.json`
- Runtime: `scripts/agents/`
- Reports: `reports/agents/`
- Claude subagents: `.claude/agents/`
- Claude commands: `.claude/commands/`
- GitHub control plane: `.github/workflows/ops-agent-*.yml`

## Runtime Model

- `triage-cycle.mjs`
  - normalizes workflow failures, quality trends, route SLOs, perf reports, i18n drift, and generic CI failures into one report shape
  - optionally uses Anthropic when `ANTHROPIC_API_KEY` is present
  - degrades to deterministic classification when AI is unavailable
- `safe-remediate.mjs`
  - executes only allowlisted remediation profiles
  - refuses any report that requires approval
  - writes remediation artifacts back into `reports/agents/`
- `resolve-recovery.mjs`
  - scans recent reports for a workflow that has recovered
  - flips matching primary reports to `resolved`
  - enables issue closure and PR comment updates on recovery
- `build-approval-packet.mjs`
  - converts high-risk reports into explicit approval packets
  - generates approval tokens and rollback guidance
- `publish-agent-report.mjs`
  - writes GitHub step summaries and outputs
  - optionally creates or updates GitHub issues for high-risk or approval-gated events
  - optionally upserts PR comments when the current run is attached to a pull request or a manual `pr_number` is supplied

## Report Schema

Every report written under `reports/agents/` includes these top-level fields:

- `event_id`
- `source`
- `classification`
- `risk_level`
- `recommended_action`
- `auto_action_taken`
- `approval_required`
- `artifacts`
- `rerun_commands`
- `status`

Additional metadata such as timestamps, high-risk matches, occurrences, and issue references may also be included.

## High-Risk Gate

The mesh never auto-writes or auto-executes privileged flows when the report touches:

- payment or Stripe paths
- auth/session/token flows
- RLS and policy surfaces
- schema or migration files
- destructive SQL or recovery scripts

Those events must be turned into approval packets and reviewed via the high-risk workflow.

## GitHub Workflows

- `ops-agent-advisor.yml`
  - scheduled advisory triage using fresh quality-trend inputs
  - auto-runs a safe remediation profile when eligible
- `ops-agent-triage-on-failure.yml`
  - auto-triage for failed workflow runs
  - auto-runs safe remediation profiles when eligible
- `ops-agent-recovery-on-success.yml`
  - closes the loop when monitored workflows recover
  - marks matching reports as `resolved` and publishes the recovery state
- `ops-agent-safe-remediation.yml`
  - manual safe remediation lane
  - accepts an optional `pr_number` for remediation status comments
- `ops-agent-high-risk-review.yml`
  - manual high-risk review and approval-token verification
  - accepts an optional `pr_number` for approval review comments

## Required Secrets and Vars

- `ANTHROPIC_API_KEY`
  - optional for richer recommendations
  - wired into the ops workflows as a repository Actions secret
  - not required for deterministic triage
- `GITHUB_TOKEN`
  - used automatically in Actions for issue creation and publishing
- `ANTHROPIC_MODEL`
  - optional override for the reasoning model

Set the Anthropic secret in GitHub under `Settings -> Secrets and variables -> Actions -> New repository secret` with the exact name `ANTHROPIC_API_KEY`.

The PR automation path is:

- `workflow_run` jobs auto-detect `github.event.workflow_run.pull_requests`
- manual ops workflows accept `pr_number`
- `publish-agent-report.mjs` upserts one marked comment per `event_id` to avoid PR spam

## What The System Helps With

The mesh is useful for these jobs:

- triage failing CI, Playwright, route-SLO, perf, healthcheck, and i18n signals into one normalized report
- dedupe repeated failures into stable event IDs instead of creating noisy new threads every run
- rerun safe diagnostics and remediation profiles automatically without waiting for a human
- open or update GitHub issues for high-risk or persistent incidents
- comment on PRs with the current ops state, remediation outcome, or approval requirement
- close the loop when a previously failing workflow recovers by resolving old reports automatically
- keep dangerous areas out of auto-write mode, especially payment, auth, RLS, schema, migrations, and destructive scripts

## Local Usage

Run the CLIs directly:

```bash
node scripts/agents/triage-cycle.mjs --trigger scheduled_advisor --input reports/ci/weekly-quality-trend.json
node scripts/agents/safe-remediate.mjs --report reports/agents/<event-id>.json --execute
node scripts/agents/build-approval-packet.mjs --report reports/agents/<event-id>.json
node scripts/agents/publish-agent-report.mjs --report reports/agents/<event-id>.json
```

Or use the Claude slash commands:

- `/ops-triage`
- `/ops-remediate-safe`
- `/ops-status`
- `/ops-review-high-risk`
