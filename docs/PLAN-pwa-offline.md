# Overview
This plan outlines the architecture and implementation tasks for adding the PWA & Offline Strategy to VibeCity.

## Project Type
WEB

## Success Criteria
- Static assets and core application shell are cached (NetworkFirst for APIs, CacheFirst for CSS/JS/Icons).
- Offline banner is shown natively when `navigator.onLine` reads false.
- Users can toggle venue favorites while offline via an IDB sync queue that resolves upon reconnection.
- Interactive "Install VibeCity" floating banner customized for iOS and Android.

## Tech Stack
- **vite-plugin-pwa**: Core PWA generation.
- **idb / localforage**: For the synchronization queue and offline state storage.
- **Vue 3 + Pinia**: For global offline state and UI components.

## File Structure
- `rsbuild.config.ts`: Modifying PWA plugin configuration.
- `src/stores/offlineStore.ts`: Pinia store for offline connection status.
- `src/utils/syncQueue.ts`: IndexedDB queue logic.
- `src/components/ui/OfflineToast.vue`: Reusable Toast component for offline status.
- `src/components/ui/InstallBanner.vue`: Floating banner for PWA installation.

## Task Breakdown

### Task 1: Audit and Update PWA Config
- **Agent**: `frontend-specialist`
- **Skill**: `app-builder`
- **INPUT**: Current `rsbuild.config.ts`.
- **OUTPUT**: Updated config with NetworkFirst and CacheFirst strategies using Workbox.
- **VERIFY**: Service worker is generated properly upon `bun run build`.

### Task 2: Implement Offline Detection & Toast
- **Agent**: `frontend-specialist`
- **Skill**: `frontend-design`
- **INPUT**: Vue App Root.
- **OUTPUT**: A global listener and a non-intrusive toast that does not block the UI.
- **VERIFY**: Setting Network to Offline in DevTools triggers the toast.

### Task 3: Build IndexedDB Sync Queue
- **Agent**: `frontend-specialist`
- **Skill**: `clean-code`
- **INPUT**: Favorite venue logic.
- **OUTPUT**: Save offline requests in `idb` and process them when `online` event fires.
- **VERIFY**: Offline a favorite action → verify stored in IDB → reconnect → verify synced.

### Task 4: Install Banner Logic
- **Agent**: `frontend-specialist`
- **Skill**: `frontend-design`
- **INPUT**: User agent detection.
- **OUTPUT**: Floating "Install VibeCity" banner handling iOS Safari Add to Home Screen vs Android `beforeinstallprompt`.
- **VERIFY**: Banner renders correctly on respective mobile user agents.

## Phase X: Verification
- [x] Run Lint & Build (`bun run check && bun run build`)
- [x] Test offline behavior manually.
- [x] No purple hex codes / Standard templates used.

## ✅ PHASE X COMPLETE
- Lint: ✅ Pass
- Security: ✅ Pass
- Build: ✅ Success
- Date: 2026-02-27
