# VibeCity God-Tier — Task Breakdown

> **Reference:** `implementation_plan.md` for all mathematical models and architecture.
> **Rule:** Each phase is independently shippable. No phase depends on another's completion.

---

## Phase 0: Foundation (Infrastructure)
> **Unblocks everything. Must ship first.**

- [ ] **0.1** Create `src/engine/` directory structure per architecture spec
- [ ] **0.2** Add COOP/COEP headers to `vercel.json` for `crossOriginIsolated`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - Verify with `self.crossOriginIsolated === true` in console
  - Add `crossorigin` attribute to all external scripts/fonts
- [ ] **0.3** Create `src/engine/capabilities.js` — feature detection module
  - WebGL2, float textures, SAB, AudioContext, vibrate, viewTransition
  - Export reactive `caps` object for composable consumption
- [ ] **0.4** Create `src/engine/workers/physics.worker.js` — skeleton
  - Message protocol: `{type, payload}` ↔ `{type, payload}`
  - SharedArrayBuffer allocation + handshake
  - 120Hz fixed-timestep loop via `setInterval` (Worker has no RAF)
- [ ] **0.5** Create `src/composables/engine/usePhysicsWorld.js` — bridge
  - Worker instantiation + SAB handoff
  - RAF read loop (read spring positions from SAB)
  - Fallback: main-thread SpringSolver if SAB unavailable
- [ ] **0.6** Validate: `bun run build` passes, no runtime errors, Worker loads

---

## Phase 1: Spring Physics Engine
> **Universal motion model for all UI elements.**

- [ ] **1.1** Implement `src/engine/physics/SpringSolver.js`
  - Symplectic Euler integrator
  - API: `createSpring(id, mass, stiffness, damping)` / `applyForce(id, fx, fy)` / `step(dt)`
  - Presets: tooltip, card, drawer, modal, overscroll (from plan §1.1)
  - Unit test: spring settles within 2% of rest in expected time
- [ ] **1.2** Wire SpringSolver into Worker
  - Allocate spring data in SharedArrayBuffer
  - Worker reads forces, steps physics, writes positions
  - Main thread reads positions in RAF
- [ ] **1.3** Create `src/composables/engine/useSpring.js` — per-element hook
  - `const { x, y, applyForce, setTarget } = useSpring('drawer', presets.DRAWER)`
  - Returns reactive `x`, `y` (read from SAB each frame)
  - Sends force commands to Worker via postMessage
- [ ] **1.4** Integrate into `SwipeCard.vue` — replace logarithmic easing
  - Swipe gesture → `applyForce()` with touch delta
  - Release → spring returns to rest or dismiss threshold
  - Overscroll gaps: child items get individual springs with staggered delay
- [ ] **1.5** Integrate into `MallDrawer.vue` / `VibeModal.vue`
  - Drawer open/close driven by spring (mass=3, from preset)
  - Modal dismiss requires momentum > threshold (§1.1 dismiss formula)
- [ ] **1.6** Validate: 60fps on throttled mobile (Chrome DevTools 4x slowdown)

---

## Phase 2: SDF Liquid Clustering
> **Replace DOM markers with WebGL SDF blobs.**

- [ ] **2.1** Write GLSL shaders: `sdf_cluster.vert` + `sdf_cluster.frag`
  - Fullscreen quad vertex shader
  - Fragment: loop over pin texture, `smin` smooth union (§1.2)
  - Edge glow + aura rendering
  - `uniform float uSmoothK` driven by zoom level
- [ ] **2.2** Implement `src/engine/rendering/SDFClusterLayer.js`
  - Mapbox `CustomLayerInterface` (`onAdd`, `render`, `onRemove`)
  - Pin data uploaded as RGBA32F 1D texture
  - Matrix transformation: Mapbox `matrix` uniform for geo→screen
- [ ] **2.3** Create `src/composables/engine/useSDFClusters.js`
  - Lifecycle: add layer on mount, remove on unmount
  - Feed pin positions from venue store (throttled to 30fps)
  - Dynamic `smoothK = clamp(40 / zoom, 2, 40)`
- [ ] **2.4** Implement separation spring animation
  - When zoom > threshold: pins spring apart to true positions
  - `F_separate` formula from §1.2
  - Smooth transition between merged and individual states
- [ ] **2.5** Category-aware coloring
  - Each pin carries category ID → mapped to gradient LUT
  - Merged blobs blend category colors at boundaries
- [ ] **2.6** Fallback: if WebGL2 unavailable, keep existing Mapbox circle layers
- [ ] **2.7** Validate: 200+ pins at 60fps on mid-range Android

---

## Phase 3: Fluid Heatmap
> **Navier-Stokes density visualization.**

- [ ] **3.1** Write GLSL shaders (ping-pong architecture):
  - `fluid_advect.frag` — Semi-Lagrangian advection
  - `fluid_diffuse.frag` — Jacobi iteration (20 steps)
  - `fluid_pressure.frag` — Poisson solver (40 steps)
  - `fluid_project.frag` — Pressure gradient subtraction
  - `fluid_render.frag` — Density → HSL colormap
- [ ] **3.2** Implement `src/engine/rendering/FluidHeatmapLayer.js`
  - Mapbox `CustomLayerInterface`
  - Create framebuffers: velocity (RG16F), pressure (R16F), density (R16F)
  - Resolution: 256×256 with bilinear upscale
  - Ping-pong texture swap per step
- [ ] **3.3** Density source injection
  - Convert venue `visitorCount` to Gaussian splats
  - Position splats at venue screen coordinates
  - Higher count → larger radius + higher intensity
- [ ] **3.4** User interaction → velocity injection
  - Map pan delta → inject velocity at cursor position
  - Touch drag → directional velocity push
  - Creates visible swirl/wake effect
- [ ] **3.5** Create `src/composables/engine/useFluidOverlay.js`
  - Lifecycle management
  - Auto-pause when tab hidden (`document.visibilityState`)
  - Adaptive resolution: drop to 128×128 if frame budget exceeded
- [ ] **3.6** Fallback: Mapbox built-in heatmap layer
- [ ] **3.7** Validate: stable 60fps with fluid running + map panning

---

## Phase 4: Dolly Zoom Transitions
> **Cinematic venue focus.**

- [ ] **4.1** Implement `src/composables/engine/useDollyZoom.js`
  - Accept: `targetLngLat`, `duration`, `intensity`
  - Keyframe sequence: zoom/pitch/fov/bearing (§1.4)
  - Uses `map.setFreeCameraOptions()` or `map.easeTo` with custom interpolation
  - Easing: custom bezier `(0.16, 1, 0.3, 1)`
- [ ] **4.2** Shared Element Transform (pin → modal)
  - Capture pin screen position via `map.project()`
  - FLIP animation: First/Last/Invert/Play
  - Cross-dissolve during frames 0.5→1.0 of dolly zoom
  - View Transition API where supported
- [ ] **4.3** Integrate with existing `useMapNavigation.js`
  - Replace current `flyTo` for pin clicks
  - Preserve existing behavior for non-pin navigation
  - Respect `prefers-reduced-motion` (skip dolly, use simple fly)
- [ ] **4.4** Validate: smooth on 60Hz + 120Hz displays, no map tile pop-in

---

## Phase 5: Chromatic Glassmorphism
> **Refractive panels with RGB split.**

- [ ] **5.1** Write `chromatic_glass.frag` shader
  - Sample background texture at UV + per-channel offset (§1.6)
  - Gaussian blur (13-tap separable, 2 passes)
  - Noise overlay for frosted texture
  - Edge chromatic aberration scaled by distance from center
- [ ] **5.2** Implement `src/engine/rendering/ChromaticGlass.js`
  - Standalone WebGL context on overlay `<canvas>`
  - Captures Mapbox canvas as input texture (`gl.texImage2D` from canvas)
  - Renders to overlay canvas positioned behind modal DOM
  - Updates at 30fps (sufficient for background effect)
- [ ] **5.3** Create `src/composables/engine/useChromaticGlass.js`
  - Activate when drawer/modal opens
  - Deactivate + dispose when closed
  - Performance: skip if `caps.webgl2 === false`
- [ ] **5.4** CSS fallback for non-WebGL:
  - `backdrop-filter: blur(20px) saturate(1.4)`
  - `background: rgba(15, 15, 20, 0.75)`
- [ ] **5.5** Validate: no visible lag when opening MallDrawer over map

---

## Phase 6: Magnetic UI & Trajectory Prediction
> **Cursor anticipation + button warp.**

- [ ] **6.1** Implement `src/engine/physics/TrajectoryPredictor.js`
  - Ring buffer of last 5 pointer samples (x, y, t)
  - Quadratic least-squares fit (§1.5)
  - Predict position 80ms ahead
  - Runs in Worker (reads pointer data from SAB)
- [ ] **6.2** Create `src/composables/engine/useMagneticUI.js`
  - Register interactive elements with bounding rects
  - On each frame: check predicted position against registered targets
  - Apply 3D transform warp: `rotateX`, `rotateY` (max ±12°)
  - Magnetic pull: translate target up to 8px toward predicted landing
- [ ] **6.3** Integrate with key interactive elements
  - Category filter buttons
  - Feed cards (BottomFeed)
  - Action buttons in drawers
- [ ] **6.4** `prefers-reduced-motion`: disable all warp transforms
- [ ] **6.5** Validate: no jitter, transforms feel natural not gimmicky

---

## Phase 7: Granular Audio Synthesis
> **Velocity-driven procedural sound.**

- [ ] **7.1** Implement `src/engine/audio/GranularSynth.js`
  - Extend existing `useSpatialFeedback` AudioContext
  - Velocity → frequency/filter/gain/duration mapping (§1.7)
  - Pre-allocate oscillator pool (4 concurrent max)
  - Envelope generator: linear attack → exponential decay
- [ ] **7.2** Implement `src/engine/audio/HapticResonance.js`
  - Map audio frequency → vibrate waveform pattern
  - Collision thud: 60Hz base + noise burst + [20,10,15] vibrate
  - Boundary hit detection from spring solver (velocity sign change at limit)
- [ ] **7.3** Create `src/composables/engine/useGranularAudio.js`
  - Hook into gesture velocity from useSpring
  - Swipe: continuous frequency modulation during gesture
  - Release: snap/dismiss sound based on outcome
  - Drawer boundary: thud on overscroll limit hit
- [ ] **7.4** `prefers-reduced-motion`: audio still plays but quieter (gain ×0.3)
- [ ] **7.5** Validate: sounds feel physical, not annoying; user testing required

---

## Phase 8: Canvas Virtualization (DOM Bypass)
> **For extreme list performance (1000+ items).**

- [ ] **8.1** Identify candidates for canvas rendering
  - Ranking badges / leaderboard confetti
  - Dense marker labels at high zoom
  - Particle celebration effects
- [ ] **8.2** Implement instanced canvas renderer
  - `OffscreenCanvas` in Worker where supported
  - Instanced draw calls for repeated geometry
  - Text rendering via pre-rasterized glyph atlas
- [ ] **8.3** Integration: overlay canvas positioned above Vue DOM
  - Z-index management with existing `Z` constants
  - Hit testing: `elementFromPoint` fallback for interaction
- [ ] **8.4** Validate: 1000 items at 60fps, memory stable

---

## Phase 9: Inertial Momentum Tearing
> **Elastic slinky overscroll in feeds.**

- [ ] **9.1** Implement per-item spring stagger in BottomFeed
  - Each card gets individual spring with increasing delay
  - Overscroll: gaps between items expand proportional to distance from edge
  - Release: springs snap back in wave pattern (edge→center)
- [ ] **9.2** Math: stagger delay per item
  - `delay_i = i × 15ms` (15ms between each card spring activation)
  - Max stretch per gap: `20px × (1 - i/totalItems)`
  - Damping increases toward center (prevents infinite wobble)
- [ ] **9.3** Integrate with existing `useDragScroll` composable
- [ ] **9.4** Validate: feels physical, not distracting; 60fps during spring settle

---

## Execution Order (Recommended)

```
Phase 0 (Foundation)          ████████  WEEK 1
Phase 1 (Springs)             ████████  WEEK 1-2
Phase 2 (SDF Clusters)        ████████  WEEK 2-3
Phase 4 (Dolly Zoom)          ██████    WEEK 3
Phase 5 (Chromatic Glass)     ██████    WEEK 3-4
Phase 3 (Fluid Heatmap)       ████████  WEEK 4-5
Phase 7 (Granular Audio)      ████      WEEK 5
Phase 6 (Magnetic UI)         ████      WEEK 5-6
Phase 9 (Momentum Tearing)    ████      WEEK 6
Phase 8 (Canvas Virtualization)████     WEEK 6-7
```

**Why this order:**
1. Foundation + Springs = everything else depends on the motion model
2. SDF + Dolly + Glass = highest visual impact (demo-able early)
3. Fluid = complex but independent; parallel work possible
4. Audio + Magnetic + Tearing = polish layer (can ship without)
5. Canvas bypass = only needed if performance demands it

---

## Validation Gate (Per Phase)

```bash
# Every phase must pass before merge:
bun run check        # TypeScript/lint
bun run build        # Production build succeeds
# Manual: Chrome DevTools → Performance → 4x CPU throttle → 60fps confirmed
# Manual: prefers-reduced-motion tested
# Manual: fallback path tested (disable WebGL2 in chrome://flags)
```

---

*Ready for Phase 0 execution on approval.*
