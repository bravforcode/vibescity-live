# VibeCity.live — Project State

## Current Phase

- **Phase:** 01 — Neon Map Redesign + Performance
- **Current Plan:** 04
- **Status:** In progress

## Progress

- [x] Plan 01: Research + reference gathering
- [x] Plan 02: Neon sign CSS classes (map-atmosphere.css)
- [x] Plan 03: YouAreHere dot + atmosphere hardening
- [ ] Plan 04: (next)

## Accumulated Context

### Roadmap Evolution

- Phase 1 added: Neon Map Redesign + Performance: Transform map to dark neon aesthetic matching reference image (neon venue signs, dark background, glow effects) + optimize initial load speed (no stutter, no freeze, fast as local)

### Decisions

- Plan 01: fadeDuration:0 eliminates white-flash — complete elimination (not a small value) is correct for instant-feel map
- Plan 01: antialias conditioned on hardwareConcurrency > 4 with ?? 4 fallback — defaults to disabled on unknown devices (safer)
- Plan 01: neon roads deferred to map.once('idle') not 'style.load' — 3.9MB GeoJSON parse must not block map ready signal
- Plan 03: YouAreHere positioned at left:50% top:65% (thumb zone) without map.project() — coordinate projection deferred to later plan
- Plan 03: setCyberpunkAtmosphere added to handleMapStyleLoad so dark atmosphere fires on every style.load, including theme switches
- Plan 03: YouAreHere is a sync import (not async) — zero loading delay for UI affordances

### Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01    | 01   | 8min     | 2     | 2     |
| 01    | 03   | 10min    | 2     | 2     |

## Last Session

- **Timestamp:** 2026-03-21T09:00:00Z
- **Stopped At:** Completed 01-01-PLAN.md
