## Task

Execute the second full-repository remediation wave after the initial audit hardening pass, focusing on the remaining failing and high-risk files plus scorecard noise that still obscures the true residual risk.

## Scope

- Backend exception-handling cleanup in remaining router and service hotspots
- Hardening of flagged operational scripts and manual test utilities
- Audit scorecard precision improvements for intentionally empty or non-runtime files
- Full audit regeneration and memory refresh after the fixes

## Priorities

1. Eliminate `failing` audit files first.
2. Narrow broad `except Exception` blocks where the failure modes are already known.
3. Avoid user-visible behavioral changes unless they improve safety or observability.
4. Reduce scorecard false positives only after fixing real code debt.

## Primary Targets

- `backend/scripts/osm_scraper.py`
- `backend/tests/manual_test.py`
- `backend/app/api/routers/payments.py`
- `backend/app/api/routers/owner.py`
- `backend/app/api/routers/ugc.py`
- `backend/app/services/venue_repository.py`
- `.agents/skills/repo-deep-audit/scripts/build_repo_audit_scorecard.py`

## Deliverables

- Hardened backend and script surfaces with narrower exception handling and cleaner diagnostics
- Lower-noise scorecard logic that better reflects runtime risk
- Refreshed audit artifacts in `reports/audit/`
- Updated `docs/runbooks/agent-operating-memory.md` with the new baseline and residual gaps
