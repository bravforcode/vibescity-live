# VibeCity UX/UI Audit Remediation

## Scope

- Phase 1: Replace blocking `alert()` usage in `AdminVenues.vue` and remove layout-thrashing toast progress animation.
- Phase 2: Migrate targeted purple/indigo/violet accents to the amber/gold + black theme across the requested production files.
- Phase 3: Fix the specified accessibility gaps for labels, focus rings, keyboard access, and touch target sizing.
- Phase 4: Correct incorrect reduced-motion handling where the query direction is inverted.

## Assumptions

- `useNotifications()` is the active shared toast API because `VibeNotification.vue` renders `state.queue`.
- `src/components/admin/AdminDashboard.vue` is not present in the current tree, so reduced-motion changes are limited to the existing requested file unless a matching replacement is found during implementation.
- `HomeView_old.vue` remains untouched because it is explicitly marked as legacy.

## Success Criteria

- No `alert()` calls remain in the `AdminVenues` media-fetch flow.
- Toast progress animation uses `transform`, not `width`.
- Requested amber/gold theme replacements are applied in the listed production files without touching legacy routing.
- The specified accessibility fixes are present and keyboard-visible.
- Reduced-motion behavior is disabled under `prefers-reduced-motion: reduce` for the affected animation blocks.
- Validation completes with `python .agent/scripts/checklist.py .`, `bun run check`, and `bun run build`.
