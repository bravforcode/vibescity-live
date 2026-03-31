# VibeCity.live — Roadmap

## Milestone 1: Production-Grade Neon Map Experience

**Goal:** Deliver a stunning neon map UI matching the reference design with blazing-fast load performance.

---

### Phase 1: Neon Map Redesign + Performance ✓ COMPLETE (2026-03-21)

**Goal:** Transform map to dark neon aesthetic matching reference image (neon venue signs, dark background, glow effects) + optimize initial load speed (no stutter, no freeze, fast as local)

**Depends on:** —

**Plans:** 4 plans

- [x] 01-01-PLAN.md — Performance foundation: fadeDuration, conditional antialias, defer 3.9MB GeoJSON to idle, delete 12MB unused file
- [x] 01-02-PLAN.md — Neon sign markers: replace PNG pins with rectangular neon signs, category color mapping, remove per-marker Lottie
- [x] 01-03-PLAN.md — Dark atmosphere + YOU ARE HERE: harden setCyberpunkAtmosphere on style.load, new pulsing location dot component
- [x] 01-04-PLAN.md — UI chrome: VibeBanner marquee ticker + VibeActionSheet bottom CTA sheet
