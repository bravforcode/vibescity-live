# Frontend Network Abort Hardening

## Goal

Normalize expected network abort handling in the frontend service layer and document the map/PWA debug flags so the team can use them consistently.

## Scope

- `src/services/*`
- `src/lib/supabase.js`
- `src/utils/mapDebug.js`
- `src/utils/pwa/serviceWorkerManager.js`
- `docs/DEVELOPER_GUIDE.md`
- `README.md`
- targeted unit tests

## Approach

- Add a shared helper for abort-like network errors
- Refactor service/lib code that already has real cancellation paths to use the shared helper
- Preserve real failures as `console.error`
- Add tests for the helper and api client integration points
- Document `window.__VIBECITY_MAP_DEBUG` and `window.__VIBECITY_PWA_DEBUG` in developer docs

## Success Criteria

- Expected request cancellations do not emit noisy `console.error` logs
- Service/lib code stops duplicating ad-hoc abort string matching
- Developers have one clear place to find debug flag usage
- `bun run lint` passes
- `bun run test:unit --run` passes
- `python .agent/scripts/checklist.py .` passes
