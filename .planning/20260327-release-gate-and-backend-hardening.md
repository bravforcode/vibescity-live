## Task

Repair the production release gate and stale CI scripts, decouple backend pytest bootstrap from runtime-only database config, and harden the remaining auth/ops files that the audit still flags before a real deployment.

## Scope

- `scripts/ci/prod-ready-gate.mjs`
- broken `package.json` CI script targets under `scripts/ci/`
- backend pytest bootstrap and import path behavior
- backend auth and selected ops files still flagged by audit for broad exception handling

## Constraints

- Keep changes additive and safe in the current dirty worktree.
- Do not mutate schema, payments, or runtime behavior beyond hardening and testability.
- Release gate must fail on real regressions, not stale file paths or missing optional secrets.

## Success Criteria

1. `npm run ci:prod-ready` is a trustworthy non-mutating gate.
2. `backend/tests/test_metrics.py` and `backend/tests/test_health_contract.py` pass from the repo root with the backend venv.
3. Broken `package.json` CI script targets are repaired.
4. Audit-flagged auth/ops files have narrower error handling or safer fallback behavior.

## Validation

- `node scripts/ci/prod-ready-gate.mjs`
- `C:\vibecity.live\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_metrics.py backend/tests/test_health_contract.py -q`
- targeted lint/build/test commands for touched files
