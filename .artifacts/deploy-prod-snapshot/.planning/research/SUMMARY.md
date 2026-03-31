# Project Research Summary

**Project:** VibeCity.live — v1.1 (Anonymous Gamification + Venue Detail)
**Domain:** Anonymous-first, location-based nightlife discovery and gamification (Chiang Mai, Thailand)
**Researched:** 2026-03-22
**Confidence:** HIGH

## Executive Summary

VibeCity v1.1 is a gamification milestone that builds directly on the neon map foundation shipped in v1.0. The product is an anonymous-first nightlife discovery app where users explore venues on a Mapbox map, claim vibes at locations, earn coins, spin a lucky wheel, and view venue detail — all without creating an account. The research confirms that the vast majority of the necessary UI scaffolding, libraries, and backend infrastructure already exists in the codebase. The v1.1 work is primarily wiring and activation, not greenfield construction: 8 of the 9 table-stakes features have existing components, stores, or service calls. Only 2 new npm packages are needed (`@thumbmarkjs/thumbmarkjs` and `photoswipe`). Every gamification RPC already exists in Supabase with the correct `anon` role grants.

The recommended approach is a dependency-ordered build sequence: wire the anonymous identity → activate the claim flow → validate the reward loop end-to-end → then add the venue detail drawer and GPS projection as parallel enhancements. The claim flow is the highest-risk item because it spans the full stack (Vue component → Pinia store → Supabase Edge Function → Postgres RPC) and currently terminates at a no-op stub in `HomeView.handleClaimVibe`. Everything else builds on top of a working claim flow. The lucky wheel already follows the server-authoritative pattern correctly — it is the reference implementation.

The most serious risks are legal rather than technical. Thailand's PDPA (enforced actively since August 2025) treats the `vibe_visitor_id` localStorage UUID as personal data. The app currently begins collecting this identifier before any consent interaction. Additionally, the coin reward system has no server-side IP-rate-limiting, making it trivially farmable via localStorage clear or private browsing. Both risks must be addressed in the same phase as claim flow activation — not deferred. Anonymous review spam protection is a secondary risk that must be in scope before the review submission feature goes live.

## Key Findings

### Recommended Stack

The existing stack handles all v1.1 requirements. Only two new packages are needed. `@thumbmarkjs/thumbmarkjs` (MIT license, 0 dependencies) supplements the `vibe_visitor_id` UUID with a multi-signal browser fingerprint to detect device re-identification when localStorage is cleared — it does not replace the UUID, it catches abusers. `photoswipe` v5 (0 dependencies, ~40 kB, dynamically importable) replaces the custom prev/next buttons in `PhotoGallery.vue` with a touch-swipe, pinch-zoom, ARIA-compliant lightbox.

Everything else uses what is already installed: Supabase `signInAnonymously()` is in `@supabase/supabase-js` ^2.95.3, `zod` covers review validation, `lottie-web` and `canvas-confetti` cover reward animations, and `navigator.geolocation` via the existing `locationStore` covers GPS. The critical version requirement is enabling "Anonymous Sign-ins" in the Supabase dashboard Auth settings (off by default) — this is a config change, not a code change.

**Core technologies:**
- `@supabase/supabase-js` ^2.95.3: anonymous auth + gamification RPCs — already installed, just needs dashboard toggle
- `@thumbmarkjs/thumbmarkjs` ^1.0.0: multi-signal browser fingerprint to supplement visitor UUID — MIT licensed, install required
- `photoswipe` ^5.4.4: fullscreen photo lightbox with touch/pinch — dynamically imported, install required
- Existing gamification stack (lottie-web, canvas-confetti, pinia, zod): all reward animations and state — no changes needed

### Expected Features

The feature dependency tree has a single root: anonymous identity. Every gamification feature (claim flow, lucky wheel, coin balance, badge checks) requires a stable `vibe_visitor_id` that the backend trusts. The venue detail drawer and GPS fix are independent of gamification and can ship in parallel.

**Must have (table stakes) — all P1:**
- Anonymous identity wired to backend — `vibe_visitor_id` accepted by all Supabase RPCs with PDPA consent gate
- Venue claim flow end-to-end — VibeActionSheet "CLAIM YOUR VIBE" → `coinStore.checkIn` → Edge Function → reward feedback (currently a no-op stub)
- Lucky wheel spin works — `spin_lucky_wheel` RPC returns prize, wheel animates, server enforces one-spin-per-day limit
- Coin balance visible and persistent — server-synced on load, updated optimistically, no double-award
- Venue detail drawer (read-only, seeded photos) — composes PhotoGallery + VisitorCount + quick vibe rating
- YouAreHere GPS fix — real `map.project()` coordinates via new `useGPSProjection.js` composable
- Reward feedback animation — confetti/haptic on coin award (components exist, just need wiring to claim event)
- Duplicate claim prevention — server-side uniqueness check on `(visitor_id, venue_id, date)`

**Should have (v1.x, after validation):**
- Emoji vibe rating (one-tap fire/heart/meh/skull) — lower friction than star rating for anonymous users
- Venue-specific badges — "Zoe in Yellow Regular" type collectibles for retention
- Weekly vibe streak — "nights this week" framing (not daily streak, which punishes nightlife cadence)
- Coupon wheel prize — blocked on first merchant partnership; CouponModal.vue already exists

**Defer (v2+):**
- Friend-based micro-leaderboard — requires optional account creation first
- Anonymous photo upload — requires account system + content moderation pipeline
- Anonymous user upgrade-to-account — build when retention data shows cross-device demand

**Explicit anti-features to avoid:**
- Global leaderboard — alienates non-top users; Swarm research confirms this
- Forced registration before first reward — destroys anonymous-first value proposition
- Daily streak that resets on miss — punishes nightlife cadence (Thursday–Saturday is the core pattern)
- Paid extra spins — gambling-adjacent perception, legally ambiguous in Thailand

### Architecture Approach

The architecture is a layered Vue 3 app where `HomeView.vue` orchestrates all modal/panel state, composables handle component-local behavior (map, GPS projection), and Pinia stores hold cross-component state (coins, location, venues). All gamification actions flow through Supabase RPCs (`SECURITY DEFINER`, granted to `anon` role) — the frontend never grants coins client-side without server confirmation. This pattern is already correctly implemented in `LuckyWheel.vue` and should be followed exactly for the claim flow.

The only new files required are: `VenueDetailDrawer.vue` (new component), `useAnonymousSession.js` (composable wrapping existing `getVisitorId()`), and `useGPSProjection.js` (composable for `map.project()` → pixel coordinates). Six existing files need modifications; zero new backend routes are needed.

**Major components:**
1. `VenueDetailDrawer.vue` (NEW) — composes PhotoGallery + VisitorCount + quick vibe rating + claim CTA; slide-up panel in HomeView, not a route
2. `useGPSProjection.js` (NEW) — watches `locationStore.userLocation` + map `move` events, returns reactive `{x, y}` pixel position for YouAreHere
3. `useAnonymousSession.js` (NEW) — reactive composable wrapping `gamificationService.getVisitorId()` for components that need to read visitor identity
4. `HomeView.handleClaimVibe` (MODIFY) — wire the current no-op stub to call `coinStore.checkIn(selectedShop.value.id)`
5. `YouAreHere.vue` (MODIFY) — accept `x`/`y` pixel props; fall back to fixed 50%/65% when GPS unavailable
6. `coinStore.js` (MODIFY) — remove `isAuthenticated` guard from `spendCoins`; `checkIn` is already anon-safe

### Critical Pitfalls

1. **PDPA consent gate missing before `vibe_visitor_id` write** — `getVisitorId()` currently writes to localStorage before any user interaction. Thailand's PDPC imposed fines in 8 cases in a single 2025 announcement. Fix: one-time consent banner (non-blocking) before first gamification action; log `consent_given_at` + `consent_policy_version` to localStorage alongside the UUID. Do not gate map browsing — only gamification. Must ship in the same phase as claim flow activation.

2. **Coin farming via localStorage clear or private browsing** — the `vibe_visitor_id` is trivially regenerated by clearing localStorage or using iOS Safari private mode (where `localStorage.setItem` throws). Fix: add IP-hash rate-limiting inside the Supabase RPC (not client-side guards); use `sessionStorage` fallback in `getVisitorId()` for private browsing; consider Cloudflare Turnstile (free, invisible, PDPA-compatible) on claim actions.

3. **Anonymous review spam** — `shopStore.addReview()` inserts directly to Supabase via the `anon` key, bypassing all FastAPI rate limiting. Any script can flood venue ratings. Fix: route review submissions through FastAPI so `slowapi` applies; add RLS INSERT policy requiring visitor_id + 24h uniqueness; add `status: 'pending'` moderation column; cap review text at 1000 chars.

4. **GPS permission denial leaves silent mock distances** — when location is denied, `locationStore` correctly falls back to Chiang Mai center but no UI indicator explains this. Users see "500m away" for venues that are 2km away; proximity-gated check-ins silently fail. Fix: show persistent non-blocking banner on `permissionStatus === 'denied'`; do not call `startWatching()` on app init — trigger from a user action with explanation.

5. **LuckyWheel `transform: rotate` + `box-shadow` on same element causes paint jank on mid-range Android** — Snapdragon 680-class devices (common in Thailand's ฿6,000–฿10,000 phone market) cannot composite these simultaneously with Mapbox WebGL active. Fix: isolate shadow to a parent `.wheel-glow` div; remove `backdrop-filter: blur` from overlay (use opaque background instead); add `will-change: transform` during spin only.

## Implications for Roadmap

Based on research, the feature dependency tree, and the existing codebase state, 3 phases are recommended.

### Phase 02: Anonymous Identity + Claim Flow Activation

**Rationale:** This is the root dependency for all gamification. The claim flow stub (`HomeView.handleClaimVibe` no-op) is the single biggest gap between "looks done" and "actually works." Every other gamification feature requires a trusted `vibe_visitor_id` and a working coin-award path. The PDPA consent risk must be addressed in this same phase — you cannot legally activate coin collection without consent logging. This phase has the most cross-cutting risk and should be validated end-to-end before any UI enhancements.

**Delivers:** Working "CLAIM YOUR VIBE" tap → coin award → badge check → confetti/haptic feedback loop. PDPA-compliant consent gate. Server-side duplicate prevention.

**Addresses:** Anonymous identity (P1), Venue claim flow end-to-end (P1), Coin balance persistent (P1), Reward feedback animation (P1), Duplicate claim prevention (P1).

**Avoids:** PDPA consent pitfall (Critical), Coin farming pitfall (Critical), Client-side coin grant anti-pattern.

**Files changed:** `HomeView.vue` (wire handleClaimVibe), `coinStore.js` (remove auth guard), `gamificationService.js` (sessionStorage fallback, consent log), new consent banner component, `featureFlagStore.js` (add claim feature flag).

**Research flag:** LOW — all patterns are established; Supabase RPCs and Edge Function already exist.

---

### Phase 03: Lucky Wheel Activation + Venue Detail Drawer

**Rationale:** The lucky wheel is already correctly wired (server-authoritative pattern, `spin_lucky_wheel` RPC exists) — it just needs the claim-flow entitlement to gate the spin button. The venue detail drawer is independent of gamification and can build in parallel. Grouping them in one phase makes sense because both require the working anonymous session from Phase 02 and both represent the "reward experience" that completes the engagement loop.

**Delivers:** Fully functional lucky wheel with daily spin enforcement. VenueDetailDrawer with seeded photos, visitor count, quick vibe rating, and claim CTA.

**Addresses:** Lucky wheel spin works (P1), Venue detail drawer read-only (P1), PhotoSwipe integration.

**Avoids:** `try_again` prize giving 0 coins (replace with 5-coin minimum consolation), LuckyWheel mobile jank pitfall (shadow isolation fix must ship here), review localStorage bloat pitfall (remove `reviews` from shopStore persist paths before review volume increases).

**Stack additions:** `npm install photoswipe` — dynamically imported in PhotoGallery.vue.

**Files changed:** `LuckyWheel.vue` (wire spin entitlement from claim), `VenueDetailDrawer.vue` (NEW), `PhotoGallery.vue` (PhotoSwipe lightbox), `shopStore.js` (remove reviews from persist), `useGPSProjection.js` (NEW), `YouAreHere.vue` (accept x/y props), `MapboxContainer.vue` (wire GPS projection).

**Research flag:** LOW for wheel (reference implementation exists) / MEDIUM for VenueDetailDrawer (layout decisions need design input; no wireframes in research).

---

### Phase 04: Anonymous Reviews + Anti-Abuse Hardening

**Rationale:** Reviews should not ship before the anti-abuse layer is in place. The architecture research confirms that `shopStore.addReview()` currently bypasses all rate limiting. This phase treats the review feature and its security hardening as a single deliverable — not separate concerns. The `@thumbmarkjs/thumbmarkjs` fingerprint adds the secondary identity signal that makes IP + fingerprint cross-checking viable for abuse detection.

**Delivers:** Anonymous vibe rating (emoji one-tap) + optional text review. Moderation queue (status: pending/approved). FastAPI proxy for review submissions. IP-hash rate limit in Supabase RPCs. ThumbmarkJS supplemental fingerprint.

**Addresses:** Vibe ratings anonymous quick (P1 table stakes), Anonymous review spam protection (Critical pitfall), Coin farming hardening (Critical pitfall), Pinia persist schema versioning.

**Stack additions:** `npm install @thumbmarkjs/thumbmarkjs`

**Files changed:** `ReviewSystem.vue` or new `EmojiVibeRating.vue`, `shopStore.js` (route reviews through FastAPI), FastAPI: new `POST /ugc/reviews` with `slowapi` rate limit, Supabase migration: add `status` column to `reviews` + updated RLS policy, `gamificationService.js` (add ThumbmarkJS fingerprint alongside visitor_id), `coinStore.js` (add schema version check).

**Research flag:** HIGH — anonymous moderation pipeline (pending/approved flow, bulk moderation UI for admins) has design decisions not covered by research. Phase planning should include deeper research on the admin moderation interface.

---

### Phase Ordering Rationale

- Phase 02 must precede everything because `vibe_visitor_id` is the root dependency for all gamification; the claim flow no-op is the most visible broken promise in the product today
- Phase 03 can begin immediately after Phase 02 is validated because the lucky wheel and venue detail drawer have no blocking dependencies on each other (venue detail is purely additive; wheel just needs the entitlement gate wired)
- Phase 04 is last because the moderation pipeline requires the most external design decisions, and anonymous reviews have the highest legal exposure — they should not ship until the anti-spam layer is production-tested
- GPS YouAreHere fix is grouped in Phase 03 (alongside MapboxContainer changes) to minimize the number of map-layer change sets

### Research Flags

Phases needing deeper research during planning:
- **Phase 04:** Anonymous review moderation pipeline — what does the admin review queue look like? Who approves/rejects? What are the SLAs? Research did not cover admin tooling. Use `/gsd:research-phase` before planning Phase 04.

Phases with standard patterns (skip research-phase):
- **Phase 02:** Claim flow wiring follows the exact LuckyWheel.vue reference implementation; Supabase anonymous auth is well-documented; PDPA consent banner is a standard UI pattern.
- **Phase 03:** PhotoSwipe has official Vue 3 integration docs; GPS projection uses established Mapbox `map.project()` API; VenueDetailDrawer layout is the only ambiguity (resolve in design, not research).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack confirmed by codebase read; only 2 new packages; official docs verified for both |
| Features | HIGH | Codebase audit confirmed what exists vs. what is stubbed; feature priorities derived from codebase state + competitor analysis |
| Architecture | HIGH | All findings from direct codebase reading; build order derived from actual file dependencies; no speculative components |
| Pitfalls | HIGH | PDPA risk verified against official DLA Piper + PDPC sources (2025); localStorage farming confirmed by reading actual gamificationService.js + RPC grant structure; CSS jank confirmed by MDN + codebase reading |

**Overall confidence:** HIGH

### Gaps to Address

- **Admin moderation UI for reviews:** Research identified that reviews need a `status: pending/approved/rejected` column and a moderation queue, but did not scope the admin-facing tool. This must be resolved in Phase 04 planning before implementation starts. Resolve by: either using Supabase Studio as a manual moderation tool (acceptable for low review volume at launch) or building a lightweight admin panel as part of Phase 04.

- **Merchant partnership data for coupon prizes:** The lucky wheel's `try_again` outcome should be replaced with a 5-coin minimum (design decision confirmed by research), but the coupon prize type requires real merchant data that does not exist yet. Phase 03 should ship the wheel with coin-only prizes; CouponModal.vue activation is blocked on a business milestone, not a code milestone.

- **Supabase dashboard toggle for Anonymous Sign-ins:** The `signInAnonymously()` call requires "Anonymous Sign-ins" enabled in the Supabase project Auth settings. This is an ops task, not a code task, but it must happen before any Phase 02 testing. Whoever runs Phase 02 must confirm this is enabled.

- **Proximity-gated check-ins:** The research scoped check-ins as tap-based (not GPS-verified), which is intentional for v1.1. The pitfalls file notes that GPS denial must not silently cause incorrect proximity results. If the product team decides to add GPS proximity verification to the claim flow, this adds significant complexity (geofencing logic, mock-location detection) and should be treated as a separate research question before implementation.

## Sources

### Primary (HIGH confidence — official docs and direct codebase reads)
- Supabase Anonymous Sign-Ins docs — `signInAnonymously()`, `is_anonymous` JWT claim, RLS patterns
- Mapbox GL JS API docs — `map.project()` LngLat-to-pixel conversion
- Thailand PDPA enforcement 2025 — DLA Piper Privacy Matters (active fines confirmed)
- Direct codebase read — `gamificationService.js`, `coinStore.js`, `LuckyWheel.vue`, `VibeActionSheet.vue`, `HomeView.vue` lines 320-322, `locationStore.js`, Supabase migrations `20260223130000` + `20260219000200`
- MDN — Animation performance and frame rate (CSS transform + box-shadow layer promotion)

### Secondary (MEDIUM confidence — web search, npm, community)
- ThumbmarkJS npm page — MIT license, download count, dependency count confirmed
- PhotoSwipe npm + bundlephobia — v5.4.4, 0 dependencies, dynamic import pattern
- Foursquare Swarm gamification history — leaderboard alienation research
- pinia-plugin-persistedstate GitHub — archived Aug 31 2025, migrated to Codeberg confirmed
- Cookie Information / Securiti — PDPA consent requirements and financial inducement risk

### Tertiary (LOW confidence — inferred or blocked fetches)
- Lucky spin retention mechanics — MAF blog (fetch blocked, snippet only)
- Mobile reward system best practices — InAppStory (fetch blocked, snippet only)

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
