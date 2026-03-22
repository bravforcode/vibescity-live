# Requirements: VibeCity.live

**Defined:** 2026-03-22
**Core Value:** Discovering the city's vibe tonight feels instant, immersive, and fun — not like browsing a list.

---

## v1.1 Requirements — Claim & Earn

### Identity

- [ ] **IDENT-01**: User is assigned an anonymous session UUID on first visit (stored in localStorage as `vibe_visitor_id`)
- [ ] **IDENT-02**: Anonymous session UUID is persisted server-side in Supabase, linking the user's gamification state across page reloads

### Compliance

- [ ] **COMP-01**: User sees a one-time consent banner before any session data is written or the claim flow is activated (PDPA/GDPR requirement)

### Gamification

- [ ] **GAME-01**: User can claim a venue vibe (tap CLAIM YOUR VIBE → awards coins + venue badge + lucky wheel spin entitlement)
- [ ] **GAME-02**: Claiming the same venue twice in one calendar day is rejected server-side (idempotent — no double-award)
- [ ] **GAME-03**: User sees reward feedback animation (confetti + haptic) on successful claim
- [ ] **GAME-04**: User can spin the lucky wheel after earning a spin entitlement (one spin unlocked per successful claim)
- [ ] **GAME-05**: Lucky wheel always awards a positive outcome (minimum 5 coins per spin — no zero-award "try again" segment)
- [ ] **GAME-06**: User's coin balance is displayed in the header and server-synced on load (not localStorage-only)
- [ ] **GAME-07**: User can perform a daily check-in bonus (DailyCheckin.vue flow) to earn coins once per calendar day, independent of venue claims

### Map

- [ ] **MAP-01**: YouAreHere dot renders at actual GPS coordinates via `map.project([lng, lat])` (replaces fixed 50%/65% viewport offset)
- [ ] **MAP-02**: Claimed venue markers show a persistent glow ring + crown overlay visible only to the claiming user (stored in session state)

### Venue Detail

- [ ] **VENUE-01**: User can open a venue detail drawer from a marker tap or the action sheet (VenueDetailDrawer.vue — net-new composed component)
- [ ] **VENUE-02**: Venue detail drawer displays a swipeable photo gallery (seeded venue images via PhotoGallery.vue)
- [ ] **VENUE-03**: Venue detail drawer displays current visitor count and crowd level (Quiet / Busy / Packed) via VisitorCount.vue
- [ ] **VENUE-04**: Venue detail drawer displays operating hours and basic venue info (static data from Supabase)
- [ ] **VENUE-05**: User can submit a quick emoji-based vibe rating (fire / heart / meh — anonymous, session-tied, no text required)

### Discovery UX

- [ ] **UX-01**: User can browse venues via swipe card interface (replaces bottom feed horizontal carousel; swipe right = interested / left = skip)

### Admin

- [ ] **ADMIN-01**: Admin can access a password-protected `/admin` route displaying: anonymous session logs, claim event history, vibe rating submissions

### Anti-Abuse

- [ ] **SAFE-01**: Claim events are IP-hash rate-limited server-side (prevents coin farming via localStorage clear or private mode)
- [ ] **SAFE-02**: Emoji vibe rating submissions are routed through FastAPI rate limiter (not direct Supabase anon insert)

---

## v1.x Requirements (Deferred)

### Gamification

- **GAME-08**: User can view their earned venue badges in a dedicated collection view (AchievementBadges.vue)
- **GAME-09**: Streak shown as "nights this week" (weekly window, not consecutive-day model) — after daily check-in engagement validated
- **GAME-10**: Lucky wheel coupon prize tier (venue discount) — blocked on merchant partnership data

### Identity

- **IDENT-03**: Optional account upgrade — user can link their anonymous session to an email for cross-device persistence

### Venue Detail

- **VENUE-06**: Full review text (optional one-line comment with moderation queue) — deferred until emoji rating volume is measured

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Traditional sign-in / registration | No login system by design — anonymous-first is the product concept |
| Public leaderboard | Alienates users not at the top; anti-feature at VibeCity's current scale |
| Anonymous user photo upload | Content moderation requires account identity; defer until account upgrade path exists |
| Paid wheel spins | Ethically problematic + legally ambiguous under Thai gambling law context |
| Proximity GPS enforcement for claims | Adds friction before the core loop is validated; claim is intent-based for v1.1 |
| Real-time WebSocket crowd signal | High complexity; VisitorCount seeded/polled data is sufficient for v1.1 |

---

## Traceability

*(Populated during roadmap creation)*

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDENT-01 | — | Pending |
| IDENT-02 | — | Pending |
| COMP-01 | — | Pending |
| GAME-01 | — | Pending |
| GAME-02 | — | Pending |
| GAME-03 | — | Pending |
| GAME-04 | — | Pending |
| GAME-05 | — | Pending |
| GAME-06 | — | Pending |
| GAME-07 | — | Pending |
| MAP-01 | — | Pending |
| VENUE-01 | — | Pending |
| VENUE-02 | — | Pending |
| VENUE-03 | — | Pending |
| VENUE-04 | — | Pending |
| VENUE-05 | — | Pending |
| MAP-02 | — | Pending |
| UX-01 | — | Pending |
| ADMIN-01 | — | Pending |
| SAFE-01 | — | Pending |
| SAFE-02 | — | Pending |

**Coverage:**
- v1.1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---

*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
