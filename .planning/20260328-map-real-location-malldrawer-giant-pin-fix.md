# 2026-03-28 Map Real Location + MallDrawer + Giant Pin Fix

## Scope
- Restore local startup to prefer the browser's real geolocation instead of forcing the deterministic Thailand-wide mock first.
- Fix `MallDrawer.vue` runtime failures so building / giant-pin open flows do not crash in `setup` or render.
- Verify whether missing shop signs and unusable giant pins are resolved by the location + drawer fixes or still need an interaction patch.

## Root Cause Hypotheses
- Frontend-only localhost currently forces `locationStore` into deterministic mock mode before any real browser geolocation can win.
- `MallDrawer.vue` calls `inject(...)` without importing it, which aborts setup and cascades into `Z.DRAWER` / `Z.DRAWER_BACKDROP` render errors.
- Missing shop signs may be secondary to the bad startup camera / wrong zoom lane; giant pin failure may be the drawer crash rather than the pin layer itself.

## Implementation Plan
1. Patch `locationStore` / runtime config so localhost dev attempts real geolocation first and only falls back to deterministic mock when explicitly forced or when geolocation fails.
2. Patch `MallDrawer.vue` to restore its Vue imports and stabilize drawer rendering.
3. Run lint/targeted checks and verify in a real browser that startup location, shop signs, and giant-pin open behavior match the requested flow.

## Acceptance
- Opening localhost dev centers on the real current location when geolocation is available.
- If geolocation is denied/unavailable, the app still falls back safely without breaking startup.
- Opening a building / giant pin no longer throws `inject is not defined` or `Z.*` errors.
- Shop signs and giant-pin behavior are browser-verified after the fixes; any residual issue is isolated with exact follow-up scope.
