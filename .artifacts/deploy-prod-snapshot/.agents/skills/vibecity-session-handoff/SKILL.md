---
name: vibecity-session-handoff
description: Session handoff rules for VibeCity. Use when resuming previous repo stabilization, runtime, map, dashboard, audit, or console-hardening work in `C:\vibecity.live`.
---

# VibeCity Session Handoff

## Start Here

1. Read `docs/runbooks/agent-operating-memory.md` completely.
2. Run `git status --short` before editing anything.
3. Read the current active plan or audit documents referenced in memory.
4. Treat the worktree as globally dirty unless proven otherwise.

## Required Resume Artifacts

- `docs/runbooks/agent-operating-memory.md`
- `.planning/20260325-skill-import-and-project-audit.md`
- `.planning/20260325-phase2-repo-stabilization.md`
- `docs/audits/20260325-ultrathink-project-audit.md`
- `docs/skills/imported-external-skills.md`

## Resume Rules

- Do not assume merge-conflict files belong to the current task.
- Prefer additive stabilization work over broad refactors when the repo is dirty.
- Keep payment, auth, RLS, and schema changes out of scope unless explicitly approved.
- Update `docs/runbooks/agent-operating-memory.md` before ending the session if the baseline changed.

## Phase 2 Focus

- Keep `api/index.py` as a truthful Vercel entrypoint.
- Fail fast in CI when repo hygiene regresses.
- Preserve documentation of build and deployment authority.
- Use imported external skills under `skills/` and `.agents/skills/` as the audit and execution lens where relevant.
