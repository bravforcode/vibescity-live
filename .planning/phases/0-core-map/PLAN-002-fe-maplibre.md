---
plan: "0-002"
wave: 2
autonomous: true
objective: "Swap mapbox-gl → maplibre-gl, env-driven style URL, update shopService fallback to /venues, wire /hot-roads polling with guardrails"
files_modified:
  - package.json
  - src/composables/map/useMapCore.js
  - src/components/map/MapboxContainer.vue
  - src/composables/map/useMapMarkers.js
  - src/services/shopService.js
task_count: 5
---

# Plan 0-002: FE MapLibre Swap + API Wiring

## Objective
Replace mapbox-gl with maplibre-gl (API-compatible drop-in).
Wire shopService.getMapPins() → GET /venues (fallback to RPC).
Wire MapboxContainer /hot-roads polling every 30s with guardrails:
- diff-only (send `since=` snapshot_id)
- pause when document.hidden
- backoff 60-120s when offline or low-power

## Task 1 — package.json: swap SDK

Remove `mapbox-gl`, add `maplibre-gl`.
Run `bun install` to update bun.lock.

```json
// remove: "mapbox-gl": "...",
// add:    "maplibre-gl": "^4.7.0"
```

Also update any `@types/mapbox-gl` → remove (maplibre ships its own types).

## Task 2 — useMapCore.js: import + style

- Change `import mapboxgl from 'mapbox-gl'` → `import maplibregl from 'maplibre-gl'`
- Change CSS import to `import 'maplibre-gl/dist/maplibre-gl.css'`
- Remove `mapboxgl.accessToken = ...` line (maplibre doesn't need token for non-Mapbox tiles)
- Style URL from env:
  ```js
  const MAP_STYLE = import.meta.env.VITE_MAP_STYLE_URL
    || import.meta.env.VITE_MAP_STYLE_FALLBACK_URL
    || 'https://demotiles.maplibre.org/style.json'  // safe public fallback
  ```
- All `mapboxgl.` → `maplibregl.` references

## Task 3 — MapboxContainer.vue: CSS import + hot-roads polling

- Update CSS import to maplibre-gl
- Remove any Mapbox token references
- Add hot-roads polling composable (inline, scoped to component):

```js
// hot-roads polling with guardrails
const hotRoadsSnapshotId = ref(null)
let hotRoadsTimer = null
let hotRoadsBackoff = 30_000  // ms

async function pollHotRoads() {
  if (document.hidden) return  // pause when backgrounded
  if (!navigator.onLine) {
    hotRoadsBackoff = Math.min(hotRoadsBackoff * 2, 120_000)
    return
  }
  const since = hotRoadsSnapshotId.value ? `&since=${hotRoadsSnapshotId.value}` : ''
  try {
    const res = await apiFetch(`/api/v1/hot-roads?bbox=${currentBbox()}${since}`)
    if (!res.unchanged) {
      hotRoadsSnapshotId.value = res.snapshot_id
      consumeHotspotUpdate(res.segments)
    }
    hotRoadsBackoff = 30_000  // reset on success
  } catch {
    hotRoadsBackoff = Math.min(hotRoadsBackoff * 2, 120_000)
  }
}

function scheduleHotRoads() {
  hotRoadsTimer = setTimeout(async () => {
    await pollHotRoads()
    scheduleHotRoads()
  }, hotRoadsBackoff)
}

// Pause on background, resume on foreground
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pollHotRoads()
})

onMounted(() => scheduleHotRoads())
onUnmounted(() => clearTimeout(hotRoadsTimer))
```

Helper `currentBbox()` — returns `minLng,minLat,maxLng,maxLat` from current map bounds.

## Task 4 — useMapMarkers.js: import swap only

```js
// before
import mapboxgl from 'mapbox-gl'
// after
import maplibregl from 'maplibre-gl'
```

All `mapboxgl.` → `maplibregl.` (Popup, Marker, LngLatBounds are API-compatible).

## Task 5 — shopService.js: fallback wiring

`getMapPins(bbox, zoom, limit)`:
```js
export async function getMapPins(bbox, zoom = 12, limit = 200) {
  try {
    const params = new URLSearchParams({
      bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
      zoom,
      limit,
    })
    const res = await apiFetch(`/api/v1/venues?${params}`)
    // Normalize to existing caller shape: array of venue objects
    return res.venues ?? []
  } catch {
    // Fallback: existing Supabase RPC (fail-open)
    const { data } = await supabase.rpc('get_map_pins', {
      min_lng: bbox.minLng, min_lat: bbox.minLat,
      max_lng: bbox.maxLng, max_lat: bbox.maxLat,
      zoom_level: zoom, max_results: limit,
    })
    return data ?? []
  }
}
```

Return shape must remain identical to current callers (array of venue objects).

## Note: WeatherLayer.js

Only requires import swap `mapbox-gl` → `maplibre-gl`. No behavior changes.
Include in this wave as part of Task 4 sweep.

## Success Criteria
- [ ] `bun run check` passes (no TS/lint errors)
- [ ] `bun run build` succeeds, no mapbox-gl in bundle
- [ ] `bun run test:e2e:smoke` map mounts, pan/zoom/rotate stable
- [ ] `/hot-roads` polling fires after mount, pauses on tab hide
- [ ] `getMapPins` falls back to RPC when backend unreachable
