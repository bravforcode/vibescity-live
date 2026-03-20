# Neon Sign Token Schema Changelog

## Purpose
- Keep deterministic map-sign rendering stable across releases.
- Define upgrade path for token schema and sprite cache compatibility.

## Versioning Rules
- `neon_signature_version` format: `<major>-<experiment_id>`
- Example: `2-stable`, `2-exp-border-heavy`, `3-stable`
- Cache key must include:
  - `neon_signature_version`
  - `neon_client_version` (`VITE_APP_VERSION` or fallback)
  - `lod` (`full|compact|mini`)
  - motion mode (`reduced_motion`)
  - contrast mode (`prefers-contrast`)

## Schema `v2`
- Deterministic seed fields:
  - `shop_id` (or fallback `name + rounded_lng_lat`)
  - `category`
  - `city_zone`
  - `name_slug` (local only, never exported to telemetry)
  - `signature_version`
  - `experiment_id`
- Output token fields:
  - `neon_signature_v2`
  - `neon_palette`
  - `neon_shape`
  - `neon_border_style`
  - `neon_badge_style`
  - `neon_glow_level`
  - `neon_typography_variant`
  - `neon_icon`
  - `neon_lod_priority`

## Backward Compatibility
- V2 runtime contract must always support fallback chain:
  - `V2 sprite -> V1 sprite -> plain text symbol`
- During rollout, keep V1 prefixed descriptors in feature properties:
  - `neon_v1_*`
- Remove V1 path only after one full stabilization release cycle.

## Migration Guide: `v2 -> v3`
1. Introduce `v3` token generator behind feature flag.
2. Keep writing both `v3` active and `v2` fallback token properties.
3. Include `client_version` in sprite key to prevent stale cross-version reuse.
4. Monitor:
   - `neon_sprite_hit_ratio_v2/v3`
   - `neon_fallback_rate`
   - `sign_first_paint_ms`
5. Flip default only after SLO stability window passes.

## Telemetry and PII Policy
- Never send raw `shop_name` or `name_slug` in logs/metrics.
- Use hashed identifier fields only (for example `shop_id_hash`).
