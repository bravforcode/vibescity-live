# Map + Neon Sign + Promote Shop End-to-End Remediation

## Scope
- Canonical owner promotion flow: `BuyPinsPanel`
- Canonical map pin source: `GET /api/v1/venues`
- Canonical fulfillment path: payment/manual approval -> `apply_order_entitlements(order_id)`
- Canonical branding/sign storage: `venues.pin_metadata`
- Thailand-only map behavior by default

## Workstreams
- Backend fulfillment + order idempotency
- Owner promotion status + branding APIs
- Rich `/venues` response contract
- BuyPinsPanel branding/sign config flow
- Home entrypoint away from `MerchantRegister`
- Map zoom alignment + fallback/flag cleanup
- Storage bucket/feature-flag migration
- Tests and rollout validation

## Rollout Flags
- `promote_flow_v2_enabled`
- `map_pins_api_v2_enabled`
- `map_feed_fallback_enabled`
- `neon_asset_render_enabled`
- existing `neon_sign_v2_enabled`

## API Contract
- `/api/v1/venues` must return:
  - `id`
  - `name`
  - `lat`
  - `lng`
  - `category`
  - `rating`
  - `pin_type`
  - `pin_metadata`
  - `verified_active`
  - `glow_active`
  - `boost_active`
  - `giant_active`
  - `visibility_score`
  - `cover_image`
  - `logo_image`
  - `is_live`
- Owner APIs to add:
  - `GET /api/v1/owner/shops/{shop_id}/promotion-status`
  - `POST /api/v1/owner/shops/{shop_id}/branding/upload-init`
  - `POST /api/v1/owner/shops/{shop_id}/branding/commit`
  - `PATCH /api/v1/owner/shops/{shop_id}/promotion-config`

## Migration List
- Add `shop-branding` storage bucket + policies
- Seed v2 promotion/map feature flags

## Rollback
- Disable `promote_flow_v2_enabled` for owner flow regressions
- Disable `map_pins_api_v2_enabled` and re-enable feed fallback on map regressions
- Disable `neon_asset_render_enabled` if rendered asset path regresses

## QA Matrix
- Stripe checkout -> order paid -> entitlement applied once
- Manual review approve -> entitlement applied once
- Owner uploads logo/cover -> commit persists branding
- Owner updates slot + sign mode -> promotion status reflects change
- `/venues` returns rich fields at float zoom values
- Zoom 6/11/14/15/16 return expected LOD behavior
- Giant pins remain visible at low zoom
- Metadata-driven sign still works when rendered asset is unavailable
