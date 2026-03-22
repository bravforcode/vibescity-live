# VibeCity.live — Roadmap

## Milestones

- ✅ **v1.0 Neon Map** — Phase 1 (shipped 2026-03-21) — [archive](milestones/v1.0-ROADMAP.md)
- 🔄 **v1.1 Claim & Earn** — Phases 2–4 (in progress)

---

## v1.1 Claim & Earn

**Goal:** Turn venue discovery into a reward loop — users claim vibes, earn coins + badges, spin the lucky wheel, and see live venue detail — without creating an account.

**Requirements:** 21 (IDENT-01/02, COMP-01, GAME-01–07, MAP-01/02, VENUE-01–05, UX-01, ADMIN-01, SAFE-01/02)

---

### Phase 2 — Anonymous Identity + Claim Flow

**Goal:** Users can claim a venue vibe and receive coins + badge feedback, with PDPA-compliant consent and server-side abuse prevention active.

**Dependencies:** Phase 1 complete (neon map + VibeActionSheet exist)

**Requirements:** IDENT-01, IDENT-02, COMP-01, GAME-01, GAME-02, GAME-03, GAME-06, SAFE-01, MAP-02

**Success Criteria:**

1. A first-time visitor sees a one-time consent banner before any gamification data is written; dismissing it stores consent timestamp in localStorage and unblocks the claim flow.
2. After consent, the user is assigned a `vibe_visitor_id` UUID that persists across page reloads and is linked to their gamification state in Supabase.
3. Tapping CLAIM YOUR VIBE on any venue action sheet awards coins, plays confetti animation (and haptic on supported devices), and the coin total in the header updates immediately.
4. Claiming the same venue a second time on the same calendar day shows a rejection message (no double award) — verified client and server-side.
5. A claimed venue's marker shows a persistent glow ring + crown overlay visible only to that user; the overlay survives a full page reload.

**Rate limit boundary:** SAFE-01 (IP-hash rate limit on the claim RPC) ships atomically with GAME-01. The claim endpoint is never activated without the rate limiter in place.

---

### Phase 3 — Lucky Wheel + Venue Detail + Discovery UX

**Goal:** Users can spin the lucky wheel after claiming, explore full venue detail, and browse venues via swipe cards — completing the reward and discovery loops.

**Dependencies:** Phase 2 complete (working anonymous session + coin balance)

**Requirements:** GAME-04, GAME-05, GAME-07, MAP-01, VENUE-01, VENUE-02, VENUE-03, VENUE-04, VENUE-05, SAFE-02, UX-01

**Success Criteria:**

1. After a successful claim, a spin entitlement unlocks the lucky wheel; the user can spin it exactly once and always receives at least 5 coins (no zero-award segment).
2. The user can earn an additional daily check-in bonus once per calendar day, independent of venue claims, via the DailyCheckin.vue flow.
3. Tapping a venue marker (or action sheet) opens a venue detail drawer showing a swipeable photo gallery, current visitor count + crowd level label, and operating hours.
4. The user can submit a single emoji vibe rating (fire / heart / meh) per venue per day; the submission routes through FastAPI (not direct Supabase anon insert) and respects the rate limiter.
5. The YouAreHere dot renders at the user's actual GPS coordinates via `map.project()`; when GPS is unavailable it falls back gracefully without a broken visual.
6. The user can browse venue cards via a swipe-right (interested) / swipe-left (skip) interface in place of the horizontal bottom carousel.

---

### Phase 4 — Admin Dashboard

**Goal:** An admin can view anonymous session logs, claim history, and vibe rating submissions through a protected internal route.

**Dependencies:** Phase 2 + Phase 3 complete (data exists to display)

**Requirements:** ADMIN-01

**Success Criteria:**

1. Navigating to `/admin` with the correct password grants access; navigating without it redirects or shows an access-denied screen.
2. The admin view displays a list of anonymous session events (visitor_id, timestamp, country), claim events (venue_id, visitor_id, coins awarded, date), and vibe rating submissions in readable table form.

---

## Phases

<details>
<summary>✅ v1.0 Neon Map (Phase 1) — SHIPPED 2026-03-21</summary>

- [x] Phase 1: Neon Map Redesign + Performance (4/4 plans) — completed 2026-03-21

</details>

<details>
<summary>🔄 v1.1 Claim & Earn (Phases 2–4) — IN PROGRESS</summary>

- [ ] Phase 2: Anonymous Identity + Claim Flow
- [ ] Phase 3: Lucky Wheel + Venue Detail + Discovery UX
- [ ] Phase 4: Admin Dashboard

</details>

---

## Progress

| Phase | Name | Milestone | Plans Complete | Status | Completed |
| --- | --- | --- | --- | --- | --- |
| 1 | Neon Map Redesign + Performance | v1.0 | 4/4 | Complete | 2026-03-21 |
| 2 | Anonymous Identity + Claim Flow | v1.1 | 0/? | Pending | — |
| 3 | Lucky Wheel + Venue Detail + Discovery UX | v1.1 | 0/? | Pending | — |
| 4 | Admin Dashboard | v1.1 | 0/? | Pending | — |

---

*Roadmap created: 2026-03-22*
*v1.1 requirements: 21/21 mapped*
