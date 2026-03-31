# Milestones

## v1.0 Neon Map (Shipped: 2026-03-21)

**Phases completed:** 1 phase, 4 plans
**Git range:** `f471b06` → `558ec28`
**Files changed:** 24 files, +2,279 / -92 LOC
**Total time:** ~34 min (8 + 4 + 10 + 12 min across 4 plans)

**Key accomplishments:**
1. Eliminated map tile-swap white-flash (`fadeDuration: 0`) and GPU MSAA drain on low-end devices (conditional antialias)
2. Replaced 80x concurrent Lottie SVG animations with static CSS — primary CPU drain eliminated
3. Replaced PNG pin markers with rectangular neon sign DOM elements using per-category glow colors
4. Hardened `setCyberpunkAtmosphere` to fire on every `style.load` — dark neon base survives theme switches
5. Created `VibeBanner.vue` (CSS-only GPU-composited marquee) and `VibeActionSheet.vue` (bottom CTA sheet)
6. Wired `selectedShop` state so marker tap reliably opens action sheet with CLAIM + NAVIGATE CTAs

**Tech debt carried forward:**
- YouAreHere dot at fixed 50%/65% viewport (not GPS-projected via `map.project()`)
- `handleClaimVibe` stub — gamification claim flow deferred to next milestone
- 6 runtime visual tests require human browser verification

---
