# Feature Research

**Domain:** Anonymous claim-based gamification + venue detail — location-based nightlife discovery (Chiang Mai, Thailand)
**Researched:** 2026-03-22
**Confidence:** HIGH (codebase audit + MEDIUM from multi-source web research; nightlife-specific anonymous gamification is under-documented)

---

## Context: What Already Exists

This is a subsequent milestone research file. The following are already shipped and NOT in scope:

- Mapbox neon map with venue markers (v1.0)
- VibeActionSheet — bottom sheet with "CLAIM YOUR VIBE" and "TAKE ME THERE" buttons (stub, no logic)
- VibeBanner — scrolling marquee
- i18n (en + th)
- LuckyWheel.vue — UI component exists, wired to `gamificationService.spinLuckyWheel()` (Supabase RPC)
- DailyCheckin.vue — UI component exists, wired to `gamificationService.claimDailyCheckin()` (Supabase RPC)
- AchievementBadges.vue — renders badge grid from stats props (client-side conditions only)
- VisitorCount.vue — renders count + crowd level, reads from roomStore
- ReviewSystem.vue — star rating + quick tags, submits to shopStore
- PhotoGallery.vue — lightbox component, accepts images array
- coinStore.js — full XP/level system, persisted to localStorage, has `checkIn()` calling Supabase Edge Function
- gamificationService.js — anonymous visitor ID via `localStorage` (`vibe_visitor_id`), Supabase RPC calls

**What is missing:** The backend RPCs (`spin_lucky_wheel`, `claim_daily_checkin`, `get_lucky_wheel_status`, `get_daily_checkin_status`) are not confirmed to exist in Supabase. The claim flow from VibeActionSheet → coin award → badge unlock → wheel spin is not wired end-to-end. The venue detail drawer (combining PhotoGallery + ReviewSystem + VisitorCount) does not exist as a composed screen.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that, if missing, make the product feel incomplete or broken for a nightlife gamification app.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Anonymous identity that persists across sessions** | No-login apps must remember the user or rewards feel pointless; Foursquare-era apps established this norm | LOW | `vibe_visitor_id` in localStorage already exists in `gamificationService.js`. Needs Supabase backend tables to persist server-side. |
| **Claim flow completes without error** | VibeActionSheet "CLAIM YOUR VIBE" button is already visible to users. A stub that does nothing destroys trust immediately | HIGH | Requires Supabase RPCs + Edge Function wiring. coinStore `checkIn()` exists but calls an unconfirmed `coin-action` Edge Function. |
| **Coin balance visible and persistent** | Users who earn coins must see them. If balance resets on refresh the reward is meaningless (coin economy requires a single source of truth) | MEDIUM | coinStore persists to localStorage; needs server-side sync via `vibe_visitor_id` for cross-device/browser parity |
| **Lucky wheel spins and produces a result** | LuckyWheel.vue is already rendered in the product. A wheel that errors or never lands breaks the core reward promise | HIGH | Supabase RPC `spin_lucky_wheel` must exist and return a prize_code. Server must enforce one-spin-per-day limit. |
| **Duplicate claim prevention** | Check-ins must be idempotent — claiming the same venue twice should be rejected gracefully, not silently award double coins | MEDIUM | coinStore has `hasCollected()` client-side guard. Backend RPC must have a uniqueness check on `(visitor_id, venue_id, date)`. |
| **Venue detail shows photos** | Users tapping into a venue expect more than a name. Photos are the single highest-engagement element in venue discovery (social proof) | MEDIUM | PhotoGallery.vue exists. Needs a venue detail drawer to compose it with other data. Needs real photo URLs from DB or seed data. |
| **Visitor/crowd signal visible** | FOMO-driven nightlife users want to know if a venue is busy tonight. "Packed / Busy / Quiet" is a table-stakes expectation for any nightlife app | MEDIUM | VisitorCount.vue exists. Needs either real WebSocket signals or a plausible seeded count per venue. |
| **Vibe ratings (anonymous, quick)** | Single-tap or emoji-based anonymous rating is expected before users trust writing full reviews | LOW | ReviewSystem.vue exists but requires star rating input. A faster "vibe tag" mechanism (one-tap emoji) is lower friction for anonymous users. |
| **Reward feedback animation** | When coins are awarded, users need immediate visceral feedback — animation + haptic. Without it the reward loop feels hollow | LOW | ConfettiEffect.vue, HeartPop.vue, LottieCoin.vue already exist. Need to wire them to the claim event. |

### Differentiators (Competitive Advantage)

Features that are not universally expected but create memorable experiences in the nightlife/anonymous context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Venue-specific badges (not just count-based)** | Earning a "Night Owl" badge for checking into a specific club feels personal and shareable; count-based badges ("Visit 10 venues") are forgettable | MEDIUM | AchievementBadges.vue has `night_owl`, `live_hunter` badge conditions. Needs server-side verification to prevent spoofing. Venue-specific badge variants (e.g., "Zoe in Yellow Regular") are high-value for retention. |
| **Lucky wheel prize includes venue discount coupon** | Turns the wheel from a coin dispenser into a real-world reward. Young nightlife users respond to "20% off your next drink at [venue]" more than abstract points | HIGH | CouponModal.vue exists in the codebase. Requires merchant partnership data + coupon redemption flow. HIGH complexity but high perceived value. |
| **Claim "ownership" signal on the map marker** | When you claim a vibe, the marker gets a faint glow or crown — visible only to you. Satisfies the psychological ownership drive (Foursquare mayorship equivalent, but visual not competitive) | MEDIUM | Requires marker update via Mapbox layer data. No competing social mechanic, so no leaderboard pressure on new users. |
| **Vibe streak for consecutive nights out** | A "3 nights this week" streak on the main screen creates a lightweight appointment mechanic and FOMO for breaking it | LOW | dailyStreak already tracked in coinStore. Nightlife-specific framing ("On a roll!") differentiates from generic daily streak apps. |
| **One-tap emoji vibe rating (not star rating)** | Emoji ratings (fire, heart, meh, skull) are faster, more expressive, and culturally resonant for young Thai nightlife users than 5-star systems | LOW | ReviewSystem.vue uses star rating + quickTags. An emoji-first mode is faster to build and more on-brand for VibeCity. |
| **"Who's here tonight" anonymous crowd signal** | Showing "14 people vibing here right now" drives real FOMO without exposing identity. More compelling than a static visitor count | HIGH | Requires WebSocket or SSE for real-time updates. roomStore already exists. WebSocket signals are in CLAUDE.md stack. |
| **YouAreHere GPS dot on map** | Seeing yourself on the neon map is viscerally satisfying for exploration. Required for "TAKE ME THERE" navigation to make sense | MEDIUM | YouAreHere.vue exists. PROJECT.md confirms it uses a fixed 50%/65% offset (not real GPS). Needs `map.project()` fix. Already in v1.1 scope. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Public leaderboard (global ranking)** | Gamification "best practices" often cite leaderboards as retention drivers | Users not at the top disengage fast. Foursquare's Swarm research shows global leaderboards create alienation; friend-based micro-leaderboards work, but require social graph which requires identity | Skip global leaderboard entirely for v1.1. If added later, scope to "friends" or "this venue this week" |
| **Forced registration to save progress** | Standard account model; most apps require it | Destroys the anonymous-first value proposition. Any friction before the first reward drops conversion. Foursquare learned that requiring login before gamification killed adoption | Use `vibe_visitor_id` localStorage approach already in gamificationService.js. Offer optional upgrade-to-account later |
| **Daily streak that resets to zero on miss** | Creates urgency, used by Duolingo, Swarm | For nightlife (inherently weekend-heavy), a weekday streak requirement is punishing. Users who go out Thursday–Saturday and not Monday–Wednesday will lose a 4-day streak and churn | Use a "weekly vibe" counter instead of a daily streak. Count unique nights per 7-day window rather than consecutive calendar days |
| **Spin wheel with paid extra spins** | Monetization lever seen in many mobile games | Violates ethical gamification principles for a venue discovery app. Creates a gambling-adjacent perception that can damage brand trust with young Thai users. Also legally ambiguous in Thailand's gaming/gambling law context | One free spin per claim event is sufficient. If monetization needed, use the coupon/discount model (real value) not spin-to-win purchases |
| **Full review text requirement** | Better data quality | Anonymous users with no login will not write paragraphs. Text field with no social identity attached produces spam and fake content. Moderation at scale without accounts is very hard | Quick-tag vibe selection + optional one-line comment. Star/emoji rating required, text optional |
| **Photo upload by anonymous users** | UGC enriches venue pages | Anonymous upload without moderation is a content moderation nightmare. Without accounts there is no way to ban bad actors. Cloudinary auto-moderation helps but still requires budget | Seed photos from venue owners / admin. Enable photo upload only after optional account creation (upgrade path) |
| **Real-time global coin economy / inflation balancing** | Games do this; seems important | At VibeCity's current scale (one city, nightlife, limited venues), coin inflation is not a real problem. Over-engineering economy sinks before there are enough users to matter | Simple fixed earn rates are correct for v1.1. Monitor spend/earn ratio after launch. Add sinks (coupon redemption) when user base exists |

---

## Feature Dependencies

```
[Anonymous Identity — vibe_visitor_id]
    └──required by──> [Venue Claim Flow]
    └──required by──> [Lucky Wheel]
    └──required by──> [Daily Check-in]
    └──required by──> [Vibe Ratings (anonymous)]
    └──required by──> [Coin Balance persistence]

[Venue Claim Flow]
    └──triggers──> [Coin Award]
    └──triggers──> [Badge Check]
    └──triggers──> [Lucky Wheel Spin entitlement]
    └──triggers──> [Confetti / Haptic Feedback]

[Lucky Wheel Spin entitlement]
    └──required for──> [Lucky Wheel UI (spin button enabled)]
    └──may produce──> [Coupon Reward]

[Badge Check]
    └──reads from──> [Coin Store / Stats]
    └──writes to──> [AchievementBadges.vue display]

[Venue Detail Drawer]
    └──composes──> [PhotoGallery.vue]
    └──composes──> [VisitorCount.vue]
    └──composes──> [ReviewSystem.vue / Vibe Rating]
    └──enhanced by──> [Venue Claim Flow] (claim button lives here or in VibeActionSheet)

[YouAreHere GPS fix]
    └──independent of gamification]
    └──enhances──> [TAKE ME THERE navigation]

[Coupon Reward]
    └──requires──> [Lucky Wheel producing coupon prize code]
    └──requires──> [CouponModal.vue wiring]
    └──requires──> [Merchant partnership data in DB]
```

### Dependency Notes

- **Anonymous identity is the root dependency.** Every gamification feature breaks without a stable `vibe_visitor_id` that the backend trusts. The Supabase RPCs must accept and validate `p_visitor_id` as their primary key.
- **Claim flow must exist before wheel.** The wheel spin entitlement is gated by a successful claim. Without the claim flow working end-to-end, the wheel cannot be earned (only the daily spin path exists as an alternative entry).
- **Venue detail drawer is independent.** It can ship without gamification. PhotoGallery + VisitorCount + basic ratings can be a standalone phase. This is the lower-risk path if backend RPCs are delayed.
- **Coupon reward has external dependency.** It requires real merchant data. If no merchant partnerships exist at launch, the wheel prize table must exclude `discount_coupon` and use only coin prizes. CouponModal.vue exists but is blocked by business data.

---

## MVP Definition

### Launch With (v1.1)

Minimum viable product to validate the "claim and earn" loop.

- [ ] **Anonymous identity wired to backend** — `vibe_visitor_id` accepted by all Supabase RPCs, stored in `visitor_sessions` or equivalent table. Without this, every other gamification feature is client-only and spoofable.
- [ ] **Claim flow end-to-end** — VibeActionSheet "CLAIM YOUR VIBE" tap → Supabase `coin-action` Edge Function → coins awarded → badge check → reward feedback animation (confetti/haptic). One-time-per-venue enforcement on server.
- [ ] **Lucky wheel spin works** — `spin_lucky_wheel` RPC returns a prize code, wheel animates to correct segment, prize shown. One spin earned per successful venue claim (or per day via DailyCheckin). Server enforces the limit.
- [ ] **Coin balance persistent and accurate** — balance shown in SmartHeader coin counter, synced from server on load, updated optimistically on award. No double-award on refresh.
- [ ] **Venue detail drawer (read-only)** — bottom drawer with venue photos (seeded), visitor count (from roomStore), and quick vibe tag selector. Full ReviewSystem deferred to v1.x.
- [ ] **YouAreHere GPS fix** — real `map.project()` coordinates so the dot tracks actual device location. Required for "TAKE ME THERE" to be useful and for the map to feel real.

### Add After Validation (v1.x)

- [ ] **Venue-specific badges** — trigger for adding: users ask "what do I get for coming back to the same venue?" (track this via support/feedback)
- [ ] **Emoji vibe rating (one-tap)** — trigger: review submission rate is low, indicating star rating is too much friction
- [ ] **Weekly vibe streak** — trigger: daily check-in engagement rate is measurably higher than venue claim rate; streak adds appointment mechanic
- [ ] **Coupon wheel prize** — trigger: first merchant partnership confirmed; CouponModal.vue already exists

### Future Consideration (v2+)

- [ ] **Friend-based micro-leaderboard** — requires optional account creation first; don't build social without identity
- [ ] **Photo upload by users** — requires account system + moderation pipeline; defer until account upgrade path exists
- [ ] **Anonymous user upgrade-to-account** — when retention data shows users want to preserve progress across devices; not needed at launch

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Anonymous identity → backend | HIGH | LOW | P1 |
| Venue claim flow (end-to-end) | HIGH | HIGH | P1 |
| Lucky wheel spin works | HIGH | MEDIUM | P1 |
| Coin balance visible + persistent | HIGH | MEDIUM | P1 |
| YouAreHere GPS fix | HIGH | LOW | P1 |
| Venue detail drawer (read-only, seeded photos) | HIGH | MEDIUM | P1 |
| Reward feedback animation (confetti/haptic) | MEDIUM | LOW | P1 |
| Duplicate claim prevention (server) | HIGH | MEDIUM | P1 |
| Emoji vibe rating | MEDIUM | LOW | P2 |
| Venue-specific badges | MEDIUM | MEDIUM | P2 |
| Weekly vibe streak | MEDIUM | LOW | P2 |
| Coupon wheel prize | HIGH | HIGH | P2 (blocked on merchant data) |
| Real-time crowd signal (WebSocket) | MEDIUM | HIGH | P2 |
| Public leaderboard | LOW | MEDIUM | P3 (anti-feature) |
| Anonymous photo upload | LOW | HIGH | P3 (anti-feature) |
| Forced registration | LOW | LOW | P3 (anti-feature) |

**Priority key:**
- P1: Must have for v1.1 launch — core reward loop is broken without it
- P2: Should have — adds meaningful retention after core loop validated
- P3: Defer or avoid — high cost, low return, or actively harmful at this stage

---

## Competitor Feature Analysis

| Feature | Foursquare Swarm | Untappd | Our Approach |
|---------|-----------------|---------|--------------|
| Identity model | Requires account | Requires account | Anonymous-first via localStorage UUID — no registration friction |
| Check-in mechanic | GPS-verified check-in | Manual beer log | Venue tap on neon map → CLAIM YOUR VIBE button — intentional action, no GPS spoofing check needed for v1.1 |
| Coin/points | Coins per check-in, streak bonuses | No coins | Fixed earn rates: check-in = 10 coins, first visit = 25 coins, streak bonus = 5 coins |
| Badge system | Sticker packs (collectible) | Beer category badges, brewery badges | Behaviour badges: first_visit, explorer, night_owl, live_hunter, coin_collector, streak_master |
| Spin mechanic | None | None | Lucky wheel: one spin earned per claim event; prizes: coin amounts + (future) discount coupons |
| Leaderboard | Friend-based (not global) | Friends + global (beer count) | None in v1.1 — explicitly deferred to avoid alienating casual users |
| Venue detail | Photos, tips, hours, ratings | Brewery info, beer list | Photos (seeded) + visitor count + vibe rating tags — lightweight for nightlife context |
| Crowd signal | Mayor (visit count leader) | None | Live crowd level: Quiet / Moderate / Busy / Packed — VisitorCount.vue already built |

---

## Reward Psychology Notes (Informing UX Design)

**Variable ratio reinforcement (the wheel):** The lucky wheel uses the same psychological mechanism as slot machines — unpredictable reward size creates higher engagement than fixed rewards. This is ethically acceptable here because: (1) spins are earned, not purchased; (2) all outcomes are positive (minimum prize is 5 coins); (3) there is no "try again" outcome that awards nothing without a path to re-earn. The existing wheel prizes list includes `try_again` (0 coins) — this should be replaced with a minimum 5-coin consolation to maintain positive reinforcement.

**Habit loop:** The check-in flow should complete in under 3 taps: tap marker → tap CLAIM → see reward. Each additional step between trigger and reward reduces dopamine response measurably. The current stub requires 0 extra steps but awards nothing — wiring the reward is the entire value.

**Ownership/claim psychology:** "CLAIM YOUR VIBE" framing taps into the psychological ownership drive (Endowment Effect). Users feel the venue is "theirs" after claiming. This is stronger than a neutral "check in" label. The existing copy is correct.

**FOMO for nightlife:** Showing "14 people vibing here" drives action more reliably than showing the venue rating alone. VisitorCount.vue's crowd level signal is a correct FOMO mechanism. Ensure it is visible in the venue detail drawer before the claim button.

**Streak framing for nightlife:** Daily streak logic is built (coinStore, DailyCheckin.vue), but daily cadence is wrong for nightlife. Users go out 2–3 nights per week, not every day. The streak should be framed as "nights this week" not "days in a row" to avoid punishing the core use pattern.

---

## Sources

- Foursquare Swarm gamification history: [Swarm goes full circle on gamification](https://centrical.com/resources/with-swarm-foursquare-goes-full-circle-with-its-gamification-mechanics/)
- Lucky spin retention and mechanics: [Lucky Spin Feature: From Rewards to Retention — MAF](https://maf.ad/en/blog/lucky-spin-feature/) (fetched blocked, partial from search snippet)
- Variable ratio reinforcement psychology: [The Slot Machine Psyche — PSU](https://www.psu.com/news/the-slot-machine-psyche-how-variable-ratio-reinforcement-drives-modern-gaming-engagement/)
- Ethical gamification vs dark patterns: [The Dark Side of Gamification — Medium](https://medium.com/@jgruver/the-dark-side-of-gamification-ethical-challenges-in-ux-ui-design-576965010dba)
- Mobile reward system best practices: [Building a Reward System — InAppStory](https://inappstory.com/blog/mobile-app-reward-system) (fetched blocked, snippet used)
- Gamification engagement research (2025): [Driving Mobile App User Engagement Through Gamification — Sage Journals](https://journals.sagepub.com/doi/10.1177/00222437241275927)
- Anonymous session + personalization: [Providing Personalization to Anonymous Users — Fingerprint](https://fingerprint.com/blog/providing-personalization-to-anonymous-users/)
- Badge system design patterns: [Collectible Achievements — UI Patterns](https://ui-patterns.com/patterns/CollectibleAchievements)
- Social proof / visitor counts: [Live Visitor Count Nudge — Nudgify](https://www.nudgify.com/popularity-nudge/)
- Virtual economy balance: [Game Economy Inflation — Machinations.io](https://machinations.io/articles/what-is-game-economy-inflation-how-to-foresee-it-and-how-to-overcome-it-in-your-game-design/)
- Codebase audit: `src/services/gamificationService.js`, `src/store/coinStore.js`, `src/components/ui/LuckyWheel.vue`, `src/components/ui/DailyCheckin.vue`, `src/components/ui/AchievementBadges.vue`, `src/components/ui/VibeActionSheet.vue`, `src/components/ui/VisitorCount.vue`, `.planning/PROJECT.md`

---

*Feature research for: anonymous claim-based gamification + venue detail, nightlife discovery app*
*Researched: 2026-03-22*
