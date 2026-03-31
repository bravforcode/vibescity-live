# Stack Research

**Domain:** Location-based gamification app — anonymous identity, gamification, venue detail features
**Researched:** 2026-03-22
**Confidence:** HIGH (existing stack confirmed by codebase read; new additions verified via web search + npm)

---

## Context: What Already Exists (Do NOT re-add)

The following are already in `package.json` and implemented. Research below covers only **net-new** additions.

| Already Present | Version | Why It's Sufficient |
|-----------------|---------|---------------------|
| `@supabase/supabase-js` | ^2.95.3 | Covers `signInAnonymously()`, RLS, Storage, RPC calls |
| `canvas-confetti` | ^1.9.4 | Covers win/reward celebration bursts |
| `@vueuse/core` | ^14.2.0 | Covers `useGeolocation` (no new GPS lib needed) |
| `uuid` | ^13.0.0 | Covers random visitor ID generation fallback |
| `pinia-plugin-persistedstate` | ^4.7.1 (devDep) | Covers anonymous session persistence to localStorage |
| `pinia` | ^3.0.4 | Covers all gamification stores |
| `lottie-web` / `vue3-lottie` | ^5.13.0 / ^3.3.1 | Covers coin/badge award animations |
| `@vueuse/motion` | ^3.0.3 | Covers micro-animations in UI chrome |
| `lucide-vue-next` | ^0.562.0 | Covers all iconography including ratings/stars |
| `zod` | ^4.3.6 | Covers input validation for review/rating payloads |
| `dayjs` | ^1.11.19 | Covers "open now" hours parsing and display |

---

## Net-New Stack Additions

### 1. Browser Fingerprinting (Anonymous Identity)

**Recommendation: `@thumbmarkjs/thumbmarkjs` — MIT licensed, zero external deps**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@thumbmarkjs/thumbmarkjs` | ^1.0.0 (latest as of 2026-03) | Stable browser fingerprint to supplement `crypto.randomUUID()` visitor ID | MIT license (commercial use allowed); 400k+ npm downloads; 0 external dependencies; canvas + audio + WebGL fingerprint; works without cookies; ~74 kB unpacked |

**Why not FingerprintJS v4:** BSL licensed — requires commercial license for production/revenue-generating apps. VibeCity is production SaaS. Avoid.

**Why not custom canvas hash only:** Collision rate too high on mobile Safari where canvas is noise-randomized since iOS 17. ThumbmarkJS combines 8+ signals.

**Integration point:** `src/services/gamificationService.js` already has `getVisitorId()` using `localStorage + crypto.randomUUID()`. ThumbmarkJS fingerprint is stored alongside the UUID as a secondary signal to detect the same device re-generating a new UUID (e.g., incognito bypass). It does NOT replace the UUID — it supplements it.

```bash
npm install @thumbmarkjs/thumbmarkjs
```

---

### 2. Anonymous Auth (Supabase-Native — No New Library)

**Recommendation: Use `supabase.auth.signInAnonymously()` — already in `@supabase/supabase-js` v2.x**

This is NOT a new library addition. The existing `@supabase/supabase-js` ^2.95.3 includes `signInAnonymously()`.

Key facts (HIGH confidence — verified via Supabase official docs):
- Creates a real Supabase user with a UUID and JWT
- JWT includes `is_anonymous: true` claim — usable in RLS policies
- Anonymous users assume the `authenticated` role (not `anon`)
- Session persists via Supabase's own localStorage refresh token
- Cannot recover account after sign-out/clear-data — this is intentional for VibeCity's use case

**RLS pattern for anonymous reviews:**
```sql
-- Allow anonymous + permanent users to submit reviews
create policy "Any authenticated user can insert review"
on reviews as permissive for insert to authenticated
with check (auth.uid() = user_id);

-- Restrict high-value actions to permanent users only
create policy "Only permanent users can claim venue"
on venue_claims as restrictive for insert to authenticated
with check ((select (auth.jwt()->>'is_anonymous')::boolean) is false);
```

**Integration point:** Replace `crypto.randomUUID()` visitor ID pattern in `gamificationService.js` with `supabase.auth.signInAnonymously()` on first visit. Store `supabase.auth.getSession()` — the session JWT becomes the identity token. No `localStorage` UUID needed for auth; UUID can remain as fallback for users who block auth.

---

### 3. Photo Gallery (Venue Detail Drawer)

**Recommendation: `photoswipe` v5 — zero deps, dynamic import, framework-independent**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `photoswipe` | ^5.4.4 | Touch-enabled fullscreen photo lightbox | 0 dependencies; dynamically importable (core only when triggered); keyboard + swipe navigation built in; ARIA-compliant; ~40 kB core |

**Why not Swiper:** `swiper` v12 is ~100 kB gzipped for the full bundle — overkill for a photo-only gallery that opens occasionally. VibeCity already has a custom `PhotoGallery.vue` component. PhotoSwipe gives a native-quality lightbox with zero added framework coupling.

**Why not vue3-picture-swipe:** It is a wrapper with its own opinion on markup. The existing `PhotoGallery.vue` is a custom implementation that should be enhanced, not replaced.

**Integration point:** `src/components/ui/PhotoGallery.vue` currently has custom prev/next buttons with no touch-swipe and no pinch-zoom. Wrap with PhotoSwipe Lightbox via dynamic import triggered on thumbnail tap. Supabase Storage already provides image URLs — no upload lib needed on the frontend.

```bash
npm install photoswipe
```

**Usage pattern (dynamic import):**
```javascript
// Only loads PhotoSwipe core when gallery opens
const { default: PhotoSwipeLightbox } = await import('photoswipe/lightbox')
await import('photoswipe/style.css')
```

---

### 4. Gamification: Lucky Wheel, Coins, Badges

**Recommendation: No new libraries. All tools already present.**

| Feature | Existing Tool | Approach |
|---------|---------------|----------|
| Wheel spin animation | CSS `transform: rotate()` + `requestAnimationFrame` or `@vueuse/motion` | `LuckyWheel.vue` already exists and implements canvas-based wheel |
| Win confetti | `canvas-confetti` ^1.9.4 (already installed) | Already wired; `ConfettiEffect.vue` exists |
| Coin award animation | `lottie-web` / `vue3-lottie` (already installed) | `LottieCoin.vue` already exists |
| Badge display | `lucide-vue-next` icons + CSS | `AchievementBadges.vue` already exists |
| Coin/badge persistence | `pinia` + `pinia-plugin-persistedstate` (already installed) | `coinStore.js` already exists |
| Server-authoritative rewards | `@supabase/supabase-js` RPC calls | `gamificationService.js` already has `claimDailyCheckin()` |

**Assessment:** `LuckyWheel.vue`, `AchievementBadges.vue`, `DailyCheckin.vue`, `gamificationService.js` are all already scaffolded. The v1.1 work is connecting these components to the anonymous Supabase auth identity, not adding new libraries.

---

### 5. Anonymous Reviews & Ratings

**Recommendation: No new libraries. `zod` + Supabase + existing `ReviewSystem.vue`.**

| Feature | Existing Tool | Notes |
|---------|---------------|-------|
| Form validation | `zod` ^4.3.6 (already installed) | Review content + rating schema validation |
| Submission | `@supabase/supabase-js` RPC or `.from('reviews').insert()` | Use anon JWT as `user_id` |
| Star rating UI | Custom CSS + `lucide-vue-next` | `ReviewSystem.vue` already implements 5-star rating |
| Rate limiting | FastAPI + Redis (already in stack) | Enforce 1 review per visitor per venue per 24h via server |
| Display | `@tanstack/vue-query` ^5.92.8 (already installed) | Cache reviews per venue, invalidate on new submission |

`ReviewSystem.vue` already exists and connects to `shopStore.fetchShopReviews()`. The v1.1 work is: (a) wiring anon auth so `user_id` is the Supabase anon UUID, and (b) ensuring the RLS policy allows `is_anonymous` users to insert exactly one review per venue.

---

### 6. GPS / YouAreHere Fix

**Recommendation: No new libraries. `navigator.geolocation` + `map.project()` + existing `locationStore`.**

| Feature | Existing Tool | Notes |
|---------|---------------|-------|
| GPS coordinates | `navigator.geolocation.watchPosition` (native browser API) | Already fully implemented in `src/store/locationStore.js` |
| Reactive coords | `locationStore.userLocation` (Pinia) | Already exposes `[lat, lng]` array |
| Map pixel projection | `mapboxgl.Map.project(lngLat)` | Native Mapbox method; takes LngLat, returns `{x, y}` Point |
| YouAreHere marker | `src/components/ui/YouAreHere.vue` | Component exists; needs to be positioned via `map.project()` |
| Accuracy ring | CSS animation in `YouAreHere.vue` | Already has `yah-outer-ring` pulse animation |

**Integration pattern for `MapboxContainer.vue`:**
```javascript
// On map 'move' and location update
const point = map.value.project([lng, lat])
// Set YouAreHere div position via CSS left/top
youAreHereStyle.value = { left: `${point.x}px`, top: `${point.y}px` }
```

The `YouAreHere.vue` component uses `position: absolute` with `transform: translate(-50%, -50%)` — it's built to accept pixel coordinates. The only missing piece is re-running `map.project()` on every map `move` event, which requires adding a single `map.on('move', updateYouAreHere)` listener in `MapboxContainer.vue`.

**Why not Mapbox GeolocateControl:** It adds a blue dot but the VibeCity design requires the custom `YouAreHere` neon component with the pulsing ring. GeolocateControl cannot be styled to match the neon map aesthetic without hacky CSS overrides.

---

## Summary: Net-New Installs Required

```bash
# Only 2 new packages needed for all v1.1 features
npm install @thumbmarkjs/thumbmarkjs photoswipe
```

Everything else — anonymous auth, gamification, reviews, GPS — uses existing stack capabilities that are already installed and partially implemented.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Fingerprinting | `@thumbmarkjs/thumbmarkjs` | `@fingerprintjs/fingerprintjs` v4 | BSL license — commercial use requires paid plan |
| Fingerprinting | `@thumbmarkjs/thumbmarkjs` | `fingerprintjs` v3 | v3 is unmaintained; v4 is BSL |
| Photo gallery | `photoswipe` v5 | `swiper` v12 | Swiper is ~100 kB gzipped for full bundle; overkill for photo-only |
| Photo gallery | `photoswipe` v5 | `vue3-picture-swipe` | Adds framework wrapper overhead; custom PhotoGallery.vue already exists |
| Anonymous auth | Supabase `signInAnonymously()` | UUID-only in localStorage | UUID is erasable (incognito, clear data); Supabase anon auth gives durable server-side identity |
| GPS | Native `navigator.geolocation` | `@vueuse/core` `useGeolocation` | locationStore.js already implements watchPosition directly; no benefit adding VueUse wrapper over existing implementation |
| Lucky wheel | CSS + existing canvas-confetti | npm lucky-wheel packages | All reviewed packages are unmaintained or lack Vue 3 types; existing LuckyWheel.vue is purpose-built |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@fingerprintjs/fingerprintjs` v4+ | BSL license restricts production commercial use | `@thumbmarkjs/thumbmarkjs` (MIT) |
| `swiper` (full) | 100 kB gzipped; tree-shaking requires careful module selection; PhtoSwipe handles gallery better | `photoswipe` for galleries, `@vueuse/motion` for swipe gestures |
| Any "gamification framework" npm package | All surveyed packages (vue3-lucky-wheel, etc.) are abandoned or toy-grade; existing LuckyWheel.vue is production-ready | Keep existing LuckyWheel.vue, extend it |
| A separate "analytics" SDK for gamification events | Vercel Analytics already in stack; Microsoft Clarity already in stack | Use existing event tracking |
| `vue-mapbox-gl` wrapper | Adds abstraction over Mapbox GL JS that conflicts with existing direct API usage in useMapCore.js | Continue using mapboxgl directly |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@thumbmarkjs/thumbmarkjs` ^1.0.0 | Vue 3.5, Rsbuild 1.7, modern ESM | Pure browser API calls; no SSR concerns; tree-shakeable |
| `photoswipe` ^5.4.4 | Vue 3.5, Rsbuild 1.7, modern ESM | 0 dependencies; dynamic import safe; CSS import must be explicit |
| `@supabase/supabase-js` ^2.95.3 | Already installed — `signInAnonymously()` available in 2.x | Enable "Anonymous Sign-ins" in Supabase dashboard Auth settings (off by default) |

---

## Sources

- [ThumbmarkJS npm (@thumbmarkjs/thumbmarkjs)](https://www.npmjs.com/package/@thumbmarkjs/thumbmarkjs) — MIT license, version, download count confirmed (MEDIUM confidence — WebSearch + npm)
- [FingerprintJS BSL license](https://github.com/fingerprintjs/fingerprintjs/blob/master/LICENSE) — BSL restriction for production confirmed (HIGH confidence — official GitHub)
- [Supabase Anonymous Sign-Ins docs](https://supabase.com/docs/guides/auth/auth-anonymous) — `signInAnonymously()`, `is_anonymous` JWT, RLS patterns confirmed (HIGH confidence — official docs)
- [PhotoSwipe npm](https://www.npmjs.com/package/photoswipe) — v5.4.4, 0 deps, dynamic import pattern confirmed (MEDIUM confidence — WebSearch + npm)
- [VueUse useGeolocation](https://vueuse.org/core/usegeolocation/) — existing `@vueuse/core` covers GPS if needed (HIGH confidence — official docs)
- [Mapbox GL JS GeolocateControl](https://docs.mapbox.com/mapbox-gl-js/api/markers/) — `map.project()` LngLat→pixel, GeolocateControl accuracy circle behavior confirmed (HIGH confidence — official docs)
- [Swiper v12 Bundlephobia](https://bundlephobia.com/package/swiper) — size comparison reference (MEDIUM confidence — WebSearch)
- [pinia-plugin-persistedstate](https://prazdevs.github.io/pinia-plugin-persistedstate/) — sessionStorage support confirmed (HIGH confidence — official docs)

---

*Stack research for: VibeCity v1.1 — anonymous identity, gamification, venue detail, GPS*
*Researched: 2026-03-22*
