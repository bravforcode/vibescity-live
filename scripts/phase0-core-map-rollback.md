# Phase 0 Core Map Rollback

## Scope
- API contracts: `/api/v1/venues`, `/api/v1/hot-roads`, `/v1/*` alias
- Frontend map pin source fallback (API -> RPC)
- Frontend hot-roads polling guardrails

## Fast Rollback (Git)
1. Revert Phase 0 commit (single-commit rollback preferred):
   - `git revert <phase0_commit_sha>`
2. Deploy reverted build.

## Frontend Rollback Validation
1. Confirm app boots and map renders.
2. Confirm map pins still render via RPC fallback.
3. Run:
   - `bun run check`
   - `bun run build`

## Backend Rollback Validation
1. Confirm API process starts.
2. Run:
   - `cd backend && pytest`
   - `curl -f http://localhost:8001/health`
3. Confirm `/health` returns `200` and status is `ok` or expected environment status.

## Runtime Guardrails After Rollback
- If `/hot-roads` instability persists, keep polling disabled by reverting frontend polling changes.
- If `/venues` instability persists, keep frontend on RPC-only path (reverted behavior).

## Incident Notes Template
- Trigger time:
- Symptom:
- Rolled back commit:
- Health check result:
- Follow-up owner:
