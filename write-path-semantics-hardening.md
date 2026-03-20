# Write-Path Semantics Hardening

## Goal

Unify optimistic mutation semantics across frontend stores and admin actions so write paths use one consistent snapshot/apply/rollback/reporting pattern.

## Scope

- `src/composables/useOptimisticUpdate.ts`
- `src/store/userStore.js`
- `src/store/favoritesStore.js`
- `src/store/coinStore.js`
- `src/views/AdminView.vue`
- `src/components/admin/LocalAdManager.vue`
- related unit tests

## Approach

- Extend the existing optimistic helper into a shared mutation policy primitive
- Use snapshot/apply/rollback consistently for optimistic writes
- Roll back local state on failed critical writes instead of leaving drifted UI state
- Keep error surfaces normalized for stores and admin actions

## Success Criteria

- Critical optimistic writes rollback consistently on failure
- Admin list mutations share one optimistic mutation pattern
- Existing success UX remains intact while failures become deterministic
- `bun run lint` passes
- `bun run test:unit --run` passes
- `$env:PYTHONUTF8='1'; python .agent/scripts/checklist.py .` passes

## Result

- Promoted optimistic write handling into `runOptimisticMutation()` with reusable snapshot cloning and normalized error surfaces
- Unified rollback behavior for `userStore.updateProfile`, `favoritesStore.clearAll`, and `coinStore.spendCoins`
- Hardened admin review actions in `AdminView.vue` with optimistic removal, rollback, and per-row pending guards
- Hardened `LocalAdManager.vue` create/update/toggle/delete paths with optimistic list reconciliation instead of refetch-only semantics
- Added regression tests for the shared helper and the store write paths most likely to drift

## Validation

- `bun x vitest run tests/unit/useOptimisticUpdate.spec.ts tests/unit/userStore.spec.js tests/unit/favoritesStore.spec.js tests/unit/coinStore.spec.js`
- `bun run lint`
- `bun run test:unit --run`
- `python -X utf8 .agent/scripts/checklist.py .`
