# VibeCity.live — Project State

## Current Phase

- **Phase:** 01 — Neon Map Redesign + Performance
- **Current Plan:** 04
- **Status:** Complete

## Progress

- [x] Plan 01: Research + reference gathering
- [x] Plan 02: Neon sign CSS classes (map-atmosphere.css)
- [x] Plan 03: YouAreHere dot + atmosphere hardening
- [x] Plan 04: Vibe banner + action sheet overlays

## Accumulated Context

### Roadmap Evolution

- Phase 1 added: Neon Map Redesign + Performance: Transform map to dark neon aesthetic matching reference image (neon venue signs, dark background, glow effects) + optimize initial load speed (no stutter, no freeze, fast as local)

### Decisions

- Plan 02: --neon-color CSS var set via style.setProperty — avoids class explosion across 14+ categories
- Plan 02: Static box-shadow only on .neon-sign-marker — no animation on box-shadow prevents known 100% CPU compositing bug
- Plan 02: lottie-web removed from useMapMarkers.js — 80x concurrent SVG animations was primary CPU drain
- Plan 01: fadeDuration:0 eliminates white-flash — complete elimination (not a small value) is correct for instant-feel map
- Plan 01: antialias conditioned on hardwareConcurrency > 4 with ?? 4 fallback — defaults to disabled on unknown devices (safer)
- Plan 01: neon roads deferred to map.once('idle') not 'style.load' — 3.9MB GeoJSON parse must not block map ready signal
- Plan 03: YouAreHere positioned at left:50% top:65% (thumb zone) without map.project() — coordinate projection deferred to later plan
- Plan 03: setCyberpunkAtmosphere added to handleMapStyleLoad so dark atmosphere fires on every style.load, including theme switches
- Plan 03: YouAreHere is a sync import (not async) — zero loading delay for UI affordances
- Plan 04: VibeBanner text is a prop not hardcoded — callers pass t('gamification.vibe_of_hour') for i18n
- Plan 04: VibeActionSheet button labels are props (claimLabel, navigateLabel) — component is i18n-agnostic
- Plan 04: CSS marquee via translateX(-50%) on doubled text spans — GPU-composited, zero JS overhead
- Plan 04: VibeActionSheet bottom padding 80px accounts for BottomNav height
- Plan 04: handleNavigate opens Google Maps daddr URL in new tab — no external SDK needed for MVP

### Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01    | 01   | 8min     | 2     | 2     |
| 01    | 02   | 4min     | 2     | 3     |
| 01    | 03   | 10min    | 2     | 2     |
| 01    | 04   | 12min    | 3     | 4     |

## Last Session

- **Timestamp:** 2026-03-21T09:20:00Z
- **Stopped At:** Completed 01-04-PLAN.md — Phase 01 fully executed and human-approved
