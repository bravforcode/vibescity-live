# VibeCity.live — Project State

## Current Phase

- **Phase:** 2 — Anonymous Identity + Claim Flow
- **Plan:** 02 complete (backend gamification infrastructure)
- **Status:** In progress — Plan 02 done, Plans 01/03/04 pending
- **Last activity:** 2026-03-22 — Plan 02-02 complete (SQL migration + FastAPI gamification router)

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-22)

**Core value:** Discovering the city's vibe tonight feels instant, immersive, and fun — not like browsing a list.
**Current focus:** v1.1 Claim & Earn — Phase 2 (Anonymous Identity + Claim Flow)

## v1.0 Summary

- **Shipped:** 2026-03-21
- **Phases:** 1 (4 plans)
- **Archive:** .planning/milestones/v1.0-ROADMAP.md
- **Tag:** v1.0

## v1.1 Phase Map

| Phase | Name | Requirements | Status |
| --- | --- | --- | --- |
| 2 | Anonymous Identity + Claim Flow | IDENT-01/02, COMP-01, GAME-01/02/03/06, SAFE-01, MAP-02 | Pending |
| 3 | Lucky Wheel + Venue Detail + Discovery UX | GAME-04/05/07, MAP-01, VENUE-01–05, SAFE-02, UX-01 | Pending |
| 4 | Admin Dashboard | ADMIN-01 | Pending |

## Open Tech Debt

- YouAreHere dot at fixed 50%/65% viewport — addressed in Phase 3 (MAP-01)
- `handleClaimVibe` is a no-op stub — addressed in Phase 2 (GAME-01)

## Accumulated Context

### Key Decisions

- SAFE-01 ships atomically with GAME-01 — never activate claims without IP-hash rate limit
- COMP-01 (consent banner) ships in Phase 2 alongside IDENT — PDPA requires consent before any session data write
- MAP-02 (claimed marker glow) ships in Phase 2 — it is part of the claim reward UX, not a map enhancement
- SAFE-02 (vibe rating rate limit) ships in Phase 3 — VENUE-05 (emoji rating) cannot go live without it
- GAME-07 (daily check-in) ships in Phase 3 — depends on working anonymous session from Phase 2
- ADMIN-01 isolated in Phase 4 — standalone; data to display only exists after Phases 2+3
- [02-02] Rate limit 20/hour (not 5/hour) for IP-based claim limiting — NAT/shared-IP in hotels/cafes per research pitfall #6
- [02-02] GET DIAGNOSTICS ROW_COUNT used after INSERT ON CONFLICT DO NOTHING — more reliable than NOT FOUND across Postgres versions
- [02-02] SECURITY DEFINER RPCs for all visitor data access — anon clients never touch tables directly

### Ops Prerequisites (Phase 2)

- Enable "Anonymous Sign-ins" in Supabase dashboard Auth settings (off by default) — config, not code
- Install: `npm install @thumbmarkjs/thumbmarkjs` (Phase 2) and `npm install photoswipe` (Phase 3)

### Research Flags

- Phase 2: LOW — LuckyWheel.vue is the reference implementation; all RPCs exist
- Phase 3: LOW/MEDIUM — GPS projection and PhotoSwipe are well-documented; VenueDetailDrawer layout needs design decisions
- Phase 4: HIGH — admin moderation pipeline has open design questions (resolve before planning)

## Last Session

- **Timestamp:** 2026-03-22T08:30:19Z
- **Stopped At:** Completed 02-02-PLAN.md — backend gamification infrastructure (SQL migration + FastAPI router)
