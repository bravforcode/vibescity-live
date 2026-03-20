---
wave: 3
depends_on: [PLAN-002]
files_modified:
  - src/components/map/MapboxContainer.vue
  - src/composables/map/useDollyZoom.js
  - src/composables/map/useFluidOverlay.js
  - src/composables/map/useSDFClusters.js
  - src/composables/map/useMapImagePrefetch.js
autonomous: false
must_haves:
  - Heavy engine composables (Dolly/Fluid/SDF) loaded async
  - Pin assets preloaded during chunk download (async decode)
  - Main map chunk parse/eval time reduced by 20%+
---

# WAVE 3: Parse/Eval Optimization (3-5s Load)

## Goal
Reduce JavaScript parse and evaluation overhead in the map chunk. Code-split non-essential visual effects (dolly zoom, fluid overlay, SDF clustering) and preload critical pin assets asynchronously to avoid image flash. Target: Achieve sub-5s map interactive on 3G with 4x CPU slowdown.

---

## Task 3.1: Code-Split useDollyZoom (Async Import)

**File:** `src/composables/map/useDollyZoom.js` + `src/components/map/MapboxContainer.vue`

**Current (blocks chunk evaluation):**
```javascript
// MapboxContainer.vue (top-level)
import { useDollyZoom } from "../../composables/map/useDollyZoom";

// In setup()
if (featureFlagStore.isEnabled("enable_dolly_zoom")) {
  const { activateDollyZoom } = useDollyZoom(map);
  // Eagerly initialized, even if feature disabled
}
```

**Change to (async + feature-gated):**
```javascript
// MapboxContainer.vue
let dollyZoomInstance = null;

const initDollyZoom = async () => {
  if (dollyZoomInstance) return; // Already loaded
  if (!featureFlagStore.isEnabled("enable_dolly_zoom")) return; // Feature disabled

  try {
    const mod = await import("../../composables/map/useDollyZoom");
    const { useDollyZoom } = mod;
    dollyZoomInstance = useDollyZoom(map);

    if (import.meta.env.DEV) {
      console.log("✅ Dolly Zoom initialized after idle");
    }
  } catch (err) {
    console.warn("Failed to load dolly zoom:", err);
  }
};

// Queue in idle phase
map.value.on("idle", () => {
  scheduleIdleTask(initDollyZoom, { timeout: 4000 });
});

// Cleanup on unmount
onUnmounted(() => {
  dollyZoomInstance = null;
});
```

**Code Size Impact:**
- Before: `useDollyZoom.js` parsed on main thread (8-12KB)
- After: Async chunk, loaded only if feature enabled
- Benefit: Main chunk -8KB, parse time -20ms on 4x slowdown

**Verification:**
- Map renders without dolly zoom on initial load
- Feature becomes available 2-3s after idle
- Disabling feature flag prevents load entirely
- No console errors if module fails to load
- Dolly interaction smooth once loaded (no jank)

---

## Task 3.2: Code-Split useFluidOverlay (Async Import)

**File:** `src/composables/map/useFluidOverlay.js` + `src/components/map/MapboxContainer.vue`

**Current (blocks chunk evaluation):**
```javascript
// MapboxContainer.vue
import { useFluidOverlay } from "../../composables/map/useFluidOverlay";

// Heavy computational canvas + WebGL init
if (featureFlagStore.isEnabled("enable_fluid_overlay")) {
  const { initFluidLayer, cleanup } = useFluidOverlay(map);
}
```

**Change to (async + lazy init):**
```javascript
// MapboxContainer.vue
let fluidOverlayInstance = null;

const initFluidOverlay = async () => {
  if (fluidOverlayInstance) return;
  if (!featureFlagStore.isEnabled("enable_fluid_overlay")) return;

  try {
    // Dynamic import only when needed
    const mod = await import("../../composables/map/useFluidOverlay");
    const { useFluidOverlay } = mod;

    fluidOverlayInstance = useFluidOverlay(map);
    await fluidOverlayInstance.initFluidLayer(); // Async init

    if (import.meta.env.DEV) {
      console.log("✅ Fluid Overlay initialized");
    }
  } catch (err) {
    console.warn("Fluid overlay failed to initialize:", err);
    fluidOverlayInstance = null;
  }
};

// Queue after idle + all other critical features
map.value.on("idle", () => {
  // Lower priority than sentient/heatmap
  scheduleIdleTask(initFluidOverlay, { timeout: 5000 });
});

onUnmounted(() => {
  if (fluidOverlayInstance?.cleanup) {
    fluidOverlayInstance.cleanup();
  }
  fluidOverlayInstance = null;
});
```

**Code Size Impact:**
- Before: useFluidOverlay.js parsed on main (15-20KB)
- After: Async chunk, deferred to idle
- Benefit: Main chunk -15KB, parse time -40ms

**Verification:**
- Map renders without fluid effect initially
- Fluid layer appears after 3-5s without blocking interaction
- Feature flag controls initialization
- Canvas cleanup prevents memory leaks
- No GPU stalls on initial pin interaction

---

## Task 3.3: Code-Split useSDFClusters (Async Import)

**File:** `src/composables/map/useSDFClusters.js` + `src/components/map/MapboxContainer.vue`

**Current (blocks chunk evaluation):**
```javascript
// MapboxContainer.vue
import { useSDFClusters } from "../../composables/map/useSDFClusters";

// Heavy SDF glyph rendering + custom paint
if (featureFlagStore.isEnabled("enable_sdf_clusters")) {
  const { updateClusterVisuals } = useSDFClusters(map);
}
```

**Change to (async + event-driven):**
```javascript
// MapboxContainer.vue
let sdfClustersInstance = null;

const initSDFClusters = async () => {
  if (sdfClustersInstance) return;
  if (!featureFlagStore.isEnabled("enable_sdf_clusters")) return;

  try {
    const mod = await import("../../composables/map/useSDFClusters");
    const { useSDFClusters } = mod;

    sdfClustersInstance = useSDFClusters(map);

    if (import.meta.env.DEV) {
      console.log("✅ SDF Clusters initialized");
    }
  } catch (err) {
    console.warn("SDF clusters failed to load:", err);
    sdfClustersInstance = null;
  }
};

// Queue in idle (lowest priority visual effect)
map.value.on("idle", () => {
  scheduleIdleTask(initSDFClusters, { timeout: 5000 });
});

onUnmounted(() => {
  sdfClustersInstance = null;
});
```

**Code Size Impact:**
- Before: useSDFClusters.js parsed (12-18KB)
- After: Async chunk
- Benefit: Main chunk -15KB, parse time -35ms

**Verification:**
- Cluster pins render with default styling initially
- SDF visual enhancement appears after idle
- Feature flag prevents load if disabled
- No render blocking during SDF initialization
- Cluster click interactions work before SDF loads (basic styling)

---

## Task 3.4: Consolidate Heavy Engine Composables Into Async Queue

**File:** `src/components/map/MapboxContainer.vue`

**Create unified deferred engine init:**
```javascript
import { useMapIdleFeatures } from "../../composables/map/useMapIdleFeatures";

const { scheduleIdleTask, executeIdleTasksOnce } = useMapIdleFeatures();

// === CRITICAL (before idle) ===
const { addCriticalLayers } = useMapLayers(map);
map.value.on("load", addCriticalLayers);

// === HIGH-PRIORITY DEFERRED (run after idle, baseline experience) ===
scheduleIdleTask(async () => {
  const mod = await import("../../composables/map/useSentientMap");
  const { useSentientMap } = mod;
  sentientMapInstance = useSentientMap();
}, { timeout: 2000 });

scheduleIdleTask(async () => {
  const mod = await import("../../composables/map/useMapHeatmap");
  if (featureFlagStore.isEnabled("enable_map_heatmap")) {
    const { useMapHeatmap } = mod;
    heatmapInstance = useMapHeatmap(map);
  }
}, { timeout: 3000 });

// === MEDIUM-PRIORITY DEFERRED (run after high-priority) ===
scheduleIdleTask(() => {
  addDeferredLayers();
}, { timeout: 2000 });

scheduleIdleTask(async () => {
  const mod = await import("../../composables/map/useDollyZoom");
  if (featureFlagStore.isEnabled("enable_dolly_zoom")) {
    const { useDollyZoom } = mod;
    dollyZoomInstance = useDollyZoom(map);
  }
}, { timeout: 4000 });

// === LOW-PRIORITY DEFERRED (visual polish) ===
scheduleIdleTask(async () => {
  const mod = await import("../../composables/map/useFluidOverlay");
  if (featureFlagStore.isEnabled("enable_fluid_overlay")) {
    const { useFluidOverlay } = mod;
    fluidOverlayInstance = useFluidOverlay(map);
    await fluidOverlayInstance.initFluidLayer();
  }
}, { timeout: 5000 });

scheduleIdleTask(async () => {
  const mod = await import("../../composables/map/useSDFClusters");
  if (featureFlagStore.isEnabled("enable_sdf_clusters")) {
    const { useSDFClusters } = mod;
    sdfClustersInstance = useSDFClusters(map);
  }
}, { timeout: 5000 });

// === EXECUTE ALL IDLE TASKS ===
map.value.on("idle", () => {
  executeIdleTasksOnce(map);
});
```

**Verification:**
- Main map chunk parse time reduced by 40-50ms (4x slowdown)
- Deferred composables load in parallel (requestIdleCallback)
- Feature flags control which modules are loaded
- Priority order respected (sentient/heatmap before visual effects)
- No deadlock or race conditions in async queue

---

## Task 3.5: Preload Pin Assets During Chunk Download

**File:** `src/composables/map/useMapImagePrefetch.js` (NEW) + `src/components/map/MapboxContainer.vue`

**Create asset prefetch composable:**
```javascript
import { ref } from "vue";

const CRITICAL_PIN_IMAGES = {
  "pin-normal": "/images/pins/pin-gray.png",
  "pin-blue": "/images/pins/pin-blue.png",
  "pin-purple": "/images/pins/pin-purple.png",
  "pin-red": "/images/pins/pin-red.png",
};

export function useMapImagePrefetch() {
  const prefetchedImages = ref(new Set());
  const prefetchErrors = ref([]);

  const prefetchImageAsync = (url) => {
    return new Promise((resolve) => {
      if (!url || typeof url !== "string") {
        resolve(null);
        return;
      }

      const img = new Image();
      img.src = url;

      // Async decode for non-blocking render
      if ("decode" in img) {
        img
          .decode()
          .then(() => {
            prefetchedImages.value.add(url);
            resolve(true);
          })
          .catch((err) => {
            prefetchErrors.value.push({ url, error: err });
            resolve(false);
          });
      } else {
        // Fallback: onload
        img.onload = () => {
          prefetchedImages.value.add(url);
          resolve(true);
        };
        img.onerror = () => {
          prefetchErrors.value.push({ url, error: "onload failed" });
          resolve(false);
        };
      }
    });
  };

  const prefetchCriticalPins = async () => {
    // Start as soon as component mounts (before map init if possible)
    const promises = Object.values(CRITICAL_PIN_IMAGES).map((url) =>
      prefetchImageAsync(url)
    );

    const results = await Promise.allSettled(promises);

    if (import.meta.env.DEV) {
      const loaded = results.filter((r) => r.status === "fulfilled" && r.value).length;
      console.log(`🖼️ Prefetched ${loaded}/${Object.keys(CRITICAL_PIN_IMAGES).length} pin images`);
    }

    return results;
  };

  const isPrefetched = (url) => prefetchedImages.value.has(url);

  return {
    prefetchedImages,
    prefetchErrors,
    prefetchImageAsync,
    prefetchCriticalPins,
    isPrefetched,
  };
}
```

**In MapboxContainer.vue:**
```javascript
import { useMapImagePrefetch } from "../../composables/map/useMapImagePrefetch";

const { prefetchCriticalPins } = useMapImagePrefetch();

// Start prefetch BEFORE map.init() (in parallel with chunk download)
const prefetchTask = prefetchCriticalPins();

// Wait for map init
const { initMap } = useMapCore(containerRef);
initMap(initialCenter, initialZoom, styleUrl);

// Ensure prefetch completes before first pin render
map.value.once("idle", async () => {
  await prefetchTask; // This likely completes long before idle
  addCriticalLayers(); // Pins will have images ready
});

// Fallback: styleimagemissing event still works if prefetch fails
map.value.on("styleimagemissing", (e) => {
  const id = e.id;
  const url = PIN_IMAGES[id];
  if (url && !map.value.hasImage(id)) {
    // Late load (degraded experience but functional)
    map.value.loadImage(url, (error, image) => {
      if (!error && image) {
        map.value.addImage(id, image);
      }
    });
  }
});
```

**Performance Timeline:**
- t=0ms: Chunk starts downloading
- t=200ms (parallel): Prefetch task starts (async image decode, non-blocking)
- t=800ms: Chunk evaluates + map.init() begins
- t=1500ms: Style loads, critical layers added (images already in decoder cache)
- t=2000ms: Map idle, deferred features queue executes
- t=3500ms+: Visual effects appear

**Verification:**
- Pin images decode asynchronously (no main thread blocking)
- Prefetch starts before map.init() (maximum parallelism)
- If prefetch succeeds, no late-load image flash
- If prefetch fails, fallback to styleimagemissing handler
- DevTools Network tab shows image decode in parallel

---

## Task 3.6: Add Parse Time Instrumentation

**File:** `src/components/map/MapboxContainer.vue`

**Add performance markers in component:**
```javascript
// MapboxContainer.vue - measure parse overhead
import { defineComponent } from "vue";

const startParseTime = performance.now();

export default defineComponent({
  name: "MapboxContainer",
  setup() {
    // Mark when component setup completes
    const endParseTime = performance.now();
    const parseOverhead = endParseTime - startParseTime;

    if (import.meta.env.DEV) {
      console.log(`⏱️ MapboxContainer parse + setup: ${parseOverhead.toFixed(1)}ms`);
    }

    // Send to observability
    window.__mapMetrics = window.__mapMetrics || {};
    window.__mapMetrics.parseOverhead = parseOverhead;

    // Rest of setup...
  },
});
```

**Measure baseline before Wave 3:**
1. Run Lighthouse on localhost with DevTools Fast 3G + 4x CPU slowdown
2. Record parse time baseline in `.planning/phases/12-map-load-optimization/baseline-parse.json`
3. Re-run after Wave 3 execution
4. Compare: Target -20% minimum improvement

**Verification:**
- Baseline parse time recorded before changes
- Parse time re-measured after code splitting
- Improvement tracked: -20% minimum target
- Bundle size analyzer shows chunk splits working

---

## Success Criteria

- [ ] useDollyZoom, useFluidOverlay, useSDFClusters loaded async (not on main chunk)
- [ ] Main map chunk parse time reduced by 20-40ms minimum (4x slowdown)
- [ ] Bundle size: main chunk reduced by 40KB+ (compressed)
- [ ] Pin assets prefetched before first map idle
- [ ] No image flash when pins render (prefetch cache hit)
- [ ] Deferred composables load in correct priority order
- [ ] Feature flags control which modules are loaded
- [ ] No console errors during async load/init
- [ ] Lighthouse shows FCP < 2.5s, LCP < 4.0s (3G + 4x CPU)

---

## Rollback Plan

If parse time increases or features break:
1. Revert Task 3.1-3.3: Restore eager imports for all three composables
2. Revert Task 3.5: Restore sync image loading in ensurePinImagesLoaded()
3. Keep Task 3.6 instrumentation (bundle analysis is useful for future optimization)
4. Verify Lighthouse metrics return to pre-Wave-3 baseline
5. Investigate why async split increased parse overhead (rare)

