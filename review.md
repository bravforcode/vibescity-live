# VibeCity.live – Code Review (qodo)

Date: 2026-01-24

This review is based on repository inspection + running the repo linter.

## Executive summary
- Solid foundation: Vue 3 + `<script setup>` + Pinia + composables/services separation.
- Main risk: `src/App.vue` is a “god component” and mixes UI, orchestration, networking, timers, gesture handling, and SEO.
- Lint is currently configured to fail CI on several stylistic patterns (assignment-in-expression, optional chaining suggestions, template literal preference). Many are easy fixes; vendor snippets should be excluded.
- There are also several areas where runtime correctness can drift (interval refresh logic, URL sync cleanup, mutating reactive shop objects).

## What was fixed during review
- `src/App.vue`: removed duplicate icon imports from `lucide-vue-next` that caused parsing failures.
- `src/App.vue`: fixed/modernized a few lint-blocking patterns:
  - `selectedShopCoords` uses optional chaining.
  - `navigator.geolocation.getCurrentPosition` callback changed to a block body to avoid assignment-in-expression.
  - `.then((d) => rawShops.value = d)`-style assignments moved to block bodies.

## Current lint status
Running `npm run lint` still reports multiple errors. Many are fixable via small refactors or configuration updates.

### Recommend: treat vendor code separately
Files like `src/clarity_snippet.html` are vendor snippets. Linting them produces noise and encourages modifying vendor code.
- Recommended: exclude from lint (Biome ignore, lint script glob, or move into `public/` and exclude).

## High-priority issues & recommendations

### 1) `src/App.vue` complexity (“god component”)
Symptoms:
- Contains: boot/data fetching, timers, URL syncing, metadata/SEO, map focus logic, gesture logic, carousel sync engine, modal orchestration.

Risks:
- High regression surface.
- Hard to test.
- Hard to reason about lifecycle cleanup.

Recommended refactor (incremental, low risk):
- `useDataBoot()`
  - initial fetches, retry, loading state, refresh timers.
- `useSelection()`
  - `activeShopId` syncing, `applyShopSelection`, deep-link handling.
- `useCarouselSync()`
  - center detection, scroll locks, rAF throttling.
- `useGlobalGestures()`
  - edge swipe open drawer.
- `useMetadata()`
  - title/meta description updates.

### 2) Interval refresh logic robustness
Current logic refreshes “every minute, if minute % 30 === 0”.
- If the timer drifts, it can run multiple times while minute remains 0/30.

Recommendation:
- Track `lastRefreshedSlot` (e.g., `Math.floor(Date.now()/1800000)`), refresh only if changed.

### 3) Avoid mutating reactive shop objects
`handleCardClick` mutates `shop.initialTime`.
- Shops appear to come from computed projections, and may be shared across derived lists.

Recommendation:
- Store `initialTimeByShopId` as `ref(new Map())` or plain object keyed by id.

### 4) URL sync should clear `shop` when deselected
Current watcher sets `?shop=` when selected but does not remove it when `activeShopId` becomes null.

Recommendation:
- When `newId` is falsy, delete the param and call `replaceState`.

### 5) External link security
- `window.open(url, "_blank")` and `<a target="_blank">` should use `noopener,noreferrer`.

Recommendation:
- `window.open(url, "_blank", "noopener,noreferrer")`
- `<a target="_blank" rel="noopener noreferrer">`

## Lint issues: what to fix vs. what to configure

### Fix in code (recommended)
- `src/components/ui/BottomNav.vue`: `Map` icon name shadows global `Map`.
  - Use `import { Map as MapIcon }`.
- Assignment-in-expression warnings (style):
  - Replace `() => (ref.value = x)` with `() => { ref.value = x; }`
  - Replace `return (x = ...)` with two statements.
- Optional chaining suggestions:
  - Prefer `shop?.Floor` etc.
- Template literal suggestions:
  - Prefer ```${a}${b}``` vs `a + b` for clarity.

### Configure / exclude
- Vendor snippets (`clarity_snippet.html`) should be excluded.
- If you intentionally prefer expression-style assignment, update Biome config to downgrade those rules.

## Testing / quality gates
- Only an example Playwright spec exists.

Recommendations:
- Add smoke E2E: app loads, map container renders, selecting a shop opens modal/drawer.
- Add unit tests for:
  - `useShopFilters`
  - selection/deeplink logic
  - distance/status utils

## Performance notes
- Good: rAF throttling in horizontal scroll handler, use of `v-memo` in heavy lists.
- Consider:
  - Debounced search computation if dataset grows.
  - Ensure async components provide loading/error states (avoid blank UI on slow networks).

## Quick checklist (actionable)
1. Exclude `src/clarity_snippet.html` from lint.
2. Fix `BottomNav.vue` icon import shadowing.
3. Convert remaining assignment-in-expression occurrences flagged by lint.
4. Add guard to 30-min refresh logic.
5. Stop mutating shop objects; store derived fields separately.
6. Clear `shop` query param on deselection.
7. Add `rel="noopener noreferrer"` to all external `_blank` links.
