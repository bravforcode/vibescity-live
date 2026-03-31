## Task

Execute a broad repository remediation wave after the full-project audit, including previously stop-gated areas such as payment, auth, RLS, schema, and migrations when the fixes are additive, safer, and realistically verifiable in the current dirty worktree.

## Scope

- Production-risk configuration and auth surfaces
- Destructive or misleading SQL automation
- Unsafe DOM injection or noisy debug behavior in frontend hotspots
- Broad exception handling and print-debugging in backend/ops scripts
- High-signal test and tooling cleanup that improves validation fidelity

## Priorities

1. Reduce real production risk before cosmetic debt.
2. Prefer additive hardening over behavioral rewrites.
3. Avoid changes that cannot be validated in the current session.
4. Re-run audit artifacts after the remediation wave.

## Deliverables

- Hardened source/config/scripts in the highest-risk zones
- Updated audit results in `reports/audit/`
- Updated operating memory with the new baseline and residual risks
