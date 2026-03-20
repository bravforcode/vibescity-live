# UGC Mutation Semantics Unification

## Goal

Unify user-facing mutation semantics for UGC and merchant flows so optimistic writes, rollback behavior, and user notifications follow one shared primitive end-to-end.

## Scope

- `src/store/shopStore.js`
- `src/components/ui/CouponModal.vue`
- `src/components/ugc/AddShopModal.vue`
- `src/components/ugc/EditShopModal.vue`
- `src/components/panel/MerchantRegister.vue`
- related services/tests

## Approach

- Reuse `runOptimisticMutation()` where local list/detail state needs optimistic updates
- Normalize non-optimistic submit flows so they still use one error/notify/commit pattern
- Preserve honest UX for irreversible or externally validated actions by avoiding fake optimistic success
- Add regression tests around the highest-risk mutation paths

## Success Criteria

- Review, coupon, and merchant/UGC submissions share one mutation primitive or wrapper
- Local state rollback is deterministic where optimistic UI is used
- Non-optimistic submits still share normalized commit/error semantics
- `bun run lint` passes
- `bun run test:unit --run` passes
- `python -X utf8 .agent/scripts/checklist.py .` passes

## Result

- `shopStore.addReview()` now uses `runOptimisticMutation()` so review creation gets a temporary local item, deterministic rollback, and persisted replacement without a forced refetch on success.
- `ReviewSystem.vue` now respects the normalized mutation result contract instead of blindly refetching after submit.
- `CouponModal.vue` now uses the same primitive for optimistic coin deduction with rollback on failed coupon claims.
- `AddShopModal.vue`, `EditShopModal.vue`, and `MerchantRegister.vue` now use the same commit/error/notify mutation primitive even where the UX should remain server-confirmed rather than fake-optimistic.
- Added regression coverage for optimistic review replacement/rollback and coupon-claim rollback.

## Validation

- `bun x vitest run tests/unit/shopStore.spec.js tests/unit/CouponModal.spec.js`
- `bun run lint`
- `bun run test:unit --run`
- `python -X utf8 .agent/scripts/checklist.py .`
