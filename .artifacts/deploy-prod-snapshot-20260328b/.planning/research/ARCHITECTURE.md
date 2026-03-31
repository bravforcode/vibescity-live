# Architecture Research

**Domain:** Location-based gamification app (anonymous identity + gamification + venue detail)
**Researched:** 2026-03-22
**Confidence:** HIGH — all findings drawn directly from reading the live codebase

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                               │
│                                                                          │
│  HomeView.vue (orchestrator)                                             │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────────────┐  │
│  │MapboxContainer│  │  VibeActionSheet   │  │  VenueDetailDrawer (new) │  │
│  │(YouAreHere   │  │  (claim stub→live) │  │  (replaces/extends ASheet│  │
│  │ inside here) │  │                   │  │   with full venue data)  │  │
│  └──────┬───────┘  └────────┬──────────┘  └──────────────────────────┘  │
│         │                   │                                            │
│  ┌──────┴───────┐  ┌────────┴──────────┐  ┌──────────────────────────┐  │
│  │LuckyWheel.vue│  │  VibeBanner.vue   │  │  AchievementBadges.vue   │  │
│  │(already built│  │ (already built)   │  │  (already built)         │  │
│  │  needs wire) │  │                   │  │                          │  │
│  └──────────────┘  └───────────────────┘  └──────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                         COMPOSABLE LAYER                                 │
│                                                                          │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────────────┐  │
│  │useMapCore.js │  │useAppLogic.js     │  │useLocation.js            │  │
│  │(map instance)│  │(orchestrates all  │  │(GPS watchPosition,       │  │
│  │              │  │ UI + data state)  │  │ permission flow)         │  │
│  └──────────────┘  └───────────────────┘  └──────────────────────────┘  │
│                                                                          │
│  NEW: useAnonymousSession.js — visitor_id lifecycle                      │
│  NEW: useGPSProjection.js    — map.project([lng,lat]) → pixel {x,y}     │
├─────────────────────────────────────────────────────────────────────────┤
│                         STATE LAYER (Pinia stores)                       │
│                                                                          │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────────────┐  │
│  │ userStore.js │  │  coinStore.js     │  │  locationStore.js        │  │
│  │(auth session │  │(coins, collectedV,│  │(GPS coords, watch, fallb)│  │
│  │ + profile)   │  │ achievements,     │  │                          │  │
│  │              │  │ pendingRewards)   │  │                          │  │
│  └──────────────┘  └───────────────────┘  └──────────────────────────┘  │
│                                                                          │
│  ┌──────────────┐  ┌───────────────────┐                                │
│  │ shopStore.js │  │featureFlagStore.js│                                │
│  │(venues,      │  │(remote kill-switch│                                │
│  │ rawShops,    │  │ per feature)      │                                │
│  │ filteredShops│  │                   │                                │
│  └──────────────┘  └───────────────────┘                                │
├─────────────────────────────────────────────────────────────────────────┤
│                         SERVICE LAYER                                    │
│                                                                          │
│  gamificationService.js  ← already exists, calls Supabase RPCs          │
│  (getVisitorId, getUserOrVisitorId, getDailyCheckinStatus,               │
│   claimDailyCheckin, getLuckyWheelStatus, spinLuckyWheel)                │
│                                                                          │
│  shopService.js  ← getMapPins RPC, venue data                           │
├─────────────────────────────────────────────────────────────────────────┤
│                         DATA LAYER                                       │
│                                                                          │
│  Supabase Postgres + RLS                   FastAPI on Fly.io             │
│  ┌─────────────────────────────┐           ┌────────────────────────┐   │
│  │user_stats (visitor_id PK)   │           │ /shops (cached 60s)    │   │
│  │lucky_spins (daily unique)   │           │ /shops/{id} (detail)   │   │
│  │venues / map_pins_v3 view    │           │ /vibes (WebSocket)     │   │
│  │feature_flags_public         │           └────────────────────────┘   │
│  └─────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Existing Components (v1.0)

| Component | Responsibility | Status for v1.1 |
|-----------|----------------|-----------------|
| `HomeView.vue` | Root orchestrator — modal state, composable wiring | Modify: wire handleClaimVibe, pass GPS coords to MapboxContainer |
| `MapboxContainer.vue` | Map init (useMapCore), markers, layers, YouAreHere host | Modify: pass real GPS pixel position to YouAreHere |
| `YouAreHere.vue` | Fixed-position pulsing dot at 50%/65% | Modify: accept `x`/`y` pixel props instead of fixed CSS |
| `VibeActionSheet.vue` | Bottom sheet with Claim + Navigate buttons | Modify: emit claim triggers coinStore.checkIn |
| `VibeBanner.vue` | Top marquee banner | No change needed |
| `LuckyWheel.vue` | Spin-to-win modal, already calls gamificationService | No change — already wired correctly |
| `coinStore.js` | Coins, achievements, streak, pendingRewards | Modify: decouple from userStore.isAuthenticated guard — allow anon via visitor_id |
| `userStore.js` | Auth session + profile | No change — anon path bypasses this store |
| `locationStore.js` | GPS watchPosition, accuracy, permission state | No change needed — already correct |
| `gamificationService.js` | getVisitorId(), getUserOrVisitorId(), all Supabase RPCs | No change — already handles anon via localStorage visitor_id |
| `featureFlagStore.js` | Remote feature flags from Supabase | Extend: add flags for new features |

### New Components (v1.1)

| Component | Responsibility | Integration |
|-----------|----------------|-------------|
| `VenueDetailDrawer.vue` | Full venue detail panel: photos, hours, distance, claim button, share | Replaces or extends VibeActionSheet for "expand" flow; emitted from handleMarkerClick in HomeView |
| `useAnonymousSession.js` | Single source of truth for visitor_id — generates UUID, persists to localStorage, exposes computed `visitorId` ref | Used by gamificationService (already inline there), but extracted to composable for reactive use in components |
| `useGPSProjection.js` | Takes `map` ref + `locationStore.userLocation`, returns reactive pixel `{x, y}` using `map.project([lng, lat])`, debounced on map `move` event | Used by MapboxContainer to drive YouAreHere position |

---

## Recommended Project Structure (additions only)

```
src/
├── composables/
│   ├── map/
│   │   ├── useMapCore.js            (existing)
│   │   ├── useMapLayers.js          (existing)
│   │   └── useGPSProjection.js      (NEW — map.project() → pixel x,y)
│   └── useAnonymousSession.js       (NEW — visitor_id lifecycle)
│
├── components/
│   └── ui/
│       ├── VibeActionSheet.vue      (existing — wire claim emit)
│       ├── YouAreHere.vue           (existing — add x/y props)
│       ├── LuckyWheel.vue           (existing — no change)
│       └── VenueDetailDrawer.vue   (NEW — full venue detail)
│
├── store/
│   ├── coinStore.js                 (existing — loosen anon guard)
│   └── featureFlagStore.js          (existing — add new flag keys)
│
└── services/
    └── gamificationService.js       (existing — no change)
```

---

## Architectural Patterns

### Pattern 1: Anonymous-First Identity via localStorage UUID

**What:** `gamificationService.js` already implements this. `getVisitorId()` generates a `crypto.randomUUID()` UUID on first visit, persists to `localStorage("vibe_visitor_id")`, and returns it on every subsequent call. `getUserOrVisitorId()` checks Supabase auth first, falls back to the visitor ID. Supabase RPCs (`get_daily_checkin_status`, `claim_daily_checkin`, `get_lucky_wheel_status`, `spin_lucky_wheel`) all accept `p_visitor_id TEXT` and are granted to `anon` role — no login required.

**When to use:** Always — this is the default identity for all gamification actions. Auth login later can merge/upgrade the same visitor_id to a user_id on the server side.

**Trade-offs:** localStorage can be cleared by user, losing gamification state. This is acceptable for an anonymous session — the server has the authoritative state keyed by visitor_id. If user clears storage, they get a new visitor_id and start fresh. Do not attempt to fingerprint — localStorage UUID is sufficient per the existing design.

**Example (existing pattern to follow):**
```javascript
// src/services/gamificationService.js
const getVisitorId = () => {
  let vid = localStorage.getItem("vibe_visitor_id");
  if (!vid) { vid = crypto.randomUUID(); localStorage.setItem("vibe_visitor_id", vid); }
  return vid;
};
```

### Pattern 2: Supabase RPC for Server-Authoritative Gamification

**What:** All coin-granting actions go through Supabase RPCs (`SECURITY DEFINER` functions) that enforce daily limits atomically. The frontend calls `supabase.rpc("spin_lucky_wheel", { p_visitor_id })` and trusts the server response. Client state (coinStore) is updated optimistically only after server confirmation.

**When to use:** Any action that grants coins or badges. Never grant coins purely client-side.

**Trade-offs:** Requires Supabase connection. LuckyWheel.vue already follows this pattern correctly.

**Example:**
```javascript
// in gamificationService.js
async spinLuckyWheel() {
  const { userId } = await getUserOrVisitorId();
  const { data, error } = await supabase.rpc("spin_lucky_wheel", { p_visitor_id: userId });
  if (error) throw error;
  return unwrapRpcData(data);
}
```

### Pattern 3: map.project() for GPS-to-Pixel Coordinate Conversion

**What:** Mapbox GL JS exposes `map.project([lng, lat])` which returns `{x, y}` in canvas pixel coordinates. To position `YouAreHere.vue` at the user's actual GPS location rather than the fixed 50%/65% CSS position, a new `useGPSProjection.js` composable should watch both `locationStore.userLocation` and map `move`/`zoom`/`rotate` events, and recompute `{x, y}` on each change. The resulting pixel coordinates are passed as props to `YouAreHere.vue` which sets `left: x + 'px'; top: y + 'px'` inline style inside the map container's `position: relative` wrapper.

**When to use:** YouAreHere dot, any UI element that must track a geographic coordinate in screen space (e.g. proximity radius circle label).

**Trade-offs:** Must debounce on `move` to avoid excessive re-renders during pan. The composable should only be active when `locationStore.hasLocation` is true and map is ready. Falls back to fixed 50%/65% when GPS unavailable (existing YouAreHere behavior).

**Example (pattern to implement):**
```javascript
// useGPSProjection.js
import { computed, ref, watch, onUnmounted } from "vue";
import { useLocationStore } from "@/store/locationStore";

export function useGPSProjection(map, isMapReady) {
  const locationStore = useLocationStore();
  const pixelPos = ref(null); // { x, y } or null

  const reproject = () => {
    if (!map.value || !isMapReady.value || !locationStore.userLocation) {
      pixelPos.value = null;
      return;
    }
    const [lat, lng] = locationStore.userLocation;
    pixelPos.value = map.value.project([lng, lat]); // Mapbox is [lng, lat]
  };

  watch([() => locationStore.userLocation, isMapReady], reproject, { immediate: true });

  let handler = null;
  watch(isMapReady, (ready) => {
    if (!ready || !map.value) return;
    handler = () => reproject();
    map.value.on("move", handler);
  });

  onUnmounted(() => {
    if (map.value && handler) map.value.off("move", handler);
  });

  return { pixelPos };
}
```

### Pattern 4: Composable-Scoped State, Store for Cross-Component State

**What:** The existing codebase uses composables for component-local behavior (map rendering, gesture handling) and Pinia stores for state that multiple components need to share (coins, user session, shop list, location). New features should follow the same boundary: the GPS projection is composable-scoped (MapboxContainer internal), the coin balance is store-state (used by SmartHeader coin counter + VibeActionSheet + LuckyWheel).

**When to use:** If two or more components need the same reactive state, put it in a store. If one component owns the logic, use a composable.

### Pattern 5: handleClaimVibe → coinStore.checkIn wiring

**What:** `VibeActionSheet.vue` emits a `claim` event. `HomeView.vue` currently has a no-op `handleClaimVibe` stub. The v1.1 wire-up is:
```javascript
// HomeView.vue
const handleClaimVibe = async () => {
  if (!selectedShop.value?.id) return;
  const result = await coinStore.checkIn(selectedShop.value.id, selectedShop.value.name);
  if (result.success) {
    // pendingRewards in coinStore will trigger reward popup (existing pattern)
  }
};
```
`coinStore.checkIn` calls the Supabase Edge Function `coin-action` → updates local state → queues `pendingRewards`. The reward notification UI reads `pendingRewards` from coinStore.

---

## Data Flow

### Anonymous Session Initialization

```
App mount
    ↓
gamificationService.getVisitorId()
    ↓ (generates UUID if missing)
localStorage("vibe_visitor_id") = UUID
    ↓
All RPC calls pass p_visitor_id = UUID
    ↓ (Supabase: SECURITY DEFINER, anon role)
user_stats row created on first call
```

### Claim Vibe Flow

```
User taps map marker
    ↓
MapboxContainer emits "select-shop" → HomeView.selectedShop.value = shop
    ↓
HomeView renders VibeActionSheet (visible=true, shop=selectedShop)
    ↓
User taps "CLAIM YOUR VIBE"
    ↓
VibeActionSheet emits "claim"
    ↓
HomeView.handleClaimVibe() → coinStore.checkIn(venueId)
    ↓ (checks hasCollected — already collected = no-op)
supabase.functions.invoke("coin-action", { action_type: "check_in", venue_id })
    ↓ (server returns { success, amount })
coinStore.coins += amount
coinStore.collectedVenues.push(venueId)
coinStore.pendingRewards.push({ type: "coins", amount })
    ↓
SmartHeader coin counter updates (reads coinStore.coins)
Reward popup fires (reads coinStore.pendingRewards)
```

### Lucky Wheel Flow

```
User opens LuckyWheel (via SidebarDrawer or DailyCheckin trigger)
    ↓
LuckyWheel.show() → loadSpinStatus()
    ↓
gamificationService.getLuckyWheelStatus()
    → supabase.rpc("get_lucky_wheel_status", { p_visitor_id })
    ↓ (returns { can_spin_today, last_spin_at, balance })
User taps SPIN (if can_spin_today)
    ↓
gamificationService.spinLuckyWheel()
    → supabase.rpc("spin_lucky_wheel", { p_visitor_id })
    ↓ (server picks random prize, inserts lucky_spins row, updates user_stats)
LuckyWheel receives { prize } → animates to prize index → shows result
    ↓
Emits "spin-complete" → HomeView can call coinStore.awardBonus(prize.value)
```

### GPS to YouAreHere Dot Flow

```
locationStore.startWatching() [called from useAppLogic or HomeView.onMounted]
    ↓
navigator.geolocation.watchPosition → locationStore.userLocation = [lat, lng]
    ↓
useGPSProjection watches userLocation + map "move" events
    ↓
map.project([lng, lat]) → pixelPos = { x, y }
    ↓
MapboxContainer passes :style="{ left: pixelPos.x+'px', top: pixelPos.y+'px' }" to YouAreHere
    ↓
YouAreHere renders at real GPS position within map canvas div
```

---

## Integration Points

### New vs Modified: Component List

| Component/Store/File | New or Modified | Change |
|----------------------|-----------------|--------|
| `src/components/ui/VenueDetailDrawer.vue` | **NEW** | Full venue detail — photos, hours, distance, claim CTA, share button |
| `src/composables/useAnonymousSession.js` | **NEW** | Wrap existing `gamificationService.getVisitorId()` as a reactive composable; single call site |
| `src/composables/map/useGPSProjection.js` | **NEW** | map.project() → pixel x,y for YouAreHere |
| `src/components/ui/YouAreHere.vue` | **Modified** | Add `x`/`y` props (Number); when provided, use `position:absolute; left:Xpx; top:Ypx` inline style. Keep fixed 50%/65% as fallback when props are null |
| `src/components/ui/VibeActionSheet.vue` | **Modified** | Emit `"claim"` is already there. HomeView must wire `handleClaimVibe` to call `coinStore.checkIn` |
| `src/views/HomeView.vue` | **Modified** | Wire handleClaimVibe (currently no-op stub at line 320-322). Add VenueDetailDrawer wiring. Pass GPS pixel pos to MapboxContainer |
| `src/components/map/MapboxContainer.vue` | **Modified** | Initialize useGPSProjection, pass pixel pos as prop to YouAreHere |
| `src/store/coinStore.js` | **Modified** | The `checkIn()` action already calls Edge Function correctly. Remove the `isAuthenticated` guard in `spendCoins` only — checkIn is already anon-safe |
| `src/store/featureFlagStore.js` | **Modified** | Add default flags for new features: `enable_venue_detail_drawer`, `enable_gps_you_are_here` |
| `src/services/gamificationService.js` | **No change** | Already handles anon session. Already calls correct RPCs. |
| Supabase migrations | **No new needed** | All RPCs (spin_lucky_wheel, get_lucky_wheel_status, claim_daily_checkin, get_daily_checkin_status) already exist with `anon` GRANT from migration 20260223130000 |

### New API Endpoints Needed

No new FastAPI endpoints are needed for the core v1.1 features. Gamification state flows through Supabase RPCs directly from the frontend, following the existing pattern.

If a venue detail endpoint is needed beyond what shopStore already fetches:
- `GET /shops/{shop_id}` — already exists in `backend/app/api/routers/shops.py`. No new route needed. The VenueDetailDrawer reads from `shopStore.shops` (already loaded) or triggers a detail fetch from this endpoint.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MapboxContainer ↔ HomeView | Props down (`shops`, `userLocation`, `highlightedShopId`), events up (`select-shop`, `open-detail`) | Already established in v1.0. No new props needed except potentially `gpsPixelPos` or this can remain internal to MapboxContainer |
| VibeActionSheet ↔ HomeView | Prop `shop`, `visible`; events `claim`, `navigate`, `close` | Wire `claim` → `coinStore.checkIn` in HomeView |
| coinStore ↔ SmartHeader | Pinia store subscription — SmartHeader reads `coinStore.coins` | No change needed |
| gamificationService ↔ coinStore | gamificationService is called by coinStore.checkIn and awardBonus | Already wired via Edge Function |
| locationStore ↔ MapboxContainer | locationStore.userLocation passed via HomeView prop `userLocation` | Existing path — add useGPSProjection inside MapboxContainer consuming this |

---

## Suggested Build Order

Build order is constrained by dependencies. Each step is unblocked by the previous.

### Step 1: Wire handleClaimVibe in HomeView (1–2 hours)
**Dependency:** None — stub already exists at HomeView.vue line 320.
**Change:** HomeView.handleClaimVibe calls `coinStore.checkIn(selectedShop.value.id)`. Test with any venue tap.
**Why first:** Validates the claim path end-to-end (VibeActionSheet → coinStore → Supabase Edge Function → pendingRewards). Catches any RLS or Edge Function issues before building more UI on top.

### Step 2: Verify gamificationService anon session (0.5 hours)
**Dependency:** Step 1 complete.
**Change:** Confirm `localStorage("vibe_visitor_id")` is set on first load. Confirm Supabase RPCs return correct data. No code changes likely needed — gamificationService.js is already correct.
**Why second:** De-risks all subsequent gamification work. If the RPC grants are wrong, catch it here.

### Step 3: Extract useAnonymousSession.js composable (1 hour)
**Dependency:** Step 2 confirmed working.
**Change:** Wrap `getVisitorId()` and `getUserOrVisitorId()` as a reactive Vue composable exposing `visitorId` as a `computed` ref. Update any component that needs to display or reactively track visitor ID.
**Why third:** Centralizes identity — needed before building VenueDetailDrawer which will need to check `hasCollected(venueId)` from coinStore.

### Step 4: Implement useGPSProjection.js + wire YouAreHere (2–3 hours)
**Dependency:** locationStore.userLocation is already populated via useAppLogic. Map instance available in MapboxContainer.
**Change:** Create `useGPSProjection.js`. Modify `YouAreHere.vue` to accept x/y props. Wire in MapboxContainer.
**Why fourth:** Self-contained change inside MapboxContainer. No HomeView changes needed. GPS position is purely visual enhancement.

### Step 5: Build VenueDetailDrawer.vue (3–4 hours)
**Dependency:** Steps 1–3 complete (claim flow works, anon session works).
**Change:** New component. Shows shop name, category, distance (from locationStore.getDistanceFromUser), hours, thumbnail, Claim button (delegates to handleClaimVibe via emit), Navigate button, Share button.
**Why fifth:** Depends on claim flow being wired. Can be added as an "expand" mode triggered from VibeActionSheet or from handleOpenDetail already called in HomeView.

### Step 6: Feature flag gates (0.5 hours)
**Dependency:** All features built.
**Change:** Wrap VenueDetailDrawer and GPS YouAreHere behind `featureFlagStore.isEnabled("enable_venue_detail_drawer")` and `featureFlagStore.isEnabled("enable_gps_you_are_here")`. Add these keys to `DEFAULT_FLAGS` with `false` (dark launch).
**Why last:** Safety net — gates allow rollback without deploy.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Client-Side Coin Grants Without Server Confirmation

**What people do:** Increment `coinStore.coins` directly in the component on button tap, then fire an async sync to the server.

**Why it's wrong:** coinStore already has an `isProcessing` guard but the pattern invites race conditions and allows coin duplication if the user taps multiple times or if the network call fails silently.

**Do this instead:** Always call `coinStore.checkIn()` which calls the Supabase Edge Function first, then updates local state only on confirmed `data.success`. The LuckyWheel.vue component already does this correctly — follow the same pattern.

### Anti-Pattern 2: Calling map.project() Outside a map Event Handler

**What people do:** Call `map.project()` in a watch on `locationStore.userLocation` without also listening to map `move` events.

**Why it's wrong:** When the user pans or zooms the map, the GPS coordinate's screen position changes but `userLocation` has not changed — the dot will be wrong until the next GPS update.

**Do this instead:** Listen to map `move`, `zoom`, and `rotate` events in addition to watching `userLocation`. Debounce with `requestAnimationFrame` or a 16ms throttle to stay within 60fps budget.

### Anti-Pattern 3: New Pinia Store for Anonymous State

**What people do:** Create a new `anonymousStore.js` to hold the visitor_id.

**Why it's wrong:** `gamificationService.js` already manages visitor_id via localStorage. Adding a store layer introduces a second source of truth. The visitor_id is not reactive UI state — it is a stable identifier read once per request.

**Do this instead:** Keep visitor_id in `gamificationService.js` (current location). If reactivity is needed for display (e.g., showing visitor ID in a debug panel), use `useAnonymousSession.js` composable that wraps `getVisitorId()` — not a Pinia store.

### Anti-Pattern 4: Making VenueDetailDrawer a Route

**What people do:** Create a `/venue/:id` route with a full page transition.

**Why it's wrong:** The app is a single-view map app. All panel/modal state is managed in HomeView.vue via refs. A route change reloads map state and disrupts the neon-map aesthetic.

**Do this instead:** VenueDetailDrawer is a slide-up panel rendered inside HomeView, controlled by a `showVenueDetail` ref and `selectedShop` (already exists). Use a URL param (`?venue=id`) via `router.replace` for shareability without a route change that destroys map state. This is the pattern used by `canonicalPath` and `activeVenue` computed properties already in HomeView.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–10K daily users | Current architecture is sufficient. Supabase anon RPCs handle the load. No backend changes needed. |
| 10K–100K daily users | `user_stats` table updates on every check-in may become a bottleneck. Add Redis cache for `visitor_id → balance` reads (FastAPI already has InMemoryCache LRU). Supabase connection pooler (PgBouncer) already configured. |
| 100K+ daily users | Move gamification writes to a background queue (Supabase Edge Function → Postgres queue). Batch `user_stats` updates. Consider partitioning `lucky_spins` by `spin_date`. |

---

## Sources

All findings are HIGH confidence — drawn directly from reading the following live codebase files:

- `src/services/gamificationService.js` — anonymous session and RPC call patterns
- `src/store/coinStore.js` — gamification state, checkIn action, Edge Function call
- `src/store/userStore.js` — auth session shape, isAuthenticated guard
- `src/store/locationStore.js` — GPS watchPosition, hasLocation, getDistanceFromUser
- `src/components/ui/VibeActionSheet.vue` — claim/navigate emit structure, handleClaimVibe no-op stub in HomeView
- `src/components/ui/LuckyWheel.vue` — server-authoritative spin pattern (reference implementation)
- `src/components/ui/YouAreHere.vue` — current fixed-CSS position, no x/y props yet
- `src/components/map/MapboxContainer.vue` — map composable wiring, YouAreHere host
- `src/composables/map/useMapCore.js` — map instance as shallowRef, project() available via `map.value.project()`
- `src/views/HomeView.vue` lines 320-322 — handleClaimVibe no-op stub
- `supabase/migrations/20260223130000_anonymous_gamification.sql` — RPC signatures, anon grants
- `supabase/migrations/20260219000200_lucky_spin_guest_mode.sql` — visitor_id daily unique index
- `backend/app/api/routers/shops.py` — existing GET /shops/{id} endpoint
- `src/store/featureFlagStore.js` — DEFAULT_FLAGS, kill-switch pattern

---
*Architecture research for: VibeCity v1.1 — anonymous identity + gamification + venue detail*
*Researched: 2026-03-22*
