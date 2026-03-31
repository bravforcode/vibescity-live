---
name: repo-deep-audit
description: >
  Comprehensive repository audit skill that inventories every tracked or unignored
  project file, builds a per-file scorecard, and produces a detailed remediation
  plan across source code, tests, config, CI, infrastructure, migrations, scripts,
  docs, and assets. Use when the user asks to audit an entire repo or project,
  review every file, score code health, assess technical debt, perform a
  production-readiness audit, or create a prioritized fix plan with concrete reasons.
---

# Repo Deep Audit

## Non-Negotiables

- Audit the entire repository, not only hot paths.
- Give every manifest file one final disposition: `deep-reviewed`, `sampled-reviewed`, or `metadata-reviewed`.
- Score files individually. Do not hide weak files inside directory averages.
- Give a reason and fix path for every file that lands below `85`.
- Treat automation as evidence, not as the final judgment.

## Workflow

1. Build the file manifest.

```bash
python .agents/skills/repo-deep-audit/scripts/build_repo_audit_manifest.py --root . --output reports/audit/repo-audit-manifest.json
```

2. Run the heuristic signal scan.

```bash
python .agents/skills/repo-deep-audit/scripts/run_repo_audit_signals.py --root . --manifest reports/audit/repo-audit-manifest.json --rules .agents/skills/repo-deep-audit/assets/audit_rules.json --output reports/audit/repo-audit-signals.json
```

3. Generate the scorecard scaffold.

```bash
python .agents/skills/repo-deep-audit/scripts/build_repo_audit_scorecard.py --manifest reports/audit/repo-audit-manifest.json --signals reports/audit/repo-audit-signals.json --output-dir reports/audit
```

4. Read the references that match the repo zone you are auditing:
   - `references/scoring-rubric.md`
   - `references/file-playbooks.md`
   - `references/report-template.md`

5. Review in waves:
   - Wave 1: `risk = critical`
   - Wave 2: `risk = high` and `audit_mode = deep`
   - Wave 3: remaining `deep` files
   - Wave 4: `sampled` and `metadata` files

6. Fill the scorecard for every file:
   - `manual_score`
   - `manual_reason`
   - `remediation`
   - `review_disposition`

7. Produce the final report using `references/report-template.md`.

8. Confirm coverage before finishing:
   - every manifest path exists in the scorecard
   - every score under `85` has a reason
   - every score under `70` has at least one concrete fix step

## How To Use The Automation

- Trust the manifest for completeness and sequencing.
- Trust the signal scan for cheap defect discovery.
- Adjust the auto score after reading the file.
- For binary, large, or generated artifacts, use metadata review: file purpose, size, provenance, accessibility, and whether the file belongs in version control.

## Review Rules

- Prefer primary evidence: source, config, migrations, tests, workflows, and docs.
- Cite exact file paths in findings and remediation items.
- If a file is healthy, say why it is healthy.
- If a file is intentionally deferred, explain the defer reason and the remaining risk.
- Do not collapse many weak files into a single vague finding.

## Output Set

- `reports/audit/repo-audit-manifest.json`
- `reports/audit/repo-audit-signals.json`
- `reports/audit/repo-audit-scorecard.json`
- `reports/audit/repo-audit-scorecard.csv`
- A human-readable audit report grounded in the scorecard
