---
phase: 01-neon-map-redesign-performance
verified: 2026-03-21T10:00:00Z
status: human_needed
score: 14/14 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: Open app in browser, check map background is near-black
    expected: Map renders with deep dark background (#0b0321) via setCyberpunkAtmosphere
    why_human: setCyberpunkAtmosphere applies Mapbox paint properties at runtime; cannot verify dynamically applied style changes statically
  - test: Observe venue markers on the map
    expected: Rectangular neon sign elements with category-colored borders (magenta bars, red music, green food, cyan default)
    why_human: createMarkerElement DOM rendering is runtime behavior; visual appearance requires browser
  - test: Check top of map viewport for scrolling banner
    expected: Animated marquee banner reading VIBE OF THE HOUR scrolling continuously
    why_human: CSS animation plays in browser; layout rendering requires running app
  - test: Tap a venue marker, verify bottom sheet appears and dismisses
    expected: Sheet slides up with venue name, green CLAIM YOUR VIBE and yellow TAKE ME THERE; tapping outside or X button dismisses
    why_human: Vue Transition and selectedShop state change require end-to-end runtime verification
  - test: With geolocation enabled, check for YOU ARE HERE dot
    expected: Pulsing blue circle with label at approx 65% down viewport when userLocation prop is set
    why_human: v-if condition requires runtime userLocation prop to be truthy
  - test: DevTools Network tab on load, check GeoJSON request timing
    expected: chiangmai-main-roads-lanes.geojson starts AFTER first map tiles appear
    why_human: once(idle) deferral timing is runtime behavior; pattern confirmed in code but load sequence cannot be measured statically
---
# Phase 1: Neon Map Redesign + Performance Verification Report

**Phase Goal:** Transform map to dark neon aesthetic + optimize initial load speed
**Verified:** 2026-03-21T10:00:00Z  **Status:** human_needed

## Observable Truths (14/14 VERIFIED)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | fadeDuration: 0 in Map constructor | VERIFIED | Line 113 useMapCore.js |
| 2 | antialias conditional on hardwareConcurrency>4 | VERIFIED | Line 111 useMapCore.js |
| 3 | GeoJSON road load deferred to map idle | VERIFIED | map.value.once(idle) in addNeonRoads() |
| 4 | 12MB chiangmai-main-roads.geojson deleted | VERIFIED | Only lanes variant remains in public/data/ |
| 5 | Neon sign markers with category colors | VERIFIED | createMarkerElement() + NEON_CATEGORY_COLORS in mapRenderer.js |
| 6 | Static box-shadow only (no CPU bug) | VERIFIED | .neon-sign-marker has static shadow; .neon-sign-selected uses scale+opacity only |
| 7 | Per-marker Lottie removed | VERIFIED | 0 lottie.loadAnimation in useMapMarkers.js |
| 8 | Map background #0b0321 | VERIFIED | CYBER_PALETTE.deepBg applied via setPaintProperty+setFog |
| 9 | Water bodies #181236 | VERIFIED | CYBER_PALETTE.water applied via setPaintProperty |
| 10 | setCyberpunkAtmosphere on every style.load | VERIFIED | Lines 1891+1081 of MapboxContainer.vue |
| 11 | YouAreHere dot on userLocation | VERIFIED | v-if guard line 2385; yah-pulse keyframe present |
| 12 | VibeBanner pure CSS marquee | VERIFIED | vibe-marquee keyframe; 0 setInterval/RAF matches |
| 13 | VibeActionSheet on selectedShop + dismiss | VERIFIED | :visible=!!selectedShop; backdrop+close emit close |
| 14 | i18n claim_vibe+take_me_there in en+th | VERIFIED | Both keys in both locales in src/i18n.js |

## Artifacts (11/11 VERIFIED)
All artifacts exist, are substantive, and are correctly wired.
- src/composables/map/useMapCore.js: fadeDuration+antialias at lines 111-113
- src/composables/map/useMapLayers.js: once(idle) in addNeonRoads()
- src/utils/mapRenderer.js: NEON_CATEGORY_COLORS + createMarkerElement() + escapeHtml()
- src/styles/map-atmosphere.css: .neon-sign-marker classes present
- src/composables/map/useMapMarkers.js: Lottie removed; createMarkerElement called line 87
- src/components/ui/YouAreHere.vue: yah-pulse keyframe; prefers-reduced-motion guard
- src/components/map/MapboxContainer.vue: YouAreHere v-if line 2384; setCyberpunkAtmosphere line 1891
- src/components/ui/VibeBanner.vue: vibe-marquee keyframe; no JS timers
- src/components/ui/VibeActionSheet.vue: props+emits+dismiss wired
- src/views/HomeView.vue: VibeBanner lines 952+1099; VibeActionSheet line 1218
- src/i18n.js: claim_vibe+take_me_there in en+th

## Key Links (8/8 WIRED)
- useMapCore.js -> mapboxgl.Map: fadeDuration:0 in constructor
- useMapLayers.js -> neon-roads source: map.once(idle) deferred
- mapRenderer.js -> useMapMarkers.js: createMarkerElement imported+called
- map-atmosphere.css -> .neon-sign-marker: el.className set in createMarkerElement
- MapboxContainer.vue -> YouAreHere.vue: v-if line 2385
- MapboxContainer.vue -> setCyberpunkAtmosphere: line 1891 first in handleMapStyleLoad
- HomeView.vue -> VibeActionSheet.vue: :visible=!!selectedShop + @close
- HomeView.vue -> VibeBanner.vue: unconditionally above map in both layouts

## Anti-Patterns
- src/views/HomeView.vue line 320: handleClaimVibe is a no-op TODO stub (Info/Intentional - Phase 2 deferred)

## Human Verification Required

All 14 automated checks passed. Six items require runtime browser verification:

1. **Dark map background visible** - Test: bun run dev, check map is near-black (#0b0321)
   Expected: Deep dark background, not grey Mapbox default tiles
   Why human: setCyberpunkAtmosphere applies paint at runtime via Mapbox API

2. **Neon sign markers visible** - Test: observe venue pins on loaded map
   Expected: Rectangular neon signs with colored borders per category (not grey circle pins)
   Why human: createMarkerElement DOM output requires browser rendering

3. **VibeBanner marquee visible** - Test: check top of map viewport
   Expected: VIBE OF THE HOUR scrolling banner at top of map
   Why human: CSS animation requires browser to play

4. **VibeActionSheet appears+dismisses** - Test: tap a venue marker then dismiss
   Expected: Sheet slides up with CLAIM+TAKE ME THERE; backdrop tap dismisses
   Why human: Vue Transition + state mutation require runtime verification

5. **YOU ARE HERE dot** - Test: enable geolocation or mock userLocation prop
   Expected: Pulsing blue dot at ~65% down viewport
   Why human: v-if requires runtime userLocation prop to be truthy

6. **GeoJSON deferred load** - Test: DevTools Network tab on reload
   Expected: chiangmai-main-roads-lanes.geojson starts AFTER initial tiles load
   Why human: once(idle) timing is runtime behavior

## Gaps Summary
No gaps found. Phase goal is fully implemented in code.
All 14 must-haves across 4 plans verified.
Six human items check runtime rendering - not code correctness.

---
_Verified: 2026-03-21T10:00:00Z | Verifier: Claude (gsd-verifier)_
