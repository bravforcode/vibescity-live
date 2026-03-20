# dashboard-enterprise-hardening

## Purpose

Enterprise hardening patch for Owner/Partner dashboards and their API boundary.

## Scope

- API envelope contract + version headers + adapter compatibility
- Idempotency key pipeline for sensitive mutations
- CSRF token issuance + verification for partner mutation routes
- RBAC/permission composables + route meta guards
- Feature-flag governance (dependencies + lifecycle metadata)
- Real-time payout event contract + SSE client/service stubs
- Operational docs (SLO breach runbook, canary criteria, secret policy)
- CI supply-chain checks (audit, license gate, SBOM, VITE secret exposure)

## Out of Scope

- DB schema migrations
- Replacing all historical API payloads in one release
- Refactoring unrelated map/feed modules

## Safety Constraints

- Keep backward compatibility by supporting both raw payload and envelope payload.
- Use opt-in envelope mode from client via `X-API-Envelope: 1`.
- Keep default behavior fail-open where strict enforcement could break existing clients.

## Implemented Artifacts

- Backend middleware: `backend/app/middleware/api_contract.py`
- Partner financial hardening: `backend/app/api/routers/partner.py`
- Dashboard BFF router: `backend/app/api/routers/dashboard_bff.py`
- Frontend guard/composables:
  - `src/composables/useDashboardGuard.ts`
  - `src/composables/usePermission.ts`
  - `src/composables/useSecureForm.ts`
  - `src/composables/useIdempotentMutation.ts`
- Contracts/docs:
  - `docs/api/dashboard-api-versioning-contract.md`
  - `docs/realtime/event-contract-versioning.md`
  - `docs/runbooks/dashboard-canary-promotion.md`
  - `docs/runbooks/dashboard-slo-breach.md`
  - `docs/security/secret-management-policy.md`
- CI security workflow: `.github/workflows/security.yml`
