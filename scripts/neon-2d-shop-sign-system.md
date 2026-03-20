## 2D Neon Shop-Sign Map (MapLibre) Implementation Plan

### Scope
- Convert map presentation to strict 2D neon style with MapLibre.
- Replace legacy pin-symbol UX with deterministic neon shop signs.
- Keep existing event contracts unchanged (`select-shop`, `open-detail`, `open-ride-modal`).
- Enable feature rollout via default-on flags plus kill switch behavior.

### Guardrails
- No changes to payment flow.
- No changes to auth, RLS, DB schema, or migrations.
- No destructive data operations.

### Acceptance Criteria
1. Map is locked in 2D (`pitch=0`, `bearing=0`, rotation disabled).
2. Neon sign rendering is deterministic per `shop.id` and stable across sessions.
3. Pin layers are replaced by neon LOD layers (`mini`, `compact`, `full`).
4. Selected shop uses dedicated glow layer and keeps click behavior.
5. Map action CTA (`Claim`, `Take me there`) appears only when a shop is selected.
6. Style has no active `fill-extrusion` layer and avoids missing source-layer/glyph errors.
7. Feature flags are default-on and allow runtime rollback.

### Rollback
- Toggle off:
  - `enable_neon_sign_map_v1`
  - `enable_map_2d_lock_v1`
  - `enable_neon_map_actions_v1`
- Reload app to fallback behavior without data migration.

### Validation
- `bun run check`
- `bun run build`
- Focused unit tests for deterministic neon theme and 2D lock logic.

