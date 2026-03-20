# Feature Gap Capability Unification

## Goal

Close the next mutation-semantic gap by implementing missing capabilities instead of only refactoring existing write paths.

## Scope

- `backend/app/api/routers/shops.py`
- `backend/app/api/routers/redemption.py`
- `backend/app/api/routers/admin.py`
- `src/store/shopStore.js`
- `src/components/ui/ReviewSystem.vue`
- `src/services/redemptionService.js`
- `src/components/ui/CouponModal.vue`
- `src/services/adminService.js`
- `src/views/AdminView.vue`

## Assumptions

- Review ownership is enforced by `user_id` or `visitor_id` when that actor context exists.
- Review reporting is a soft moderation action; it should not require schema changes.
- Coupon redemption history is satisfied by surfacing a user's redeemed coupons from `user_coupons`.
- Admin bulk moderation covers the real pending-shop moderation flow with bulk approve/reject.

## Result

- Added real review delete/report API capability and wired it into the existing frontend store/UI mutation flow.
- Added coupon redemption history API capability and surfaced it in the coupon claim dialog.
- Added real admin bulk approve/reject capability and wired it into the existing optimistic moderation flow.
