/**
 * chromaticGlass.js — Refractive chromatic aberration glass shader
 * Engine Layer: GLSL as JS template literals.
 *
 * Samples background texture at per-channel UV offsets,
 * plus 13-tap Gaussian blur (2-pass separable) + noise overlay.
 */

export const CHROMA_VERT = /* glsl */ `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying vec2 vUv;
  void main() {
    vUv = a_uv;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

// ─── Pass 1: Horizontal Gaussian blur ────────────────────────
export const CHROMA_BLUR_H_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_texture;
  uniform vec2      u_resolution;

  // 13-tap Gaussian kernel weights (sigma ≈ 2.5)
  const float W[7] = float[](
    0.0044, 0.0540, 0.2420, 0.3990, 0.2420, 0.0540, 0.0044
  );

  void main() {
    vec2 px = vec2(1.0 / u_resolution.x, 0.0);
    vec4 color = vec4(0.0);
    for (int i = -3; i <= 3; i++) {
      color += texture2D(u_texture, vUv + float(i) * px) * W[i + 3];
    }
    gl_FragColor = color;
  }
`;

// ─── Pass 2: Vertical Gaussian blur + chromatic aberration ───
export const CHROMA_BLUR_V_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_texture;   // horizontally blurred
  uniform sampler2D u_original;  // original background (for RGB split)
  uniform vec2      u_resolution;
  uniform float     u_time;      // for noise animation
  uniform vec2      u_center;    // UV center of glass panel (for aberration)
  uniform float     u_aberration; // max aberration strength (0..0.01)

  // 13-tap vertical Gaussian
  const float W[7] = float[](
    0.0044, 0.0540, 0.2420, 0.3990, 0.2420, 0.0540, 0.0044
  );

  // Simple noise for frosted texture
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 px = vec2(0.0, 1.0 / u_resolution.y);

    // Vertical blur
    vec4 blurred = vec4(0.0);
    for (int i = -3; i <= 3; i++) {
      blurred += texture2D(u_texture, vUv + float(i) * px) * W[i + 3];
    }

    // Chromatic aberration on original (not blurred) — RGB split
    vec2 toCenter = vUv - u_center;
    float dist = length(toCenter);
    float aberration = u_aberration * dist * dist * 3.0;

    vec2 uvR = vUv + normalize(toCenter) * aberration;
    vec2 uvB = vUv - normalize(toCenter) * aberration;

    float r = texture2D(u_original, clamp(uvR, 0.0, 1.0)).r;
    float g = texture2D(u_original, vUv).g;
    float b = texture2D(u_original, clamp(uvB, 0.0, 1.0)).b;
    vec4 chroma = vec4(r, g, b, 1.0);

    // Mix: 70% blurred, 30% chromatic
    vec4 glass = mix(blurred, chroma, 0.3);

    // Frost noise overlay
    float noise = hash(vUv * 200.0 + u_time * 0.1) * 0.04;
    glass.rgb += noise;

    // Frost tint (dark glass)
    glass.rgb = mix(glass.rgb, vec3(0.06, 0.06, 0.09), 0.45);

    gl_FragColor = glass;
  }
`;
