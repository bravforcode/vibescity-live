# VibeCity God-Tier — Implementation Plan
## Mathematical Modeling & WebGL Architecture

> **Status:** DESIGN PHASE — No code until approved.
> **Target:** 144Hz-capable, zero-jank spatial computing UI

---

## Current State Assessment

| Layer | Current Tech | God-Tier Target |
|-------|-------------|-----------------|
| Map pins | DOM HTML markers + CSS 3D | WebGL SDF instanced geometry |
| Heatmap | Mapbox built-in heatmap layer | Custom GLSL Navier-Stokes fluid |
| Transitions | `flyTo` with cubic ease | Dolly Zoom (FOV + altitude manipulation) |
| Glass panels | `backdrop-filter: blur()` | Refractive chromatic aberration (WebGL) |
| Scroll physics | Logarithmic resistance (SwipeCard) | Damped Harmonic Oscillators (DHO) |
| Cursor prediction | useSentientMap velocity tracking | Trajectory extrapolation + magnetic field warp |
| Audio | Oscillator blips (useSpatialFeedback) | Granular synthesis engine (velocity-driven) |
| Haptics | `navigator.vibrate()` patterns | Resonant frequency sync (audio↔haptic) |
| Threading | Main thread (RAF batching) | SharedArrayBuffer + Web Workers |
| Lists | vue-virtual-scroller | Canvas/WebGL instanced rendering bypass |

---

## 1. Mathematical Models

### 1.1 Spring Physics — Damped Harmonic Oscillator (DHO)

All UI motion uses a single universal spring model:

```
F = -kx - cv + F_ext

where:
  x     = displacement from rest
  v     = dx/dt (velocity)
  k     = stiffness coefficient (N/m)
  c     = damping coefficient (Ns/m)
  F_ext = external force (user gesture input)
  m     = virtual mass of UI element
```

**Differential equation:**
```
m·(d²x/dt²) + c·(dx/dt) + k·x = F_ext(t)
```

**Integration method: Semi-implicit Euler (Symplectic)**
Chosen over RK4 for stability at variable timesteps + lower computational cost:

```
v(t+dt) = v(t) + dt · (-k·x(t) - c·v(t) + F_ext) / m
x(t+dt) = x(t) + dt · v(t+dt)
```

**Why not RK4?** RK4 requires 4 derivative evaluations per step. For 60+ concurrent spring animations at 144Hz, symplectic Euler provides energy-stable results at 1/4 the cost. RK4 reserved only for trajectory prediction (Section 1.5).

**Spring presets (tuned per mass class):**

| Element | Mass (m) | Stiffness (k) | Damping (c) | Character |
|---------|----------|---------------|-------------|-----------|
| Tooltip | 0.3 | 400 | 18 | Snappy, light |
| Card/Pin | 1.0 | 200 | 22 | Responsive |
| Drawer | 3.0 | 120 | 30 | Heavy, deliberate |
| Modal (fullscreen) | 5.0 | 80 | 35 | Massive, cinematic |
| Overscroll gap | 0.5 | 350 | 15 | Elastic, bouncy |

**Dismiss threshold:** Element dismisses when kinetic energy exceeds potential:
```
½mv² > ½kx_max²  →  |v| > x_max · √(k/m)
```

### 1.2 SDF Liquid Clustering — Signed Distance Fields

**Per-pin SDF circle:**
```glsl
float sdf_circle(vec2 p, vec2 center, float radius) {
    return length(p - center) - radius;
}
```

**Smooth union (liquid merge) — Polynomial smooth min:**
```glsl
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
```

`k` = smoothness factor:
- `k = 0.0` → hard binary union (no merge)
- `k = 40.0` → maximum liquid merge (ferrofluid)
- `k` is dynamically driven by `1.0 / zoom_level` — closer zoom = less merge

**Multi-pin field composition:**
```glsl
float field = MAX_DIST;
for (int i = 0; i < pinCount; i++) {
    float d = sdf_circle(fragCoord, pins[i].xy, pins[i].z);
    field = smin(field, d, smoothK);
}
```

**Rendering:**
- `field < 0.0` → inside blob (fill with category gradient)
- `field < 2.0` → edge glow (neon outline, 2px feather)
- `field < 8.0` → outer aura (soft radial falloff)

**Data transfer:** Pin positions (`vec3: x, y, radius`) packed into a `Float32Array` texture (RGBA32F). Updated per frame from Worker via `SharedArrayBuffer`.

**Separation spring:** When zoom crosses threshold, each pin gets individual spring force pulling it toward its true lat/lng position:
```
F_separate = k_sep · (pos_true - pos_merged) · sigmoid(zoom - zoom_threshold)
```

### 1.3 Navier-Stokes Fluid Heatmap (Simplified)

Full Navier-Stokes is prohibitive on mobile GPU. We use **Jos Stam's "Stable Fluids" (1999)** method — unconditionally stable, real-time:

**Three steps per frame:**

**Step 1 — Advection (Semi-Lagrangian):**
```
q(x, t+dt) = q(x - v·dt, t)    // trace back along velocity
```
Bilinear interpolation on the backtraced position. No CFL constraint.

**Step 2 — Diffusion (Implicit Jacobi iteration):**
```
(I - dt·ν·∇²) q_new = q_old

// Jacobi iteration (20 iterations sufficient):
q_new[i,j] = (q_old[i,j] + α·(q[i±1,j] + q[i,j±1])) / (1 + 4α)
where α = dt · ν / dx²
```
ν (viscosity) = 0.0001 (smoke-like, low diffusion)

**Step 3 — Pressure Projection (enforce ∇·v = 0):**
```
∇²p = ∇·v           // Poisson equation
v_new = v - ∇p       // Subtract pressure gradient
```
Solved via Jacobi iteration (40 iterations).

**GPU Implementation:**
- 3 textures (ping-pong): velocity (RG), pressure (R), density (R)
- Resolution: 256×256 (quarter screen) — bilinear upscale to display
- Density sources: venue `visitorCount` injected as Gaussian splats
- User interaction: map pan velocity → velocity field injection at cursor

**Fragment shader outline:**
```glsl
// advect.frag
vec2 pos = vUv - dt * texture2D(uVelocity, vUv).xy / resolution;
gl_FragColor = texture2D(uQuantity, pos);

// pressure.frag (Jacobi)
float div = /* divergence of velocity at this cell */;
float p = (pL + pR + pT + pB - dx*dx*div) / 4.0;
gl_FragColor = vec4(p, 0, 0, 1);
```

**Colormap:** Density → HSL ramp:
- 0.0 → transparent
- 0.2 → deep blue (#1a237e, α=0.3)
- 0.5 → cyan swirl (#00bcd4, α=0.5)
- 0.8 → hot magenta (#e91e63, α=0.7)
- 1.0 → white-hot core (#ffffff, α=0.9)

### 1.4 Dolly Zoom (Vertigo Effect)

**Principle:** Simultaneous FOV increase + camera retreat (or vice versa) to maintain subject size while warping perspective depth.

**Math:**
```
Given subject at distance D, apparent size S:
S = focal_length / D

To maintain S while changing D:
focal_length_new = S · D_new
→ FOV_new = 2 · atan(sensor_size / (2 · focal_length_new))
```

**Mapbox implementation via `map.setFreeCameraOptions()`:**
```
Frame 0:    zoom=14, pitch=0°,  fov=36° (default)
Frame 0.3:  zoom=12, pitch=45°, fov=60° (widening, pulling back)
Frame 0.7:  zoom=16, pitch=60°, fov=24° (narrowing, pushing in)
Frame 1.0:  zoom=17, pitch=55°, fov=30° (settled on venue)
```

**Easing:** Custom bezier `cubic-bezier(0.16, 1, 0.3, 1)` (aggressive ease-out).

**Shared Element Transform:**
- Capture pin's screen position (`map.project(lngLat)`)
- Create FLIP animation: pin thumbnail → modal hero image
- During dolly zoom frames 0.5→1.0: cross-dissolve pin → DOM element
- Use `View Transition API` where supported, fallback to manual FLIP

### 1.5 Cursor Trajectory Prediction

**Method:** 2nd-order polynomial extrapolation from last 5 pointer samples.

**Sampling:**
```
positions = [(x₀,y₀,t₀), (x₁,y₁,t₁), ..., (x₄,y₄,t₄)]
```

**Least-squares quadratic fit (per axis):**
```
x(t) = a·t² + b·t + c

Solve via normal equations:
[Σt⁴  Σt³  Σt²] [a]   [Σt²·x]
[Σt³  Σt²  Σt ] [b] = [Σt·x ]
[Σt²  Σt   n  ] [c]   [Σx   ]
```

**Prediction horizon:** 80ms ahead (≈5 frames at 60fps).

**Magnetic field warp:** Target buttons within 120px of predicted landing apply:
```
F_attract = G · (m_button · m_cursor) / d²
```
Clamped to max 8px visual displacement. 3D tilt via:
```
rotateX = atan2(dy, distance) · (180/π) · 0.15   // max ±12°
rotateY = atan2(dx, distance) · (180/π) · 0.15
```

### 1.6 Chromatic Aberration (Refractive Glass)

**Per-channel UV offset in fragment shader:**
```glsl
float aberration = 0.003 * distance_from_center;

vec4 r = texture2D(uBackground, vUv + vec2(aberration, 0.0));
vec4 g = texture2D(uBackground, vUv);
vec4 b = texture2D(uBackground, vUv - vec2(aberration, 0.0));

gl_FragColor = vec4(r.r, g.g, b.b, 1.0) * frost_alpha;
```

**Frost effect:** Gaussian blur (13-tap, 2-pass separable) at 1/4 resolution + noise overlay for frosted texture.

**Fallback (no WebGL context available):**
```css
backdrop-filter: blur(20px) saturate(1.4);
background: rgba(15, 15, 20, 0.75);
```

### 1.7 Granular Synthesis Engine

**Architecture:** Single `AudioContext` (reuse existing from `useSpatialFeedback`).

**Velocity → Sound mapping:**
```
Given swipe velocity v (px/ms):

frequency = lerp(80, 2400, clamp(v / 12, 0, 1))  // Hz
filter_cutoff = lerp(200, 8000, clamp(v / 12, 0, 1))  // Hz
gain = lerp(0.02, 0.15, clamp(v / 8, 0, 1))
duration = lerp(200, 30, clamp(v / 12, 0, 1))  // ms

Oscillator: sine wave at `frequency`
Filter: BiquadFilter lowpass at `filter_cutoff`, Q=2.0
Envelope: linear attack (5ms) → exponential decay
```

**Collision thud (drawer boundary hit):**
```
OscillatorNode: 60Hz sine, 40ms duration
Noise burst: 15ms white noise, bandpass 100-300Hz
GainNode: 0.2 → 0.0 (exponential ramp, 40ms)
navigator.vibrate([20, 10, 15])  // hard-soft-hard pattern
```

---

## 2. System Architecture

### 2.1 Thread Model

```
┌─────────────────────────────────────┐
│           MAIN THREAD               │
│                                     │
│  Vue 3 Reactive Layer               │
│  ├── Components (template/render)   │
│  ├── Composables (refs, watchers)   │
│  └── Pinia stores                   │
│                                     │
│  Mapbox GL JS (WebGL canvas)        │
│  ├── Custom layers (SDF, Fluid)     │
│  └── Camera/FOV control             │
│                                     │
│  Audio Engine (AudioContext)         │
│  └── Oscillators + Filters          │
│                                     │
│  RAF Render Loop                    │
│  └── Read from SharedArrayBuffer    │
├─────────────────────────────────────┤
│           WEB WORKER                │
│                                     │
│  PhysicsEngine class                │
│  ├── Spring solver (all elements)   │
│  ├── SDF cluster coalescing         │
│  ├── Trajectory prediction          │
│  └── Fluid sim CPU fallback         │
│                                     │
│  Write to SharedArrayBuffer         │
│  ├── springPositions[N×4]           │
│  ├── clusterField[256×256]          │
│  └── predictedTarget[4]            │
└─────────────────────────────────────┘
```

### 2.2 SharedArrayBuffer Layout

```
Offset 0:       springCount (uint32)
Offset 4:       Spring data [MAX_SPRINGS × 16 bytes]
                per spring: x(f32), y(f32), vx(f32), vy(f32)

Offset 16K:     clusterPinCount (uint32)
Offset 16K+4:   Pin positions [MAX_PINS × 12 bytes]
                per pin: x(f32), y(f32), radius(f32)

Offset 32K:     trajectoryPrediction [8 bytes]
                predicted_x(f32), predicted_y(f32)

Offset 33K:     fluidDensity [256×256 × 4 bytes] (if CPU fallback)
```

**Sync protocol:** Worker writes at fixed 120Hz tick. Main thread reads opportunistically in RAF. No locks needed — atomic float writes are naturally consistent for visual data (1-frame stale is imperceptible).

### 2.3 Custom Mapbox Layer Integration

SDF and Fluid layers integrate as `map.addLayer()` custom implementations:

```javascript
class SDFClusterLayer {
    constructor() { this.type = 'custom'; this.renderingMode = '2d'; }
    onAdd(map, gl) { /* compile shaders, create buffers */ }
    render(gl, matrix) { /* bind SAB texture, draw fullscreen quad */ }
    onRemove(map, gl) { /* cleanup */ }
}
```

**Texture upload strategy:**
- Pin data: `gl.texImage2D(RGBA32F, pinCount×1)` — updated per frame from SAB
- Fluid textures: ping-pong FBOs, internal to GPU (no CPU readback)

### 2.4 Domain Isolation

```
src/
├── engine/                          # Vanilla JS — NO Vue dependency
│   ├── physics/
│   │   ├── SpringSolver.js          # DHO integration (runs in Worker)
│   │   ├── FluidSolver.js           # Stam's stable fluids
│   │   └── TrajectoryPredictor.js   # Quadratic extrapolation
│   ├── audio/
│   │   ├── GranularSynth.js         # Velocity-mapped oscillators
│   │   └── HapticResonance.js       # Vibrate pattern generator
│   ├── rendering/
│   │   ├── SDFClusterLayer.js       # Mapbox custom layer (WebGL)
│   │   ├── FluidHeatmapLayer.js     # Mapbox custom layer (GLSL)
│   │   ├── ChromaticGlass.js        # Refractive panel renderer
│   │   └── shaders/                 # .vert / .frag files
│   │       ├── sdf_cluster.vert
│   │       ├── sdf_cluster.frag
│   │       ├── fluid_advect.frag
│   │       ├── fluid_pressure.frag
│   │       ├── fluid_render.frag
│   │       └── chromatic_glass.frag
│   └── workers/
│       └── physics.worker.js        # Web Worker entry point
│
├── composables/
│   ├── engine/                      # Vue ↔ Engine bridge
│   │   ├── usePhysicsWorld.js       # Worker init + SAB + RAF read loop
│   │   ├── useFluidOverlay.js       # Fluid layer lifecycle
│   │   ├── useSDFClusters.js        # SDF layer lifecycle
│   │   ├── useDollyZoom.js          # Camera FOV manipulation
│   │   ├── useMagneticUI.js         # Trajectory → magnetic button warp
│   │   ├── useGranularAudio.js      # Synth bridge (velocity → sound)
│   │   └── useChromaticGlass.js     # Glass panel lifecycle
│   └── map/                         # Existing composables (unchanged)
│
├── components/                      # Vue templates — thin, declarative
│   └── (existing components enhanced with composable hooks)
```

---

## 3. Progressive Enhancement Strategy

**Critical:** Not all devices support all features. Graceful degradation is mandatory.

| Feature | Requirement | Fallback |
|---------|------------|----------|
| SDF Clusters | WebGL 2.0 + RGBA32F textures | Standard Mapbox circle layers |
| Fluid Heatmap | WebGL 2.0 + float FBOs | Mapbox built-in heatmap layer |
| Dolly Zoom | `map.setFreeCameraOptions()` | Standard `flyTo` with pitch |
| Chromatic Glass | WebGL context on overlay canvas | CSS `backdrop-filter: blur()` |
| SharedArrayBuffer | `crossOriginIsolated === true` | Main-thread physics (throttled) |
| Web Workers | Basic support (universal) | Always available |
| Granular Synth | AudioContext (existing) | Existing useSpatialFeedback blips |
| Haptic Resonance | `navigator.vibrate()` | Silent (existing pattern) |
| Canvas Virtualization | OffscreenCanvas | vue-virtual-scroller (existing) |

**Feature detection at boot:**
```javascript
const caps = {
    webgl2: !!document.createElement('canvas').getContext('webgl2'),
    floatTextures: /* check EXT_color_buffer_float */,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated: self.crossOriginIsolated,
    audioContext: typeof AudioContext !== 'undefined',
    vibrate: 'vibrate' in navigator,
    viewTransition: 'startViewTransition' in document,
};
```

---

## 4. Performance Budget

| Metric | Budget | Measurement |
|--------|--------|-------------|
| Main thread frame time | < 8ms (target 144fps) | Performance.now() in RAF |
| Worker physics tick | < 4ms at 120Hz | Worker self-profiling |
| GPU draw calls (SDF) | ≤ 2 per frame | 1 fullscreen quad + 1 glow pass |
| GPU draw calls (Fluid) | ≤ 6 per frame | advect + diffuse + pressure×2 + render + composite |
| Fluid sim resolution | 256×256 | Quarter-res with bilinear upscale |
| SAB memory | < 64KB total | Springs(16K) + Pins(16K) + Trajectory(1K) + Fluid(32K if CPU) |
| Audio latency | < 10ms | Pre-created oscillator nodes |
| Total JS bundle increase | < 40KB gzipped | Tree-shake, no large deps |

---

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `crossOriginIsolated` headers missing (Vercel) | SAB unavailable | COOP/COEP headers in vercel.json; fallback to main-thread |
| Mobile GPU thermal throttle | Fluid sim drops frames | Auto-reduce fluid resolution (256→128→64) on frame budget miss |
| Mapbox custom layer API changes | Layer breaks on update | Pin to Mapbox v3.18; abstract behind interface |
| iOS Safari WebGL2 quirks | Shader compile failures | Test on Safari 17; GLSL 100 fallback shaders |
| Battery drain from continuous GPU | User complaints | Pause fluid sim when tab hidden; reduce to 30fps on battery saver |
| Vue reactivity overhead in hot path | Micro-stutter | Physics data NEVER touches Vue refs; raw JS + SAB only |

---

## 6. Dependencies (New)

| Package | Purpose | Size (gzip) | Alternative |
|---------|---------|-------------|-------------|
| None | Custom GLSL shaders | 0 | — |
| None | Physics in Worker | 0 | — |
| None | Granular synthesis | 0 | — |

**Zero new dependencies.** Everything is hand-written vanilla JS/GLSL. This is intentional — no library can match the tight integration required with Mapbox's WebGL context and our specific physics model.

---

*End of implementation_plan.md — Proceed to task.md for execution steps.*
