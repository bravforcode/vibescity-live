# Repo Hardening Pass

## Goal

Finish the current frontend/test hardening sweep for the map, neon, and realtime surface area without touching unrelated dirty worktree changes.

## Scope

- Remove remaining non-actionable warning/stdout debt surfaced by unit tests
- Reduce noisy debug logging in shared frontend code where it leaks into tests
- Keep behavior intact while improving cleanup, test isolation, and observability discipline
- Re-run validation after each meaningful change until checks are green

## Current Known Issues

- `useRealtimeFeatures` emits console noise during unit tests
- Map/realtime related files still contain unconditional debug logging
- Full validation currently passes, but the suite still has avoidable stdout chatter

## Success Criteria

- `bun run lint` passes
- `bun run test:unit --run` passes without avoidable warning/stdout noise from the touched area
- `python .agent/scripts/checklist.py .` passes
- No unrelated files are reverted or reformatted as collateral damage

## Constraints

- Repo worktree is already dirty; edits must stay tightly scoped
- No payment/auth/RLS/schema/migration changes
- Prefer small behavioral fixes over broad refactors
