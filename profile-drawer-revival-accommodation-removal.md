# Profile Drawer Revival And Accommodation Modal Removal

## Goal

- Restore `ProfileDrawer`
- Upgrade it to a smoother, clearer, more premium mobile UX
- Remove venue detail modal opening for `Accommodation`-type venues
- Clean dead `profile` / `achievement` locale usage introduced by the regression and old drawer flow

## Assumptions

- "accommodation modal" means the standard venue detail modal (`VibeModal`) when the selected venue category/type resolves to accommodation-style content such as hotel, hostel, guest house, or lodging
- `ProfileDrawer` should remain available both as an explicit user action and as the auth-required prompt entry point

## Implementation

1. Restore drawer state wiring in `useUILogic`, `useAppLogic`, `AppModals`, and `HomeView`
2. Recreate `ProfileDrawer.vue` with improved hierarchy, motion, accessibility, and performance
3. Add an explicit profile entry point from the sidebar so the drawer is actually usable
4. Add an accommodation-category guard before `VibeModal` opens
5. Remove or normalize stale profile/achievement locale usage where safe
6. Validate with `bun run check`, `bun run build`, and `python .agent/scripts/checklist.py .`
