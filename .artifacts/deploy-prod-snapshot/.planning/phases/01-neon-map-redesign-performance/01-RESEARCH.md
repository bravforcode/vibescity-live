# Phase 1: Neon Map Redesign + Performance - Research

**Researched:** 2026-03-21
**Domain:** MapLibre GL JS v4.7.1 custom dark neon styling, DOM marker redesign, Rsbuild bundle optimization, Vercel delivery
**Confidence:** HIGH (stack is known, verified against source files and official docs)

---

## Summary

VibeCity runs MapLibre GL JS v4.7.1 aliased as `mapbox-gl` via Rsbuild. The current map uses a hosted Mapbox Studio dark style (`mapbox://styles/phirrr/cmlktq68u002601se295iazmm`) with standard DOM-based markers (`mapboxgl.Marker` with custom HTML elements). The neon aesthetic already exists in embryonic form: neon road layers (`neon-roads-inner/outer`), fireflies, fog, and atmosphere composables are all present. The redesign is primarily a **visual upgrade of existing infrastructure** rather than a greenfield build.

The performance problem is identifiable from the codebase: the roads GeoJSON file (`chiangmai-main-roads-lanes.geojson`) is **3.9 MB uncompressed**, loaded as a GeoJSON source on every map init. Antialias is forced on (`antialias: true`), and the Lottie coin animation uses per-marker DOM SVG instances. The MapLibre chunk is already split via Rsbuild `forceSplitting`, but antialias + large GeoJSON + per-marker Lottie animations combine to cause the observed stutter.

The reference UI requires rectangular neon sign markers (not round pins), a fully dark/black map background, street labels in cyan/blue neon text, a pulsing "YOU ARE HERE" dot, a top marquee banner, and a bottom action sheet. All of these are achievable with the existing MapLibre setup using CSS custom marker elements (DOM markers), `setPaintProperty` for runtime layer color overrides, and a custom or hosted dark style JSON URL.

**Primary recommendation:** Keep the MapLibre + DOM marker architecture. Switch the base map to a dark tile source or apply `setPaintProperty` dark overrides at runtime. Replace pin HTML elements with rectangular neon sign divs. Fix the 3.9 MB GeoJSON load by deferring it until after map idle. Disable antialias on low-end mobile. These changes are isolated and composable.

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| maplibre-gl | 4.7.1 (aliased as mapbox-gl) | Map rendering engine (WebGL) | Already installed, aliased in rsbuild.config.ts |
| Vue 3 | 3.5.24 | Component framework | Project stack |
| Tailwind CSS | 3.4.19 | Utility CSS for marker styling | Project stack |
| Rsbuild | 1.7.2 | Bundler with forceSplitting for maplibre chunk | Project stack |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lottie-web | 5.13.0 | Coin animations on markers | Already used; wire canvas renderer path for performance |
| @vueuse/core | 14.2.0 | `useIntersectionObserver` for deferred map init if needed | Already installed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Mapbox Studio hosted style | OpenFreeMap `https://tiles.openfreemap.org/styles/liberty` | No API key needed, but less control over dark palette |
| Mapbox Studio hosted style | Local custom `style.json` served from `/public` | Full control, zero external dependency; requires one-time authoring in Maputnik |
| DOM-based markers | MapLibre symbol layers with SDF icons | Symbol layers are faster at 500+ markers but cannot render rich HTML neon sign structure; DOM markers are the right call at fewer than 200 venues |
| Lottie SVG renderer per marker | Single canvas Lottie image shared via `map.addImage` | Canvas approach (already scaffolded in `useMapLayers.js::setupCoinAnimation`) is dramatically more performant |

**Installation:** No new packages required. All dependencies are already present.

---

## Architecture Patterns

### Recommended Project Structure (existing, minimal additions)

```
src/composables/map/
  useMapCore.js          # Map constructor — modify Map options here
  useMapMarkers.js       # DOM marker creation — replace createMarkerElement output
  useMapLayers.js        # GeoJSON sources, layer paint — defer neon roads load
  useMapAtmosphere.js    # Fireflies, fog, neon roads pulse — already wired
  useNeonStyle.js        # NEW: applyNeonDarkTheme() called on style.load

src/utils/
  mapRenderer.js         # createMarkerElement() — replace pin HTML with neon sign HTML

src/styles/
  map-neon-markers.css   # NEW: CSS for neon sign markers (.neon-sign, color variants)

src/components/map/
  MapMarquee.vue         # NEW: scrolling top banner ("VIBE OF THE HOUR...")
  MapActionSheet.vue     # NEW or extend existing BottomFeed: "CLAIM YOUR VIBE" / "TAKE ME THERE"
```

### Pattern 1: Runtime Dark Style Application via setPaintProperty

**What:** After map style loads, iterate all layers and override colors for background, fill (land/water), line (roads), symbol (labels) to achieve dark neon palette without replacing the tile source.

**When to use:** The existing Mapbox Studio style is kept; its colors are overridden at runtime. This avoids re-requesting a new tile set and preserves all existing custom layers.

**Example:**
```javascript
// Source: MapLibre style spec - layers paint properties
// After map 'style.load' event fires, call this function once
export function applyNeonDarkTheme(map) {
  if (!map || !map.isStyleLoaded()) return;

  const DARK_PALETTE = {
    background: '#050508',
    land: '#0a0a12',
    water: '#0a1628',
    road: '#0d2d40',
    labelColor: '#38bdf8',
    labelHalo: '#001020',
  };

  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', DARK_PALETTE.background);
      }
      if (layer.type === 'fill' && map.getLayer(layer.id)) {
        map.setPaintProperty(layer.id, 'fill-color', DARK_PALETTE.land);
      }
      if (layer.type === 'line' && map.getLayer(layer.id)) {
        map.setPaintProperty(layer.id, 'line-color', DARK_PALETTE.road);
      }
      if (layer.type === 'symbol' && map.getLayer(layer.id)) {
        map.setPaintProperty(layer.id, 'text-color', DARK_PALETTE.labelColor);
        map.setPaintProperty(layer.id, 'text-halo-color', DARK_PALETTE.labelHalo);
        map.setPaintProperty(layer.id, 'text-halo-width', 1.5);
      }
    } catch {
      // Layer may not exist at current zoom level; safe to ignore
    }
  }
}
```

**Known caveat (verified from MapLibre GitHub issue #3373):** Changes via `setPaintProperty` are NOT immediately reflected in `getStyle().layers` -- they are applied to the renderer but the style JSON object lags. Do not read back via `getStyle()` immediately after setting.

### Pattern 2: Neon Sign DOM Marker

**What:** Replace the current `createMarkerElement()` round pin HTML with rectangular neon sign divs using CSS `box-shadow` and `text-shadow` for glow. Each marker gets a neon color matched to category.

**When to use:** For all venue markers. This replaces pin PNG images with styled HTML elements.

**CSS pattern (verified from CSS-Tricks neon guide):**
```css
/* src/styles/map-neon-markers.css */
.neon-sign {
  position: relative;
  padding: 4px 8px;
  border: 1px solid currentColor;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.85);
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--font-display);
  transform: translateZ(0);
  will-change: transform;
}

.neon-sign__name {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: currentColor;
  text-shadow:
    0 0 4px #fff,
    0 0 8px #fff,
    0 0 16px currentColor,
    0 0 30px currentColor;
}

.neon-sign__category {
  display: block;
  font-size: 8px;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
}

.neon-sign {
  box-shadow:
    0 0 3px currentColor,
    0 0 10px currentColor,
    inset 0 0 8px rgba(255, 255, 255, 0.05);
}

.neon-sign--cyan   { color: #00e5ff; }
.neon-sign--pink   { color: #ff2d78; }
.neon-sign--green  { color: #00ff88; }
.neon-sign--yellow { color: #ffdd00; }
.neon-sign--purple { color: #bf5af2; }
.neon-sign--red    { color: #ff4444; }

/* Selected state: brighter glow only, no animation (performance) */
.neon-sign--selected {
  box-shadow:
    0 0 6px currentColor,
    0 0 20px currentColor,
    0 0 40px currentColor,
    inset 0 0 12px rgba(255, 255, 255, 0.1);
}

/* Accessibility: reduce glow for users who prefer less motion */
@media (prefers-reduced-motion: reduce) {
  .neon-sign__name { text-shadow: 0 0 4px currentColor; }
  .neon-sign       { box-shadow: 0 0 3px currentColor; }
}
```

**Performance note (critical):** Animated `box-shadow` via `@keyframes` causes repaint on non-GPU-composited elements. CSS-Tricks users reported CPU at 100% on mobile with animated neon. Use **static shadows only** (no animation). Animate only the `--selected` marker, not all markers.

### Pattern 3: GeoJSON Deferred Load

**What:** The `chiangmai-main-roads-lanes.geojson` (3.9 MB) is loaded eagerly on map init. Deferring it to after the map is idle lets base tiles render first.

**When to use:** Required. This is a direct cause of the initial load stutter.

```javascript
// Source: MapLibre large data guide + verified against useMapLayers.js pattern
// In useMapLayers.js -- change addNeonRoads to fire on map idle
const addNeonRoadsDeferred = () => {
  if (!map.value) return;
  map.value.once('idle', () => {
    // Base tiles have rendered; now safe to load large GeoJSON
    addNeonRoads();
  });
};
```

### Pattern 4: Map Constructor Performance Options

**What:** Map options that materially affect initial render speed, verified from MapLibre API docs and DeepWiki performance guide.

```javascript
// Source: DeepWiki MapLibre performance guide + MapLibre API classes/Map
// In useMapCore.js initMap()
const isMobileLowPower =
  window.devicePixelRatio > 1 && (navigator.hardwareConcurrency ?? 4) < 4;

map.value = new mapboxgl.Map({
  container: containerRef.value,
  style: style,
  center: initialCenter,
  zoom: initialZoom,
  pitch: 60,
  bearing: 0,
  antialias: !isMobileLowPower,  // false on low-end mobile (was hardcoded true)
  attributionControl: false,
  fadeDuration: 0,               // tiles appear instantly, skip fade-in
  validateStyle: !import.meta.env.DEV,  // skip style JSON validation in production
});
```

### Pattern 5: Top Marquee Banner Component

**What:** A scrolling marquee banner at the top of the map showing live venue activity. Stateless, display-only.

```css
/* pointer-events: none -- must NOT intercept map touch events */
.vibe-marquee {
  background: #000;
  border-bottom: 1px solid #ff2d78;
  overflow: hidden;
  pointer-events: none;
  height: 28px;
  display: flex;
  align-items: center;
}
.vibe-marquee__track {
  white-space: nowrap;
  animation: marquee-scroll 20s linear infinite;
  color: #ff2d78;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-shadow: 0 0 8px #ff2d78, 0 0 16px #ff2d78;
}
@keyframes marquee-scroll {
  from { transform: translateX(100vw); }
  to   { transform: translateX(-100%); }
}
@media (prefers-reduced-motion: reduce) {
  .vibe-marquee__track {
    animation: none;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
```

### Anti-Patterns to Avoid

- **Animated box-shadow on every marker:** CPU pegs at 100% on mobile. Use static shadows; animate only the highlighted marker's `--selected` class.
- **Loading 3.9 MB GeoJSON synchronously in `style.load` handler:** Blocks first render. Always defer with `map.once('idle', ...)`.
- **Creating one Lottie SVG animation per marker:** Each SVG Lottie instance runs its own rAF loop. `setupCoinAnimation()` in `useMapLayers.js` already has the canvas-shared pattern -- wire it up instead of the per-marker approach in `useMapMarkers.js`.
- **Calling `map.setStyle()` to apply the dark theme:** This destroys all added sources/layers (neon roads, fireflies, clusters, markers). Use `setPaintProperty` iteration on the existing style instead.
- **Placing marquee or action sheet without `pointer-events: none`:** The marquee banner is display-only and must not intercept map pan/zoom gestures.
- **Hard-coding `antialias: true`:** Costs ~2x GPU budget on mobile. Make it conditional on hardware capability.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark map base style | Custom tile server, full style.json from scratch | `setPaintProperty` iteration over existing Mapbox style layers on `style.load` | Full style JSON = 500+ layer definitions; tile server is infra burden |
| Neon glow effect | WebGL custom render pass, SVG filters, Canvas 2D | CSS `text-shadow` + `box-shadow` with static values | Static CSS shadows render via GPU compositor without layout repaints |
| Marker clustering | Custom quadtree implementation | Existing `addClusters()` in `useMapLayers.js` with MapLibre built-in `cluster: true` GeoJSON option | MapLibre handles tile-aware clustering with collision detection out of the box |
| "YOU ARE HERE" pulsing dot | Canvas animation loop | CSS `@keyframes` pulse on a `mapboxgl.Marker` DOM element | Existing user-location marker code already does this pattern |
| GeoJSON simplification | Runtime simplification code | Offline pre-processing with `mapshaper` CLI tool | Runtime simplification is too slow; build-time is correct |

**Key insight:** All primitives exist. The neon redesign is HTML/CSS overlay on existing MapLibre infrastructure, not a new rendering engine.

---

## Common Pitfalls

### Pitfall 1: style.load fires multiple times
**What goes wrong:** `map.on('style.load', ...)` fires on initial load AND every time `setStyle()` is called. If `applyNeonDarkTheme()` is bound to `style.load`, it runs on every theme switch. If handlers add sources/layers, they get duplicated.
**Why it happens:** MapLibre resets all user-added sources/layers on `setStyle()`.
**How to avoid:** Always guard with `if (!map.getSource('my-source'))` before adding sources. The existing `ensureFirefliesLayer()`, `addNeonRoads()`, `addClusters()` already do this -- follow the same pattern for all new layers.
**Warning signs:** Console errors like "Source with id 'neon-roads' already exists".

### Pitfall 2: setPaintProperty on layers that don't exist yet
**What goes wrong:** During `style.load`, tile data loading is async; some zoom-dependent layers may not exist. Calling `setPaintProperty` on a missing layer can throw silently or log warnings.
**Why it happens:** Tile data loading is decoupled from style.load event.
**How to avoid:** Wrap all `setPaintProperty` calls in `try/catch` or guard with `if (map.getLayer(layerId))`. The existing `useMapAtmosphere.js` already does this -- follow the same guard pattern.
**Warning signs:** Some layers not darkened; inconsistent dark theme across zoom levels.

### Pitfall 3: DOM marker count causing layout thrash during pan
**What goes wrong:** With 100+ DOM markers on screen, each with multi-layer CSS shadows, pan performance drops because the browser must repaint shadow layers on every marker position update.
**Why it happens:** MapLibre DOM markers are repositioned via CSS `transform: translate(x, y)` on every frame. Multi-layer `box-shadow` on non-composited elements triggers paint on each reposition.
**How to avoid:** Add `will-change: transform` on `.neon-sign` elements. Keep box-shadow to max 3 layers. Only apply the enhanced `--selected` glow to the single highlighted marker. Consider capping visible DOM markers at 80 (add `MAX_VISIBLE_MARKERS = 80` guard in `updateMarkers`).
**Warning signs:** Chrome DevTools Layer panel shows "paint" events on every map pan frame.

### Pitfall 4: 3.9 MB GeoJSON blocking interactive readiness
**What goes wrong:** `addNeonRoads()` is called in `style.load` (synced with map init). On 3G (~1 Mbps), the file download takes ~30 seconds. On 10 Mbps mobile, the 3.9 MB JSON parse blocks the main thread for 200-800 ms.
**Why it happens:** JSON.parse is synchronous and single-threaded. The file is fetched immediately on map ready.
**How to avoid:** Move `addNeonRoads()` call to `map.once('idle', ...)` so base tiles render first. Long-term: use `mapshaper` to simplify and compress the file to under 500 KB.
**Warning signs:** Network waterfall shows roads.geojson as a blocking resource before first map tiles appear; Lighthouse LCP blocked by this request.

### Pitfall 5: antialias: true fixed on mobile
**What goes wrong:** `antialias: true` in `useMapCore.js` forces MSAA on the WebGL context. On mid-range Android (Snapdragon 665, Mali-G52), this halves the GPU frame budget for the map canvas, causing panning to drop below 30 fps.
**Why it happens:** Current code has `antialias: true` hardcoded with no device capability check.
**How to avoid:** Detect: `antialias: !isMobileLowPower` where `isMobileLowPower = devicePixelRatio > 1 && hardwareConcurrency < 4`. On Retina/HiDPI screens the extra pixel density provides natural edge smoothing.
**Warning signs:** Map panning at less than 30 fps on mid-range phones reported in performance profiler.

### Pitfall 6: Marquee banner and action sheet intercepting map touch events
**What goes wrong:** If the marquee banner or bottom action sheet lack `pointer-events: none`, they intercept all touch gestures in their area, making it impossible to pan or zoom that portion of the map.
**Why it happens:** Default CSS `pointer-events: auto`.
**How to avoid:** The marquee banner is display-only -- always set `pointer-events: none`. The bottom action sheet needs `pointer-events: auto` only on its interactive buttons, not the full container. Use existing `uiTopOffset` / `uiBottomOffset` props on MapboxContainer to report overlay heights to the map padding system.
**Warning signs:** Map doesn't respond to touch/pan gestures in the bottom 120px of the viewport.

### Pitfall 7: CSS font for neon markers not loaded at marker creation time
**What goes wrong:** Chakra Petch is loaded via Google Fonts async in `index.html`. If markers are created before the font loads, they briefly render in a fallback sans-serif, then reflow when the custom font arrives (CLS).
**Why it happens:** `index.html` already has `<link rel="preconnect" href="https://fonts.googleapis.com">` but font loading is not guaranteed to complete before first marker render.
**How to avoid:** Use `document.fonts.ready.then(() => initMarkers())` or keep `font-display: swap` which is the existing Google Fonts behavior. Accept the initial fallback render since font swap is fast after preconnect.
**Warning signs:** Visible font swap on first load; markers briefly misalign before font loads.

---

## Code Examples

Verified patterns from official sources and direct codebase inspection:

### Dark Neon Runtime Layer Theming
```javascript
// Source: MapLibre style spec layers docs + useMapAtmosphere.js guard pattern
// Place in src/composables/map/useNeonStyle.js
export function applyNeonDarkTheme(map) {
  if (!map || !map.isStyleLoaded()) return;

  const NEON_PALETTE = {
    background: '#050508',
    land:       '#0a0a12',
    water:      '#0a1628',
    road:       '#0d2d40',
    label:      '#38bdf8',   // cyan neon
    labelHalo:  '#001020',
  };

  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', NEON_PALETTE.background);
      }
      if (layer.type === 'fill' && map.getLayer(layer.id)) {
        map.setPaintProperty(layer.id, 'fill-color', NEON_PALETTE.land);
      }
      if (layer.type === 'line' && map.getLayer(layer.id)) {
        map.setPaintProperty(layer.id, 'line-color', NEON_PALETTE.road);
      }
      if (layer.type === 'symbol' && map.getLayer(layer.id)) {
        map.setPaintProperty(layer.id, 'text-color', NEON_PALETTE.label);
        map.setPaintProperty(layer.id, 'text-halo-color', NEON_PALETTE.labelHalo);
        map.setPaintProperty(layer.id, 'text-halo-width', 1.5);
      }
    } catch {
      // Zoom-dependent layer may not exist yet; safe to skip
    }
  }
}
```

### Neon Sign Marker Factory
```javascript
// Source: mapRenderer.js escapeHtml pattern + CSS-Tricks neon guide
// Replace the round pin element generation in createMarkerElement()
const CATEGORY_NEON_MAP = {
  cocktail: { cls: 'neon-sign--cyan',   sub: 'COCKTAILS',  icon: 'glass' },
  bar:      { cls: 'neon-sign--pink',   sub: 'NIGHTLIFE',  icon: 'bar'   },
  music:    { cls: 'neon-sign--green',  sub: 'LIVE MUSIC', icon: 'music' },
  food:     { cls: 'neon-sign--yellow', sub: 'STREET FOOD',icon: 'food'  },
  default:  { cls: 'neon-sign--purple', sub: 'VENUE',      icon: ''      },
};

// Use DOM methods only (no innerHTML) per project security conventions
export function createNeonSignElement({ item, isHighlighted }) {
  const config = CATEGORY_NEON_MAP[item.category?.toLowerCase()]
    ?? CATEGORY_NEON_MAP.default;

  const el = document.createElement('div');
  el.className = `neon-sign ${config.cls}${isHighlighted ? ' neon-sign--selected' : ''}`;
  el.setAttribute('data-shop-id', String(item.id));
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', item.name || 'Venue');

  const nameSpan = document.createElement('span');
  nameSpan.className = 'neon-sign__name';
  nameSpan.textContent = item.name || '';

  const catSpan = document.createElement('span');
  catSpan.className = 'neon-sign__category';
  catSpan.textContent = config.sub;

  el.appendChild(nameSpan);
  el.appendChild(catSpan);
  return el;
}
```

Note: DOM method construction instead of `innerHTML` avoids XSS -- aligns with project security conventions.

### Deferred GeoJSON Load
```javascript
// Source: MapLibre large data guide
// In useMapLayers.js -- replace direct addNeonRoads call with deferred version
const addNeonRoadsDeferred = () => {
  if (!map.value) return;
  // map.once('idle') fires after the first frame where the map is fully rendered
  map.value.once('idle', () => {
    addNeonRoads(); // 3.9 MB GeoJSON loads after base tiles are visible
  });
};
```

### Map Constructor with Performance Options
```javascript
// Source: DeepWiki MapLibre performance techniques + MapLibre API Map class docs
// In useMapCore.js initMap()
const isMobileLowPower =
  typeof window !== 'undefined'
  && window.devicePixelRatio > 1
  && (navigator.hardwareConcurrency ?? 4) < 4;

new mapboxgl.Map({
  container: containerRef.value,
  style: style,
  center: initialCenter,
  zoom: initialZoom,
  pitch: 60,
  bearing: 0,
  antialias: !isMobileLowPower,    // was: true (hardcoded)
  attributionControl: false,
  fadeDuration: 0,                 // tiles appear instantly, no fade transition
  validateStyle: !import.meta.env.DEV,  // skip style validation in production
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Round pin PNG images | DOM markers with custom HTML via `createMarkerElement()` | Already current in codebase | More flexible, supports custom HTML content |
| Mapbox GL JS (licensed) | MapLibre GL JS 4.7.1 aliased as mapbox-gl | Already current | No per-tile API billing |
| Full `chiangmai-main-roads.geojson` (11.6 MB) | `chiangmai-main-roads-lanes.geojson` (3.9 MB) | Some past optimization | Still too large -- needs defer or compression |
| Per-marker Lottie SVG rAF loops | Canvas Lottie shared image via `map.addImage` (scaffolded) | Scaffolded in `useMapLayers.js::setupCoinAnimation` but not wired for all markers | When wired: eliminates N independent rAF loops |
| `antialias: true` hardcoded | Conditional antialias based on `navigator.hardwareConcurrency` | Not yet implemented | ~2x GPU frame budget improvement on low-end mobile |

**Deprecated/outdated items to clean up:**
- `chiangmai-main-roads.geojson` (11.6 MB): Unreferenced in code (only the `-lanes` variant is used) but present in `/public/data/`. Delete it to save Vercel deploy size and bandwidth.
- Per-marker SVG Lottie in `useMapMarkers.js`: The canvas Lottie approach in `setupCoinAnimation` (useMapLayers.js) is the correct replacement. The per-marker approach is the current anti-pattern to replace.

---

## Open Questions

1. **Which dark tile base to use: existing Mapbox Studio style vs. OpenFreeMap**
   - What we know: Existing style `mapbox://styles/phirrr/cmlktq68u002601se295iazmm` is hosted on Mapbox (requires Mapbox token). It already has custom layer names (`neon-roads-inner/outer`) baked in. OpenFreeMap provides free tiles at `https://tiles.openfreemap.org/styles/liberty` with no key required.
   - What is unclear: Whether the existing Mapbox style JSON's background/land fill tiles can be fully darkened via `setPaintProperty` without the raster background bleeding through.
   - Recommendation: Attempt `setPaintProperty` dark override on the existing style first (lower risk, preserves all custom layers). If the background tile raster refuses to go fully dark, fall back to OpenFreeMap liberty as the base tile source and re-add custom neon road layers.

2. **Marquee banner content: static or API-driven**
   - What we know: The reference shows dynamic venue activity text ("THE BEACH CLUB IS JUMPING!"). Real-time data comes from the WebSocket / hotspot system.
   - What is unclear: Whether this phase should wire up real data or use a placeholder for the visual milestone.
   - Recommendation: Implement `MapMarquee.vue` with a `message` prop and static placeholder default. Backend wiring is a follow-on task in a later phase.

3. **Number of active DOM markers in production**
   - What we know: `updateMarkers()` renders one DOM marker per shop in the viewport with no enforced limit.
   - What is unclear: The exact count of venues within the typical viewport in Chiang Mai's Nimman/Old City area. Industry guidance suggests DOM markers start to degrade past 100-200 per frame.
   - Recommendation: Cap visible DOM markers at 80 per viewport by adding `const MAX_VISIBLE_MARKERS = 80` and slicing the shops array in `updateMarkers`. Beyond 80, the existing `addClusters` GeoJSON system handles the overflow.

4. **fadeDuration and validateStyle availability in MapLibre v4.7.1**
   - What we know: These options were documented in MapLibre v3 release notes and are referenced in the DeepWiki performance guide.
   - What is unclear: Whether these exact option names exist in the v4.7.1 Map constructor TypeScript types.
   - Recommendation: Verify by checking `node_modules/maplibre-gl/dist/maplibre-gl.d.ts` for `MapOptions` interface before implementing. If absent, skip without risk.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `src/composables/map/useMapCore.js` -- Map constructor options, style URLs, antialias flag
- Codebase: `src/composables/map/useMapMarkers.js` -- DOM marker creation pattern
- Codebase: `src/composables/map/useMapLayers.js` -- GeoJSON sources, layer definitions, `setupCoinAnimation` canvas approach
- Codebase: `src/composables/map/useMapAtmosphere.js` -- `setPaintProperty` guard pattern, neon road layer names
- Codebase: `rsbuild.config.ts` -- forceSplitting for maplibre chunk already configured
- Codebase: `public/data/` -- `chiangmai-main-roads-lanes.geojson` confirmed 3.9 MB via `ls -la`
- Codebase: `public/index.html` -- Chakra Petch + JetBrains Mono + Prompt fonts already preloaded
- [MapLibre GL JS Marker API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/) -- Marker constructor options confirmed
- [MapLibre Style Spec - Layers](https://maplibre.org/maplibre-style-spec/layers/) -- paint property names for background/fill/line/symbol layer types
- [MapLibre Large Data Guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/) -- GeoJSON optimization and clustering options

### Secondary (MEDIUM confidence)
- [DeepWiki MapLibre Performance Techniques](https://deepwiki.com/maplibre/maplibre-gl-js/5.2-performance-optimization-techniques) -- `antialias: false`, `fadeDuration`, `validateStyle`, worker threading details
- [CSS-Tricks Neon Text Guide](https://css-tricks.com/how-to-create-neon-text-with-css/) -- verified neon text-shadow and box-shadow pattern with performance warning on animated shadows
- [OpenFreeMap Quick Start](https://openfreemap.org/quick_start/) -- free tile URLs: liberty, bright, positron (no API key required)
- [Rsbuild ChunkSplit docs](https://rsbuild.rs/config/performance/chunk-split) -- `forceSplitting` behavior and initial script tag injection caveat

### Tertiary (LOW confidence)
- MapLibre GitHub issue #3373: `setPaintProperty` values not immediately reflected in `getStyle().layers` -- single issue report; treat as known caveat, guard against reading back immediately
- MapLibre GitHub issue #3925: Custom marker overlaid by default pin after v3.1.0 -- LOW relevance; project is on v4.7.1 which is past this regression window

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries confirmed in package.json and node_modules
- Architecture patterns: HIGH -- based on direct codebase analysis of existing composables and their patterns
- Neon CSS patterns: HIGH -- CSS-Tricks guide is authoritative; performance warning verified by multiple sources including w3schools and css3shapes.com
- GeoJSON performance fix: HIGH -- file size confirmed via filesystem, defer pattern verified from MapLibre docs
- Map constructor performance options (`fadeDuration`, `validateStyle`): MEDIUM -- referenced in MapLibre v3 release notes and DeepWiki; not confirmed against v4.7.1 TypeScript types
- Pitfalls: HIGH -- verified against existing codebase patterns and MapLibre issue tracker

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (MapLibre 4.x is stable; CSS patterns are evergreen; Rsbuild config is stable)
