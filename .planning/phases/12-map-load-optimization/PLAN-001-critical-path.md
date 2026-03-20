---
wave: 1
depends_on: []
files_modified:
  - src/components/map/MapboxContainer.vue
  - src/composables/map/useMapCore.js
autonomous: false
must_haves:
  - Map chunk deferred (not loaded until lazy route)
  - Critical composables only: useMapCore, useMapLayers (basic pins)
  - Non-critical deferred: useSentientMap, useMapHeatmap, useWeather, useDollyZoom, useFluidOverlay, useSDFClusters, useVibeEffects
  - Chunk loads in parallel with initial page shell
  - No blocking on Mapbox chunk load
---

# WAVE 1: Critical Path Only (0-2s Load)

## Goal
Separate critical map rendering from deferred features. Async-import non-critical composables so map becomes interactive within 2 seconds on 3G.

---

## Task 1.1: Defer useSentientMap Import

**File:** `src/components/map/MapboxContainer.vue`

**Current (blocking):**
```javascript
import { useSentientMap } from "../../composables/map/useSentientMap";
// ... at top level, blocks component load
const { dbg } = useSentientMap();
```

**Change to:**
```javascript
// Remove top-level import
let sentientMapInstance = null;

// Lazy init after idle
const initSentientMap = async () => {
  if (sentientMapInstance) return;
  try {
    const mod = await import("../../composables/map/useSentientMap");
    const { useSentientMap: initFn } = mod;
    sentientMapInstance = initFn();
  } catch (err) {
    console.warn("Sentient map failed to load:", err);
  }
};

// Call after map.on('idle')
map.value.on("idle", () => {
  requestIdleCallback(initSentientMap, { timeout: 3000 });
});
```

**Verification:**
- Map renders without useSentientMap
- Pin taps work (basic click, no sentient tracking)
- Sentient features load silently after idle
- No console errors

---

## Task 1.2: Defer useMapHeatmap, useWeather, useVibeEffects

**File:** `src/components/map/MapboxContainer.vue`

**Current (blocking):**
```javascript
import { useMapHeatmap } from "../../composables/map/useMapHeatmap";
import { useWeather } from "../../composables/useWeather";
import { useVibeEffects } from "../../composables/useVibeEffects";
```

**Change to:**
```javascript
// Remove top-level imports
let heatmapInstance = null, weatherInstance = null, vibeEffectsInstance = null;

const initDeferredFeatures = async () => {
  // Only if feature flags enabled
  if (featureFlagStore.isEnabled("enable_map_heatmap")) {
    try {
      const mod = await import("../../composables/map/useMapHeatmap");
      heatmapInstance = mod.useMapHeatmap();
    } catch (err) {
      console.warn("Heatmap failed:", err);
    }
  }

  if (featureFlagStore.isEnabled("enable_map_weather")) {
    try {
      const mod = await import("../../composables/useWeather");
      weatherInstance = mod.useWeather();
    } catch (err) {
      console.warn("Weather failed:", err);
    }
  }

  if (featureFlagStore.isEnabled("enable_vibe_effects")) {
    try {
      const mod = await import("../../composables/useVibeEffects");
      vibeEffectsInstance = mod.useVibeEffects();
    } catch (err) {
      console.warn("Vibe effects failed:", err);
    }
  }
};

map.value.on("idle", () => {
  requestIdleCallback(initDeferredFeatures, { timeout: 5000 });
});
```

**Verification:**
- Map renders without heatmap/weather/effects
- Features load after 2-3 seconds (after idle)
- Feature flags control loading
- No impact on LCP

---

## Task 1.3: Optimize useMapCore Initialization Order

**File:** `src/composables/map/useMapCore.js`

**Current overhead in initMap:**
```javascript
// These happen synchronously during map creation
ensurePinImagesLoaded();
ensureTerrainSourceConsistency();
// ... multiple event listeners
```

**Change to (defer non-critical):**
```javascript
const initMap = (initialCenter, initialZoom, style) => {
  // ... basic map setup

  // CRITICAL: Only these events for immediate interaction
  map.value.on("load", markMapReady);
  map.value.on("style.load", markMapReady);
  map.value.on("idle", markMapReady);

  // DEFERRED: Move expensive operations to idle
  map.value.on("idle", () => {
    // Load pin images asynchronously
    requestAnimationFrame(() => {
      ensurePinImagesLoaded();
      ensureTerrainSourceConsistency();
    });
  });
};
```

**Verification:**
- Map.isStyleLoaded() = true within 1.5s
- Pins render without images initially (fallback icon)
- Images load silently after
- Terrain consistency check deferred

---

## Task 1.4: Remove Terrain Source from Initial Style Load

**File:** `src/components/map/MapboxContainer.vue`

**Current:**
```javascript
const PRIMARY_STYLE_URL = "mapbox://styles/phirrr/cmlktq68u002601se295iazmm";
// This style includes terrain definition that doesn't have a source
```

**Change to:**
```javascript
// Check if style has terrain reference but no source
// If so, defer terrain setup to map.on('idle')

const handleStyleLoad = () => {
  const style = map.value.getStyle();
  if (style?.terrain?.source) {
    // Check if source exists
    if (!map.value.getSource(style.terrain.source)) {
      // Remove terrain temporarily; add back after sources are loaded
      map.value.setTerrain(null);

      map.value.once("idle", () => {
        // Re-enable terrain after sources ready
        if (map.value.getSource(style.terrain.source)) {
          map.value.setTerrain({ source: style.terrain.source, exaggeration: 1.5 });
        }
      });
    }
  }
};

map.value.on("style.load", handleStyleLoad);
```

**Verification:**
- Style loads without terrain initially
- No "Couldn't find terrain source" warnings
- Terrain renders after sources load (deferred)

---

## Task 1.5: Add Mapbox Chunk Preload Hint

**File:** `index.html`

**Current:**
```html
<!-- No preload hints for Mapbox -->
```

**Change to:**
```html
<head>
  <!-- Preload Mapbox chunk asynchronously (non-blocking) -->
  <link rel="prefetch" href="/static/js/async/mapbox.*.js" as="script" importance="low" />

  <!-- Preconnect to events.mapbox.com for realtime data -->
  <link rel="preconnect" href="https://events.mapbox.com" importance="low" />
</head>
```

**Verification:**
- Chunk prefetch doesn't block FCP
- Mapbox JS loads earlier in network timeline
- No render-blocking scripts added

---

## Task 1.6: Measure Baseline (FCP, LCP, Map Interactive Time)

**File:** `src/components/map/MapboxContainer.vue` (add performance marker)

**Change to:**
```javascript
// Mark when map is interactive (first idle after style load)
const reportMapInteractiveTime = () => {
  if (window.performance?.mark) {
    performance.mark("mapbox-interactive");

    const perfEntry = performance.measure(
      "mapbox-load-time",
      "navigationStart",
      "mapbox-interactive"
    );

    console.log(`📊 Map interactive time: ${perfEntry.duration.toFixed(0)}ms`);

    // Send to observability service
    frontendObservabilityService.log({
      event: "map_load_performance",
      duration: perfEntry.duration,
      timestamp: Date.now(),
    });
  }
};

map.value.once("idle", reportMapInteractiveTime);
```

**Verification:**
- Measure shows load time < 2000ms on 3G + slow CPU (Lighthouse)
- Data sent to observability service
- Can compare before/after in dashboard

---

## Success Criteria

- [ ] All non-critical composables deferred
- [ ] Map renders without Sentient, Heatmap, Weather, Vibe Effects
- [ ] Chunk loads asynchronously (non-blocking FCP)
- [ ] Map becomes interactive within 2 seconds
- [ ] All deferred features load silently after idle
- [ ] No console errors or warnings (terrain warning gone)
- [ ] Lighthouse LCP metric improves by 30%+

---

## Rollback Plan

If LCP/FCP regress or map breaks:
1. Revert composables to top-level imports
2. Move requestIdleCallback back to map.on('idle') (blocking)
3. Re-enable terrain source loading synchronously
4. Keep only useMapCore + useMapLayers critical
