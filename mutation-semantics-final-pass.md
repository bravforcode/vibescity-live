# Mutation Semantics Final Pass

## Goal

Push the remaining write-path semantics closer to one shared frontend mutation policy by separating true optimistic writes from server-confirmed writes and routing both through shared primitives.

## Scope

- `src/composables/useOptimisticUpdate.ts`
- `src/components/ugc/AddShopModal.vue`
- `src/components/ugc/EditShopModal.vue`
- `src/components/panel/MerchantRegister.vue`
- `src/components/ui/DailyCheckin.vue`
- `src/components/ui/LuckyWheel.vue`
- `src/views/AdminView.vue`
- `src/composables/useVibeSystem.js`
- `tests/unit/useOptimisticUpdate.spec.ts`

## Result

- Added `runCommitMutation()` as the shared wrapper for server-confirmed mutations that should not fake optimistic success.
- Refactored commit-only submit flows (`AddShopModal`, `EditShopModal`, `MerchantRegister`) to use the new wrapper instead of open-coded commit-only `runOptimisticMutation()` calls.
- Refactored user-facing claim actions (`DailyCheckin`, `LuckyWheel`, `useVibeSystem`) onto the same wrapper so error/success handling and pending behavior follow one contract.
- Refactored remaining admin write actions (`runSheetSync`, `confirmPromote`) to the same wrapper, and tied promote to the existing pending-action guard.

## Notes

- `review delete/report`, `coupon redeem history`, and true `admin bulk actions` do not have active implementation paths in the current repo, so they were treated as feature gaps rather than refactorable debt in this pass.
- Existing optimistic paths that already used `runOptimisticMutation()` directly, such as review submit, coupon claim, local ad list edits, favorites, and merchant moderation approve/reject, were left on the optimistic primitive.

## Validation

- `bun x vitest run tests/unit/useOptimisticUpdate.spec.ts tests/unit/shopStore.spec.js tests/unit/CouponModal.spec.js`
- `bun run lint`
- `bun run test:unit --run`
- `python -X utf8 .agent/scripts/checklist.py .`
