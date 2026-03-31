# Home Real Trace And Long Task Tuning

## Goal

- Profile the real Home experience in Chromium against the built app, not just static heuristics.
- Capture repeatable long-task evidence for the home feed scroll, map readiness, and shop detail open flow.
- Tune the remaining runtime hotspots directly from trace evidence until Home feels smoother on an actual device/browser path.

## Baseline Flow

1. Build the app with the current Home/runtime code.
2. Serve the built output locally.
3. Run a scripted Chromium profile that:
   - opens `/`
   - waits for Home shell + map shell
   - scrolls the bottom feed
   - opens a centered venue detail
   - captures browser trace + in-app perf metrics
4. Inspect the biggest main-thread blocks and patch the responsible code.

## Likely Hotspots

- `src/composables/useAppLogic.js`
- `src/composables/useBottomFeedLogic.js`
- `src/composables/useScrollSync.js`
- `src/components/feed/BottomFeed.vue`
- `src/components/map/MapLibreContainer.vue`
- `src/views/HomeView.vue`

## Acceptance

- Real trace artifact saved under `reports/performance/`.
- No repeated long-task spikes from the same avoidable Home interaction path.
- Feed scroll and detail-open flow show fewer main-thread blocks than the baseline.
- Validation rerun after the tuning patch set.
