## Conflict Resolution Batch

Stabilize the repository by resolving the current 24 unmerged files before moving to security/runtime hardening.

## Goals

1. Clear all currently unmerged files without regressing the known frontend recovery baseline.
2. Prefer merged outcomes that preserve the newer repo-stabilization and map-recovery work.
3. Avoid payment/auth/RLS/schema behavior changes during the conflict pass.
4. Re-run targeted validation after each tranche.

## Work Buckets

1. Config and repo metadata
   - `.gitignore`
   - `.vercelignore`
   - `.planning/STATE.md`
   - `docs/runbooks/agent-operating-memory.md`
2. i18n and shell routing
   - `src/i18n.js`
   - `src/locales/en.json`
   - `src/locales/th.json`
   - `src/views/HomeView.vue`
   - `src/components/ui/FilterMenu.vue`
   - `src/components/ui/ConsentBanner.vue`
   - `src/components/ui/VibeActionSheet.vue`
   - `src/components/ui/VibeBanner.vue`
   - `src/components/dashboard/OwnerDashboard.vue`
   - `src/components/feed/BottomFeed.vue`
   - `src/components/panel/MerchantRegister.vue`
3. Map core runtime
   - `src/components/map/MapboxContainer.vue`
   - `src/composables/map/useMapCore.js`
   - `src/composables/map/useMapLayers.js`
   - `src/composables/map/useMapMarkers.js`
   - `src/utils/mapRenderer.js`
   - `src/styles/map-atmosphere.css`
   - `src/composables/useAppLogic.js`
4. Backend conflict review
   - `backend/app/main.py`

## Deferred After Conflicts

- CSP tightening in `vercel.json`
- Supabase function JWT policy review
- Deployment surface cleanup

## Validation

- `git diff --name-only --diff-filter=U`
- `node scripts/ci/check-repo-hygiene.mjs`
- Targeted `npx vue-tsc --noEmit --pretty false` if frontend conflicts are resolved cleanly
- Targeted backend import/syntax validation if `backend/app/main.py` changes
