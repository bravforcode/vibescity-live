/**
 * sdfCluster.js — SDF Liquid Clustering shaders
 * Engine Layer: GLSL source as JS template literals.
 *
 * Uses smooth min (smin) for liquid-mercury blob merge.
 * Pins uploaded as RGBA32F 1D texture.
 */

export const SDF_CLUSTER_VERT = /* glsl */ `
  precision highp float;
  attribute vec2 a_pos;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

export const SDF_CLUSTER_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D u_pins;     // RGBA32F texture: (x, y, radius, categoryId) per pin
  uniform int       u_pinCount; // active pin count
  uniform float     u_smoothK;  // merge smoothness (0=hard, 40=ferrofluid)
  uniform vec2      u_resolution;
  uniform float     u_time;     // monotonic seconds for organic wobble

  // Category color LUT (index 0-9 → RGB)
  const vec3 CAT_COLORS[10] = vec3[](
    vec3(1.0,  0.27, 0.0),   // 0 bar/club  — orange
    vec3(0.0,  0.74, 1.0),   // 1 nightlife — cyan
    vec3(1.0,  0.2,  0.6),   // 2 food      — pink
    vec3(0.4,  1.0,  0.4),   // 3 nature    — green
    vec3(0.8,  0.6,  1.0),   // 4 culture   — lavender
    vec3(1.0,  0.84, 0.0),   // 5 shopping  — gold
    vec3(0.0,  0.8,  0.6),   // 6 wellness  — teal
    vec3(1.0,  0.4,  0.2),   // 7 sports    — red-orange
    vec3(0.6,  0.8,  1.0),   // 8 hotel     — sky
    vec3(0.9,  0.9,  0.9)    // 9 default   — white
  );

  // Polynomial smooth minimum (Inigo Quilez)
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // SDF: signed distance to circle
  float sdf_circle(vec2 p, vec2 center, float radius) {
    return length(p - center) - radius;
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;

    float field = 1e6;
    vec3  blobColor = vec3(0.0);
    float colorWeight = 0.0;

    for (int i = 0; i < 512; i++) {
      if (i >= u_pinCount) break;

      vec4 pin = texture2D(u_pins, vec2((float(i) + 0.5) / 512.0, 0.5));
      vec2 center = pin.xy;
      float baseRadius = pin.z;
      int catId = int(pin.w);

      // Organic wobble: unique phase per pin, subtle radius pulse
      float phase = float(i) * 2.399; // golden-angle offset
      float wobble = sin(u_time * 1.8 + phase) * 0.12 + sin(u_time * 3.1 + phase * 0.7) * 0.06;
      float radius = baseRadius * (1.0 + wobble);

      float d = sdf_circle(fragCoord, center, radius);

      field = (u_smoothK > 0.01)
        ? smin(field, d, u_smoothK)
        : min(field, d);

      // Accumulate category color weighted by proximity
      float w = exp(-max(d, 0.0) * 0.05);
      vec3 catColor = CAT_COLORS[clamp(catId, 0, 9)];
      blobColor    += catColor * w;
      colorWeight  += w;
    }

    if (colorWeight > 0.001) {
      blobColor /= colorWeight;
    }

    // Render layers
    vec4 finalColor = vec4(0.0);

    // Core blob fill
    if (field < 0.0) {
      finalColor = vec4(blobColor, 0.85);
    }
    // Edge glow (neon outline, 2px feather)
    else if (field < 2.5) {
      float t = 1.0 - (field / 2.5);
      t = smoothstep(0.0, 1.0, t); // Smoother ease-in
      finalColor = vec4(blobColor * 1.4, t * 0.9);
    }
    // Outer aura (soft radial falloff)
    else if (field < 12.0) {
      float t = 1.0 - (field / 12.0);
      t = t * t * (3.0 - 2.0 * t); // smoothstep equivalent
      finalColor = vec4(blobColor, t * 0.25);
    }

    gl_FragColor = finalColor;
  }
`;
