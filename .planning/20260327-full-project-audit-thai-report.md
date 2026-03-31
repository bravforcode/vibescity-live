## Task

Run a full-project audit using the `repo-deep-audit` skill and produce an immediate Thai report grounded in current repository evidence.

## Scope

- Entire repository state surfaced by the repo audit manifest
- Cross-domain review: frontend, backend, data platform, CI/CD, docs, tests, scripts, and skills
- Current worktree state, not an idealized clean branch

## Workflow

1. Refresh manifest, signals, and scorecard from the new audit skill.
2. Inspect the highest-risk and lowest-score files first.
3. Synthesize repo-level themes from file-level evidence.
4. Produce a Thai report with overall score, key findings, reasons, and remediation.

## Output

- Updated `reports/audit/*`
- Thai audit report in the assistant response
