# VibeCity.live — Project

## What This Is

A real-time nightlife discovery map for Chiang Mai, Thailand. Users explore venues on a dark neon-aesthetic Mapbox map, tap markers to see venue details and CTAs, and earn rewards for checking in.

## Core Value

Discovering the city's vibe tonight feels instant, immersive, and fun — not like browsing a list.

## Requirements

### Validated

- ✓ Map loads with dark neon aesthetic (dark background, neon glow markers) — v1.0
- ✓ No map stutter or white-flash on tile load — v1.0 (fadeDuration:0 + deferred GeoJSON)
- ✓ Venue markers are visually distinct neon signs (not generic pins) — v1.0
- ✓ Tapping a marker opens a bottom action sheet with venue name + CTAs — v1.0
- ✓ UI chrome (marquee banner + action sheet) is GPU-composited, no layout jank — v1.0

### Active

- [ ] Gamification claim flow — CLAIM YOUR VIBE button triggers real reward
- [ ] YouAreHere dot tracks actual GPS coordinates (not fixed viewport offset)
- [ ] Venue detail drawer with photos, reviews, visitor count
- [ ] User authentication + profile
- [ ] Daily check-in rewards system

### Out of Scope

- Native mobile app — PWA-first approach
- Video chat / social features — use external tools
- Offline mode — real-time map data is core value

## Context

Shipped v1.0 with ~2,300 LOC changed across 24 files.
Tech stack: Vue 3 + Rsbuild + Mapbox GL JS + FastAPI + Supabase.
GSD planning adopted at v1.0 — prior work existed without structured phases.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `fadeDuration: 0` (not a small value) | Complete elimination, not reduction, gives instant feel | ✓ Good — zero white-flash |
| Static box-shadow on neon markers (no CSS animation) | Animated box-shadow triggers 100% CPU compositing bug | ✓ Good — no CPU spike |
| Lottie removed from per-marker use | 80x concurrent SVG animations was the primary CPU drain | ✓ Good — measurable CPU drop |
| GeoJSON deferred to `map.once('idle')` not `style.load` | 3.9MB parse must not block map ready signal | ✓ Good — map interactive sooner |
| `--neon-color` CSS var via `style.setProperty` | Avoids 14+ category CSS class explosion | ✓ Good — one pattern for all categories |
| YouAreHere at fixed 50%/65% (not `map.project()`) | Deferred coordinate projection to keep Plan 03 scope tight | — Pending — needs GPS tracking in v1.1 |
| VibeActionSheet CTA labels as props | Component is i18n-agnostic; callers pass `t()` values | ✓ Good — reusable |
| `handleClaimVibe` as no-op stub | Gamification backend not ready for v1.0 | — Pending — ship in v1.1 |

## Constraints

- 375px mobile baseline; all touch targets ≥ 44px
- No Mapbox logo, attribution, or compass visible (CSS-hidden)
- All user-facing strings via `t()` — no hardcoded locale text
- No animated `box-shadow` (CPU compositing bug on mobile)

---
*Last updated: 2026-03-21 after v1.0 milestone*
