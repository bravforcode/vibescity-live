# 2026-03-27 Refresh Pins Refactor And Browser Verification

## Goal

Refactor `refreshPins()` in `src/components/map/MapLibreContainer.vue` into smaller named helpers without changing pin behavior, then verify aggregate, selection, and status-refresh behavior in a real browser before this map tranche is treated as merge-ready.

## Scope

- `src/components/map/MapLibreContainer.vue`
- Optional small supporting changes only if the refactor exposes a clear helper boundary elsewhere
- `docs/runbooks/agent-operating-memory.md`

## Refactor Boundaries

- Keep `refreshPins()` as the orchestration entrypoint.
- Extract pure or mostly-pure helper subfunctions for:
  - feature factories and state normalization
  - fallback / aggregate feature construction
  - feature application to the source
  - RPC-vs-local refresh branches
- Avoid broad behavior changes, rendering-mode rewrites, or moving logic into new files unless the local refactor proves too crowded.

## Browser Verification Targets

- Aggregate transition:
  - low zoom shows aggregate behavior
  - drilldown / zoom-in restores denser per-viewport feature behavior
- Selection transition:
  - selecting a venue keeps popup / drawer / selected-pin behavior intact
  - selected-pin filter and focus visuals still respond
- Status transition:
  - minute-tick refresh keeps local marker state updates working without a forced RPC path

## Validation

- `npx biome check src/components/map/MapLibreContainer.vue`
- `bun run check`
- `bun run build`
- Real browser verification against the local dev app with Playwright automation and recorded outcomes

## Outcomes

- `refreshPins()` is now reduced to orchestration while helper subfunctions handle feature factories, aggregate fallback construction, and source application.
- Browser verification used the rsbuild-announced host `http://172.27.16.1:5175` because `localhost` / `127.0.0.1` on the same port resolved to another local app during this session.
- Aggregate verification in a real browser succeeded when driven deterministically through the live `MapLibreContainer` instance:
  - venue baseline at zoom `17.5` produced `27` non-aggregate features
  - low zoom at `5` produced a single `country` aggregate feature
- Minute-tick verification succeeded:
  - advancing `nowTick` in-browser did not emit any `get_map_pins` / province aggregate RPC requests
- Selection verification partially succeeded:
  - clicking a real map venue button opened the popup and pushed the venue route
  - the same dev session later showed `ErrorBoundary` / WebGL-context-loss noise after the route transition, so one more clean browser pass is still recommended before calling the whole tranche merge-ready
