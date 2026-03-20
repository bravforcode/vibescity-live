---
wave: 2
depends_on: [PLAN-001]
files_modified:
  - src/composables/map/useMapLayers.js
  - src/components/map/MapboxContainer.vue
  - src/composables/map/useMapCore.js
autonomous: false
must_haves:
  - Critical layers (pins/hitbox/select) render without deferred layers
  - Terrain/fog/custom style mutations deferred to idle
  - Network waterfall shows reduced initial bytes
---

# WAVE 2: Network Optimization (1.5-3s Load)

## Goal
Reduce initial network payload and defer non-rendering layer operations. Separate layer loading: pins + hitbox (critical) vs. heat/terrain/visual enhancements (deferred). Target: Further reduce time-to-interactivity by eliminating style mutation overhead before first paint.

---

## Task 2.1: Split useMapLayers into Critical + Deferred

**File:** `src/composables/map/useMapLayers.js`

**Current (blocks first paint):**
```javascript
export function useMapLayers(map) {
  const addMapLayers = () => {
    // All layers added synchronously
    map.addLayer({
      id: "pin-cluster",
      type: "circle",
      source: "pins",
      // ... cluster config
    });

    map.addLayer({
      id: "heatmap-layer",
      type: "heatmap",
      source: "heatmap-data",
      // ... heatmap paint
    });

    map.addLayer({
      id: "terrain-visual",
      type: "line",
      source: "terrain-source",
      // ... terrain lines
    });

    // ... 20+ more layers
  };

  return { addMapLayers };
}
```

**Change to (split at source):**
```javascript
export function useMapLayers(map) {
  // CRITICAL: Only pin selection + interaction layers
  const addCriticalLayers = () => {
    // Add in dependency order
    map.addLayer({
      id: "pin-hitbox",
      type: "circle",
      source: "pins",
      paint: { "circle-radius": 20, "circle-opacity": 0 }, // Invisible target
    });

    map.addLayer({
      id: "pin-cluster",
      type: "circle",
      source: "pins",
      paint: { "circle-radius": 8, "circle-color": "#99ccff" },
      filter: ["has", "point_count"],
    });

    map.addLayer({
      id: "pin-symbol",
      type: "symbol",
      source: "pins",
      layout: { "icon-image": "pin-normal", "icon-size": 0.8 },
      filter: ["!", ["has", "point_count"]],
    });
  };

  // DEFERRED: Visual polish, terrain, heatmap
  const addDeferredLayers = () => {
    // Heatmap
    if (map.getSource("heatmap-data")) {
      map.addLayer({
        id: "heatmap-layer",
        type: "heatmap",
        source: "heatmap-data",
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "mag"], 0, 0, 6, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
        },
      });
    }

    // Terrain visual enhancement
    if (map.getSource("terrain-source")) {
      map.addLayer({
        id: "terrain-visual",
        type: "line",
        source: "terrain-source",
        paint: { "line-color": "#999", "line-width": 0.5, "line-opacity": 0.3 },
      });
    }

    // 3D building/SDF cluster layers
    if (map.getSource("buildings")) {
      map.addLayer({
        id: "building-extrusion",
        type: "fill-extrusion",
        source: "buildings",
        paint: {
          "fill-extrusion-color": "#aaa",
          "fill-extrusion-height": ["get", "height"],
        },
      });
    }
  };

  return {
    addCriticalLayers,
    addDeferredLayers,
  };
}
```

**Verification:**
- Map renders with only pin-hitbox, pin-cluster, pin-symbol visible
- No heatmap/terrain/building layers added until deferred phase
- Layer IDs in dependency order (hitbox before symbol)
- Deferred layers added without errors if source missing

---

## Task 2.2: Defer Heavy Style Augmentations (Terrain/Fog/Atmosphere)

**File:** `src/composables/map/useMapCore.js`

**Current (blocks idle):**
```javascript
const ensureTerrainSourceConsistency = () => {
  if (!map.value || typeof map.value.getStyle !== "function") return;
  try {
    const style = map.value.getStyle();
    const terrainSourceId = style?.terrain?.source;
    if (!terrainSourceId) return;
    if (map.value.getSource(terrainSourceId)) return;
    map.value.setTerrain?.(null); // ← Happens on every style transition
    // ... warn
  } catch {
    // Ignore style transition races.
  }
};

// Called on load/style.load/styledata (3 events!)
map.value.on("load", ensureTerrainSourceConsistency);
map.value.on("style.load", ensureTerrainSourceConsistency);
map.value.on("styledata", ensureTerrainSourceConsistency);
```

**Change to (defer terrain setup):**
```javascript
export function useMapAtmosphere(map) {
  const applyTerrainAndAtmosphere = async () => {
    if (!map.value) return;
    try {
      const style = map.value.getStyle();
      const terrainSourceId = style?.terrain?.source;

      if (!terrainSourceId) return;

      // Only apply if source exists
      if (!map.value.getSource(terrainSourceId)) {
        if (import.meta.env.DEV) {
          console.warn(`Terrain source "${terrainSourceId}" not found, skipping.`);
        }
        return;
      }

      // Re-enable terrain with exaggeration
      map.value.setTerrain({
        source: terrainSourceId,
        exaggeration: 1.5,
      });

      // Optional: add fog for 3D perspective
      if (featureFlagStore.isEnabled("enable_map_fog")) {
        map.value.setFog({
          color: "rgba(200, 200, 220, 0.1)",
          "high-color": "rgba(100, 100, 150, 0.2)",
          "horizon-blend": 0.05,
        });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("Failed to apply terrain/atmosphere:", err);
      }
    }
  };

  return { applyTerrainAndAtmosphere };
}
```

**In MapboxContainer.vue (call from idle queue):**
```javascript
import { useMapAtmosphere } from "../../composables/map/useMapAtmosphere";

// During map init, remove atmosphere check from critical path
const { applyTerrainAndAtmosphere } = useMapAtmosphere(map);

// After useMapCore.initMap() completes
map.value.on("idle", () => {
  requestIdleCallback(
    async () => {
      await applyTerrainAndAtmosphere();
    },
    { timeout: 3000 }
  );
});
```

**Verification:**
- Map renders with basic pinning/terrain removed on load
- Terrain is silently applied after idle (no console warnings)
- Fog layer only added if feature flag enables
- No visual flicker when terrain is re-enabled
- Network tab shows reduced initial style payload

---

## Task 2.3: Chain Critical + Deferred Layer Execution

**File:** `src/components/map/MapboxContainer.vue`

**Current (all at once):**
```javascript
const { addMapLayers } = useMapLayers(map);
map.value.on("load", addMapLayers);
```

**Change to (split at setup phase):**
```javascript
import { useMapLayers } from "../../composables/map/useMapLayers";
import { useMapAtmosphere } from "../../composables/map/useMapAtmosphere";

const { addCriticalLayers, addDeferredLayers } = useMapLayers(map);
const { applyTerrainAndAtmosphere } = useMapAtmosphere(map);

// CRITICAL: Layers must be added before first interaction
map.value.on("load", () => {
  addCriticalLayers();

  // Ensure pins are visible
  if (!map.value.isStyleLoaded()) {
    map.value.once("style.load", addCriticalLayers);
  }
});

// DEFERRED: Only after map idle + all sources loaded
map.value.on("idle", () => {
  requestIdleCallback(
    () => {
      try {
        addDeferredLayers();
        applyTerrainAndAtmosphere();
      } catch (err) {
        console.warn("Deferred layer setup failed:", err);
      }
    },
    { timeout: 3000 }
  );
});
```

**Verification:**
- Critical layers (pins) render in < 1.5s
- Deferred layers added after map idle without flicker
- Pin selection works before deferred layers load
- No double-layer-add errors in console
- Deferred setup silently fails if sources missing (graceful)

---

## Task 2.4: Optimize Initial Style Mutation (Reduce Repaints)

**File:** `src/composables/map/useMapCore.js`

**Current (style repaints on every event):**
```javascript
// These trigger full style re-evaluation
map.value.on("load", ensurePinImagesLoaded);
map.value.on("style.load", ensurePinImagesLoaded);

map.value.on("load", ensureTerrainSourceConsistency);
map.value.on("style.load", ensureTerrainSourceConsistency);
map.value.on("styledata", ensureTerrainSourceConsistency);
```

**Change to (single-fire + deferred):**
```javascript
let pinnedImagesEnsured = false;

// CRITICAL: Load pin images only once after style stabilizes
map.value.once("style.load", () => {
  if (!pinnedImagesEnsured) {
    pinnedImagesEnsured = true;
    // Async, non-blocking
    requestAnimationFrame(ensurePinImagesLoaded);
  }
});

// DEFERRED: Terrain check only after idle
let terrainChecked = false;
map.value.on("idle", () => {
  if (!terrainChecked) {
    terrainChecked = true;
    requestIdleCallback(() => {
      // Moved to useMapAtmosphere
    }, { timeout: 3000 });
  }
});

// Resume terrain check only if style changes
map.value.on("style.load", () => {
  terrainChecked = false; // Allow re-check on new style
});
```

**Verification:**
- `ensurePinImagesLoaded()` called only once after style ready (not 3x)
- Terrain consistency check moved to idle phase
- No redundant style mutations on style transitions
- Pin images still available as fallback via `styleimagemissing` event

---

## Task 2.5: Add Idle Callback Wrapper Composable

**File:** `src/composables/map/useMapIdleFeatures.js` (NEW)

**Create:**
```javascript
import { ref } from "vue";

export function useMapIdleFeatures() {
  const idleTasksQueued = ref([]);
  const idleTasksExecuted = ref(false);

  const scheduleIdleTask = (fn, { timeout = 3000 } = {}) => {
    if (typeof fn !== "function") return null;

    const task = {
      fn,
      timeout,
      executed: false,
      id: Math.random(),
    };

    idleTasksQueued.value.push(task);
    return task.id;
  };

  const executeIdleTasksOnce = (map) => {
    if (idleTasksExecuted.value) return;

    if (!map) {
      console.warn("executeIdleTasksOnce called without map reference");
      return;
    }

    idleTasksExecuted.value = true;

    // Use requestIdleCallback if available (modern browsers)
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(
        () => {
          idleTasksQueued.value.forEach((task) => {
            if (!task.executed) {
              try {
                task.fn();
                task.executed = true;
              } catch (err) {
                console.error(`Idle task ${task.id} failed:`, err);
              }
            }
          });
        },
        { timeout: Math.max(...idleTasksQueued.value.map((t) => t.timeout), 3000) }
      );
    } else {
      // Fallback: setTimeout with small delay
      setTimeout(() => {
        idleTasksQueued.value.forEach((task) => {
          if (!task.executed) {
            try {
              task.fn();
              task.executed = true;
            } catch (err) {
              console.error(`Idle task ${task.id} failed:`, err);
            }
          }
        });
      }, 200);
    }
  };

  return {
    idleTasksQueued,
    idleTasksExecuted,
    scheduleIdleTask,
    executeIdleTasksOnce,
  };
}
```

**In MapboxContainer.vue:**
```javascript
import { useMapIdleFeatures } from "../../composables/map/useMapIdleFeatures";

const { scheduleIdleTask, executeIdleTasksOnce } = useMapIdleFeatures();

// Queue deferred tasks
scheduleIdleTask(() => {
  addDeferredLayers();
}, { timeout: 2000 });

scheduleIdleTask(() => {
  applyTerrainAndAtmosphere();
}, { timeout: 3000 });

scheduleIdleTask(() => {
  initSentientMap();
}, { timeout: 3000 });

// Execute all queued tasks after map idle
map.value.on("idle", () => {
  executeIdleTasksOnce(map.value);
});
```

**Verification:**
- Idle tasks queue builds without blocking
- `executeIdleTasksOnce` runs only once (guard prevents double-exec)
- Fallback to setTimeout if `requestIdleCallback` unavailable
- Tasks fail gracefully without crashing map
- Console shows task execution order in DEV mode

---

## Success Criteria

- [ ] Critical layers (pin-hitbox, pin-cluster, pin-symbol) render before deferred layers
- [ ] Terrain/fog mutations moved completely to idle phase
- [ ] No style mutation calls on load/style.load/styledata (only on idle)
- [ ] Deferred layer addition silently fails if source missing
- [ ] Lighthouse shows reduced initial style payload bytes
- [ ] Network waterfall: initial load completes in < 1.5s
- [ ] No visual flicker when deferred layers appear (after 2-3s)
- [ ] Pin selection + click works before terrain/fog rendered

---

## Rollback Plan

If visual flicker or interaction breaks:
1. Revert Task 2.1: Restore monolithic `addMapLayers()` export
2. Revert Task 2.2: Restore terrain check to `style.load` event
3. Revert Task 2.3: Restore single layer chain `map.on("load", addMapLayers)`
4. Keep Task 2.5 (`useMapIdleFeatures`) — reusable for Phase 13+
5. Re-run Lighthouse to confirm FCP/LCP stable

