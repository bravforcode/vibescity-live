## Phase 2

Stabilize the repository so follow-up implementation can proceed safely.

## Goals

1. Repair obvious deploy/runtime breakage that can be fixed additively.
2. Add automated repo-hygiene checks so merge-conflict and entrypoint regressions fail early.
3. Add missing process files needed for review and ownership.
4. Add explicit ADRs for build and deployment authority.
5. Fix low-risk environment/documentation defects discovered in the audit.

## Safe Scope

- `api/`
- `.github/`
- `scripts/ci/`
- `.agents/skills/`
- `docs/`
- `.env.example`

## Explicitly Deferred

- Resolving the 24 existing merge conflicts
- Payment/auth/RLS/schema behavior changes
- Supabase migration rewrites
- Large frontend/backend feature refactors

## Deliverables

- [x] Working Vercel Python entrypoint
- [x] Repo hygiene CI check
- [x] PR template
- [x] CODEOWNERS
- [x] ADRs for build and deployment authority
- [x] Missing `vibecity-session-handoff` skill
- [x] `.env.example` correction

## Outcome

- `api/index.py` now exposes the FastAPI app from `backend/app/main.py` and passes `python -m py_compile`.
- `scripts/ci/check-repo-hygiene.mjs` now guards against unmerged files and a broken Vercel entrypoint.
- `.github/workflows/ci.yml` now runs `repo-hygiene` before the main lanes.
- Review/process scaffolding was added under `.github/` and `docs/adr/`.
- `.env.example` now documents backend-critical settings that were previously missing.

## Remaining Blockers

- The worktree still contains `24` unmerged files that must be resolved before claiming the repo is stable.
- `docs/runbooks/agent-operating-memory.md` is itself part of the unresolved worktree and should be handled carefully in follow-up cleanup.
- Security-sensitive runtime changes in auth, RLS, payment, and schema lanes remain intentionally deferred.
