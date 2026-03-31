## Task

Import the 10 provided external `.skill` archives into this repository in a way that is usable by the existing agent ecosystems, then perform a detailed project audit with at least 100 concrete recommendations.

## Inputs

- External skill archives:
  - `git-workflow.skill`
  - `monitoring-observability.skill`
  - `performance-profiling.skill`
  - `security-hardening.skill`
  - `api-design.skill`
  - `database-ops.skill`
  - `devops-pipeline.skill`
  - `fullstack-scaffold.skill`
  - `infra-as-code.skill`
  - `tech-research.skill`

## Constraints

- Repository worktree is heavily dirty and contains unresolved conflicts in multiple app files.
- Avoid modifying existing product logic unless absolutely required for this task.
- Do not touch payment/auth/RLS/schema behavior as part of this task.
- Prefer additive changes only.

## Approach

1. Inspect the external archives and confirm their internal structure.
2. Establish a canonical import location for the new skills.
3. Add compatibility copies or mirrors for the existing repo agent ecosystems.
4. Add an inventory/usage document so future sessions can find and invoke the imported skills.
5. Audit the codebase and current repo state across frontend, backend, data, security, CI/CD, observability, testing, docs, and workflow.
6. Update `docs/runbooks/agent-operating-memory.md` with the current session outcome.

## Success Criteria

- All 10 external skills exist in the repo after import.
- The imported skills preserve their `SKILL.md` and any bundled `references/`.
- The repo contains a clear usage index for the imported skills.
- Final audit includes at least 100 concrete improvement items grounded in this repo.
