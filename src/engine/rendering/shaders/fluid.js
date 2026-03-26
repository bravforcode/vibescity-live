/**
 * fluid.js — Navier-Stokes (Stam's Stable Fluids) GLSL shaders
 * Engine Layer: GLSL as JS template literals.
 *
 * 5 shaders for ping-pong fluid simulation:
 *   1. ADVECT      — Semi-Lagrangian advection
 *   2. DIFFUSE     — Jacobi iteration (20 steps)
 *   3. PRESSURE    — Poisson pressure solver (40 steps)
 *   4. PROJECT     — Pressure gradient subtraction (divergence-free)
 *   5. RENDER      — Density → HSL colormap
 */

// ─── Shared fullscreen quad vertex ───────────────────────────
export const FLUID_VERT = /* glsl */ `
  attribute vec2 a_pos;
  varying vec2 vUv;
  void main() {
    vUv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

// ─── 1. Advection ────────────────────────────────────────────
// Semi-Lagrangian: trace particle backward along velocity, sample quantity there.
// q(x, t+dt) = q(x - v(x,t)*dt, t)
export const FLUID_ADVECT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D u_velocity;  // RG = vx, vy (in texel units)
  uniform sampler2D u_quantity;  // scalar or vector field to advect
  uniform vec2      u_resolution;
  uniform float     u_dt;        // timestep in seconds
  uniform float     u_dissipation; // 0.99 for density, 1.0 for velocity

  void main() {
    vec2 vel = texture2D(u_velocity, vUv).xy;
    // Backtrace (in UV space)
    vec2 prev = vUv - vel * u_dt;
    prev = clamp(prev, 0.0, 1.0);
    vec4 q = texture2D(u_quantity, prev);
    gl_FragColor = q * u_dissipation;
  }
`;

// ─── 2. Diffusion (Jacobi) ───────────────────────────────────
// Implicit diffusion: (I - dt*ν*∇²)q_new = q_old
// Jacobi iteration: q_new[i,j] = (q_old + α*(neighbors)) / (1 + 4α)
export const FLUID_DIFFUSE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D u_x;         // current field
  uniform sampler2D u_b;         // original field (RHS)
  uniform vec2      u_resolution;
  uniform float     u_alpha;     // dt * ν / dx²
  uniform float     u_rBeta;     // 1.0 / (1.0 + 4.0 * alpha)

  void main() {
    vec2 px = 1.0 / u_resolution;

    vec4 xL = texture2D(u_x, vUv - vec2(px.x, 0.0));
    vec4 xR = texture2D(u_x, vUv + vec2(px.x, 0.0));
    vec4 xT = texture2D(u_x, vUv + vec2(0.0, px.y));
    vec4 xB = texture2D(u_x, vUv - vec2(0.0, px.y));
    vec4 bC = texture2D(u_b, vUv);

    gl_FragColor = (bC + u_alpha * (xL + xR + xT + xB)) * u_rBeta;
  }
`;

// ─── 3. Pressure (Poisson, Jacobi) ───────────────────────────
// ∇²p = ∇·v → solve via Jacobi
// p[i,j] = (pL + pR + pT + pB - dx²*div) / 4
export const FLUID_PRESSURE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D u_pressure;
  uniform sampler2D u_divergence;
  uniform vec2      u_resolution;

  void main() {
    vec2 px = 1.0 / u_resolution;

    float pL = texture2D(u_pressure, vUv - vec2(px.x, 0.0)).r;
    float pR = texture2D(u_pressure, vUv + vec2(px.x, 0.0)).r;
    float pT = texture2D(u_pressure, vUv + vec2(0.0, px.y)).r;
    float pB = texture2D(u_pressure, vUv - vec2(0.0, px.y)).r;
    float div = texture2D(u_divergence, vUv).r;

    float p = (pL + pR + pT + pB - div) * 0.25;
    gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
  }
`;

// ─── 3b. Divergence ──────────────────────────────────────────
// ∇·v = (vR.x - vL.x + vT.y - vB.y) / (2*dx)
export const FLUID_DIVERGENCE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D u_velocity;
  uniform vec2      u_resolution;

  void main() {
    vec2 px = 1.0 / u_resolution;

    float vL = texture2D(u_velocity, vUv - vec2(px.x, 0.0)).x;
    float vR = texture2D(u_velocity, vUv + vec2(px.x, 0.0)).x;
    float vT = texture2D(u_velocity, vUv + vec2(0.0, px.y)).y;
    float vB = texture2D(u_velocity, vUv - vec2(0.0, px.y)).y;

    float div = 0.5 * ((vR - vL) + (vT - vB));
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }
`;

// ─── 4. Pressure Projection ───────────────────────────────────
// v_new = v - ∇p  →  enforce ∇·v = 0
export const FLUID_PROJECT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D u_velocity;
  uniform sampler2D u_pressure;
  uniform vec2      u_resolution;

  void main() {
    vec2 px = 1.0 / u_resolution;

    float pL = texture2D(u_pressure, vUv - vec2(px.x, 0.0)).r;
    float pR = texture2D(u_pressure, vUv + vec2(px.x, 0.0)).r;
    float pT = texture2D(u_pressure, vUv + vec2(0.0, px.y)).r;
    float pB = texture2D(u_pressure, vUv - vec2(0.0, px.y)).r;

    vec2 grad = vec2(pR - pL, pT - pB) * 0.5;
    vec2 vel  = texture2D(u_velocity, vUv).xy;

    gl_FragColor = vec4(vel - grad, 0.0, 1.0);
  }
`;

// ─── 5. Render ───────────────────────────────────────────────
// Density → HSL colormap (deep blue → cyan → magenta → white-hot)
export const FLUID_RENDER_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D u_density;
  uniform float     u_opacity;  // global alpha multiplier

  // HSL to RGB
  vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                   rgb = vec3(c, 0.0, x);
    return rgb + m;
  }

  void main() {
    float density = clamp(texture2D(u_density, vUv).r, 0.0, 1.0);

    if (density < 0.01) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Colormap:
    //  0.0 → transparent
    //  0.2 → deep blue  (h=0.67, s=0.9, l=0.25)
    //  0.5 → cyan       (h=0.52, s=1.0, l=0.45)
    //  0.8 → magenta    (h=0.88, s=1.0, l=0.55)
    //  1.0 → white-hot  (h=0.0,  s=0.0, l=1.0)

    float h, s, l;
    if (density < 0.2) {
      float t = density / 0.2;
      h = 0.67; s = 0.9; l = mix(0.15, 0.25, t);
    } else if (density < 0.5) {
      float t = (density - 0.2) / 0.3;
      h = mix(0.67, 0.52, t); s = 1.0; l = mix(0.25, 0.45, t);
    } else if (density < 0.8) {
      float t = (density - 0.5) / 0.3;
      h = mix(0.52, 0.88, t); s = 1.0; l = mix(0.45, 0.55, t);
    } else {
      float t = (density - 0.8) / 0.2;
      h = 0.88; s = mix(1.0, 0.0, t); l = mix(0.55, 1.0, t);
    }

    vec3 col = hsl2rgb(h, s, l);

    // Alpha: proportional to density^0.6 (smooth rolloff)
    float alpha = pow(density, 0.6) * u_opacity;

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

// ─── Splat (inject density/velocity at a point) ───────────────
export const FLUID_SPLAT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D u_target;   // existing field
  uniform vec2      u_point;    // splat center (UV)
  uniform float     u_radius;   // gaussian radius (UV units)
  uniform vec4      u_color;    // (vx, vy, 0, density) — or density-only

  void main() {
    float dist = length(vUv - u_point);
    float splat = exp(-dist * dist / (2.0 * u_radius * u_radius));

    vec4 existing = texture2D(u_target, vUv);
    gl_FragColor = existing + u_color * splat;
  }
`;
