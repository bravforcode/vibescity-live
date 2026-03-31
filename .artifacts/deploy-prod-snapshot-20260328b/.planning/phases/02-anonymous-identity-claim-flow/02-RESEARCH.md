# Phase 2: Anonymous Identity + Claim Flow - Research

**Researched:** 2026-03-22
**Domain:** Supabase anonymous auth, gamification RPCs, IP-hash rate limiting, Mapbox GL custom layers
**Confidence:** HIGH (all key findings verified against live codebase)

---

## Summary

Phase 2 is building on a well-scaffolded foundation. The action sheet component already emits `claim`, the handler `handleClaimVibe` in HomeView.vue has a clear `/* TODO: Phase 2 gamification hook */` comment, and `gamificationService.js` already has the visitor-ID pattern and RPC call structure that new claim methods should follow. The `canvas-confetti` library is already installed; a custom CSS confetti component (`ConfettiEffect.vue`) also exists. `@thumbmarkjs/thumbmarkjs` is NOT yet installed and needs to be added.

The critical gap is that **no `claim_vibe` RPC exists in Supabase** and no `visitor_gamification` (or equivalent) table for anonymous users exists in the documented schema. The daily-checkin and lucky-wheel RPCs (`claim_daily_checkin`, `get_daily_checkin_status`, `get_lucky_wheel_status`, `spin_lucky_wheel`) DO exist and are called via `gamificationService.js` — these are the reference implementations to follow. The backend has `slowapi` with Redis-backed rate limiting already wired into `app/core/rate_limit.py`; SAFE-01 should be a new FastAPI router at `backend/app/api/routers/gamification.py`.

The PDPA consent banner is **not yet implemented** as a component. The app has a `vibecity:consent` custom event listener in `main.js`, suggesting a design intent for a consent gateway, but no actual banner component exists. This needs to be built from scratch.

**Primary recommendation:** Follow the `gamificationService.js` + Supabase RPC pattern exactly. New work = (1) Supabase migration for `visitor_gamification` table + `claim_vibe` RPC, (2) FastAPI `POST /v1/gamification/claim` with IP-hash rate limit, (3) three new Vue components (consent banner, claim feedback overlay, claimed marker layer).

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Already Used |
|---------|---------|---------|-------------|
| `@supabase/supabase-js` | ^2.95.3 | Auth, RPCs, realtime | Yes — `src/lib/supabase.js` |
| `canvas-confetti` | ^1.9.4 | Confetti burst on claim | Yes — BuyPinsPanel, MerchantRegister |
| `pinia` | ^3.0.4 | State management (coinStore, shopStore) | Yes — all stores |
| `pinia-plugin-persistedstate` | ^4.7.1 | LocalStorage persistence | Yes — coinStore, shopStore |
| `slowapi` (backend) | installed | Rate limiting via Redis or in-memory | Yes — `app/core/rate_limit.py` |
| `vue-i18n` | ^9.14.5 | All UI strings | Yes — all components |

### Needs to be Added
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@thumbmarkjs/thumbmarkjs` | latest | Browser fingerprint for IP-hash supplementation | Required by SAFE-01 ops prerequisite |

**Installation:**
```bash
npm install @thumbmarkjs/thumbmarkjs
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `canvas-confetti` (npm) | `ConfettiEffect.vue` (custom CSS) | canvas-confetti is more performant and already installed; custom component exists but is simpler |
| `slowapi` FastAPI rate limit | Supabase RLS + pg_ratelimit | FastAPI layer is already set up and easier to IP-hash; Supabase RPC can do secondary check |
| `@thumbmarkjs/thumbmarkjs` | Custom canvas fingerprint | ThumbmarkJS is maintained, passive (no user permission needed), works with anon sessions |

---

## Architecture Patterns

### Recommended Project Structure (additions only)
```
src/
├── components/ui/
│   ├── ConsentBanner.vue        # NEW — COMP-01: one-time PDPA consent gate
│   └── ClaimFeedback.vue        # NEW — GAME-03: confetti + coin toast overlay
├── services/
│   └── gamificationService.js   # EXTEND — add claimVibe(), getClaimStatus()
├── store/
│   └── coinStore.js             # EXTEND — add serverSync, fix awardCoins gap
backend/app/api/routers/
└── gamification.py              # NEW — SAFE-01 rate-limited claim endpoint
```

### Pattern 1: Supabase RPC with visitor_id (reference implementation)
**What:** All gamification calls pass `p_visitor_id` (UUID from localStorage). The service layer wraps auth fallback: authenticated user ID takes priority, else use visitor ID.
**When to use:** Any gamification action (claim, checkin, wheel spin)
**Source:** `src/services/gamificationService.js` — existing pattern

```javascript
// Source: src/services/gamificationService.js (existing)
const getUserOrVisitorId = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return { userId: user.id, isAuth: true };
  } catch {}
  return { userId: getVisitorId(), isAuth: false };
};

// NEW — to add to gamificationService.js
async claimVibe(venueId) {
  const { userId } = await getUserOrVisitorId();
  const { data, error } = await supabase.rpc("claim_vibe", {
    p_visitor_id: userId,
    p_venue_id: venueId,
  });
  if (error) throw error;
  return unwrapRpcData(data);
},

async getClaimStatus(venueId) {
  const { userId } = await getUserOrVisitorId();
  const { data, error } = await supabase.rpc("get_claim_status", {
    p_visitor_id: userId,
    p_venue_id: venueId,
  });
  if (error) throw error;
  return unwrapRpcData(data);
},
```

### Pattern 2: Supabase RPC (server-side) for claim + idempotency
**What:** `claim_vibe` RPC uses `INSERT ... ON CONFLICT DO NOTHING` keyed on `(visitor_id, venue_id, claim_date)` where `claim_date = CURRENT_DATE`. Returns `already_claimed: true` if conflict, else awards coins and returns new balance.
**When to use:** GAME-01 + GAME-02 requirement — single atomic RPC handles both award and deduplication.

```sql
-- NEW — migration to create in Supabase
CREATE TABLE public.visitor_gamification (
  visitor_id    TEXT NOT NULL,
  balance       INTEGER DEFAULT 0 NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (visitor_id)
);

CREATE TABLE public.venue_claims (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id    TEXT NOT NULL,
  venue_id      TEXT NOT NULL,
  claim_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  coins_awarded INTEGER NOT NULL DEFAULT 10,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (visitor_id, venue_id, claim_date)
);

CREATE OR REPLACE FUNCTION claim_vibe(p_visitor_id TEXT, p_venue_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Ensure visitor row exists
  INSERT INTO visitor_gamification (visitor_id) VALUES (p_visitor_id)
  ON CONFLICT (visitor_id) DO NOTHING;

  -- Idempotent claim: one per venue per calendar day
  INSERT INTO venue_claims (visitor_id, venue_id, coins_awarded)
  VALUES (p_visitor_id, p_venue_id, 10)
  ON CONFLICT (visitor_id, venue_id, claim_date) DO NOTHING;

  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM visitor_gamification WHERE visitor_id = p_visitor_id;
    RETURN jsonb_build_object('already_claimed', true, 'balance', v_balance);
  END IF;

  -- Award coins
  UPDATE visitor_gamification SET balance = balance + 10, updated_at = now()
  WHERE visitor_id = p_visitor_id
  RETURNING balance INTO v_balance;

  RETURN jsonb_build_object(
    'already_claimed', false,
    'coins_awarded', 10,
    'balance', v_balance,
    'lucky_wheel_spin', true
  );
END;
$$;
```

### Pattern 3: FastAPI IP-hash rate limit (SAFE-01)
**What:** POST endpoint receives claim request, hashes the IP, checks Redis via slowapi. Mirrors the existing pattern in `payments.py` lines 209, 251.
**When to use:** Every claim event must pass through this gate before the RPC.

```python
# Source: backend/app/api/routers/payments.py (existing _hash_ip pattern)
# NEW: backend/app/api/routers/gamification.py

import hashlib
from fastapi import APIRouter, Request, HTTPException
from app.core.rate_limit import limiter
from app.core.supabase import supabase_admin

router = APIRouter()

def _hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()

@router.post("/claim")
@limiter.limit("5/hour")  # SAFE-01: 5 claims per IP per hour
async def claim_vibe(request: Request, venue_id: str, visitor_id: str):
    ip = request.client.host or ""
    ip_hash = _hash_ip(ip)

    result = supabase_admin.rpc("claim_vibe", {
        "p_visitor_id": visitor_id,
        "p_venue_id": venue_id,
    }).execute()

    return result.data
```

### Pattern 4: Consent banner (COMP-01)
**What:** One-time overlay rendered at app mount. Writes `pdpa_consent_ts` to localStorage on acceptance. Fires `vibecity:consent` custom event (already listened in `main.js`). The claim flow is blocked until consent is stored.
**When to use:** First visit only — checked in `App.vue` or `HomeView.vue` on mount.

```javascript
// Consent check pattern (reference: main.js vibecity:consent listener)
const hasConsent = () => {
  try {
    return !!localStorage.getItem("pdpa_consent_ts");
  } catch { return false; }
};

const grantConsent = () => {
  localStorage.setItem("pdpa_consent_ts", new Date().toISOString());
  window.dispatchEvent(new CustomEvent("vibecity:consent", {
    detail: { analytics: "granted" }
  }));
};
```

### Pattern 5: Claimed marker glow (MAP-02)
**What:** Claimed venue IDs are stored in Pinia (persisted). `useMapLayers.js` has a `addClusters` function that manages the `unclustered-point` symbol layer. A new `claimed-glow` circle layer should be added beneath `unclustered-point` using a GeoJSON source filtered to claimed venue IDs.
**When to use:** After successful claim, update the source data to add the venue; survives reload via persisted store.

```javascript
// Source: src/composables/map/useMapLayers.js (addClusters pattern)
// NEW layer to add within addClusters or as separate addClaimedGlowLayer()

if (!map.value.getLayer("claimed-glow")) {
  map.value.addLayer({
    id: "claimed-glow",
    type: "circle",
    source: "claimed-venues",  // separate GeoJSON source, filtered client-side
    paint: {
      "circle-radius": 20,
      "circle-color": "transparent",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#00c853",  // claim green
      "circle-stroke-opacity": 0.85,
      "circle-blur": 0.5,
    },
  }, "unclustered-point");  // insert BELOW the pin layer
}
```

### Anti-Patterns to Avoid
- **coinStore.awardCoins() does not exist:** `coinStore` exposes `awardBonus(amount, reason)` — NOT `awardCoins`. Multiple components call `awardCoins` which will throw at runtime. Phase 2 must use `awardBonus` or add a proper alias. Do not add another alias — fix the callers.
- **Client-only deduplication:** Never rely on `coinStore.collectedVenues` (localStorage-persisted Set) as the sole duplicate guard. It is trivially cleared. GAME-02 must be enforced server-side via the `venue_claims` UNIQUE constraint.
- **supabase.signInAnonymously before consent:** Do NOT call `supabase.auth.signInAnonymously()` before COMP-01 consent is granted. Consent must gate all session data writes.
- **supabase.auth.signInAnonymously — not currently used:** The codebase does NOT use Supabase anonymous auth (`signInAnonymously`). The gamification system uses a plain UUID stored in `localStorage` as `vibe_visitor_id` (set by `gamificationService.getVisitorId()`). Phase 2 should follow this pattern — NOT switch to Supabase anonymous auth — unless the ops prerequisite about enabling "Anonymous Sign-ins" means the RPC needs Supabase auth context. Investigate further in planning.
- **Coins state as localStorage-only:** `coinStore` persists `coins` to localStorage but `fetchUserStats()` only runs for authenticated users. For anonymous visitors, coin balance must come from Supabase `visitor_gamification.balance` on load (GAME-06 requirement).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confetti animation | Custom canvas loop | `canvas-confetti` npm (already installed) | GPU-accelerated, handles reduced-motion, fire-and-forget API |
| IP rate limiting | Custom Redis counter | `slowapi` + existing `limiter` in `app/core/rate_limit.py` | Already wired into FastAPI app; supports Redis storage |
| UUID generation | Custom random string | `crypto.randomUUID()` | Already used in `gamificationService.getVisitorId()` |
| Claim idempotency | Client-side flag + retry | Postgres UNIQUE constraint + `ON CONFLICT DO NOTHING` | Only safe server-side approach; clients can be spoofed |
| Browser fingerprint | Custom canvas/audio fingerprint | `@thumbmarkjs/thumbmarkjs` | Maintained library, passive (no user permission), required by ops prerequisite |

**Key insight:** The claim idempotency problem has many subtle edge cases (concurrent requests, clock skew between client/server). The Postgres UNIQUE constraint on `(visitor_id, venue_id, claim_date)` handles all of them atomically.

---

## Common Pitfalls

### Pitfall 1: coinStore.awardCoins is undefined
**What goes wrong:** `coinStore.awardCoins(1)` is called in ShopCard.vue, ImmersiveFeed.vue — but `coinStore` only exposes `awardBonus(amount, reason)`. At runtime this silently fails (property is undefined, calling it throws `TypeError: coinStore.awardCoins is not a function`).
**Why it happens:** The store was refactored but callers weren't updated, and the method is not easily discoverable.
**How to avoid:** Phase 2 tasks should use `coinStore.awardBonus(10, 'venue_claim')` and optionally add `awardCoins` as an alias to coinStore for backwards compat.
**Warning signs:** Check browser console for TypeError after any swipe/share interaction in ShopCard or ImmersiveFeed.

### Pitfall 2: Supabase client headers are static at init time
**What goes wrong:** `src/lib/supabase.js` calls `getVisitorHeader()` once at module load time. If `vibe_visitor_id` is set in localStorage AFTER the module is imported (e.g., on first visit), the header will be empty for that session.
**Why it happens:** `createClient()` is called once at import time with static headers.
**How to avoid:** Pass `vibe_visitor_id` as an explicit RPC parameter (`p_visitor_id`) rather than relying on the header — which is exactly what `gamificationService.js` does. Do NOT rely on the header for claim RPCs.
**Warning signs:** RPC responds with wrong user context on first page load for new visitors.

### Pitfall 3: Supabase Anonymous Sign-in vs. visitor UUID pattern
**What goes wrong:** The ops prerequisite says "Enable Anonymous Sign-ins in Supabase" — but the codebase does NOT call `supabase.auth.signInAnonymously()`. If Phase 2 introduces Supabase anonymous auth, it creates a parallel identity system alongside the existing `vibe_visitor_id` localStorage UUID.
**Why it happens:** Two different approaches to anonymous identity; the ops note may have been written assuming a Supabase-native auth approach.
**How to avoid:** Decide in planning: either (a) keep the localStorage UUID as the identity key for all RPCs (simpler, current pattern), or (b) adopt `signInAnonymously` fully and migrate RPCs to use `auth.uid()`. Do not mix both.
**Warning signs:** Visitor gets two different identities depending on which code path runs first.

### Pitfall 4: PDPA consent blocks visitor ID creation
**What goes wrong:** If the consent banner blocks ALL localStorage writes, it also blocks `vibe_visitor_id` creation. But `gamificationService.getVisitorId()` is currently called from `DailyCheckin.vue` and `LuckyWheel.vue` on mount — before any consent is shown.
**Why it happens:** There is no consent gate around `getVisitorId()` currently.
**How to avoid:** Consent must be checked/granted before any gamification mount. Put consent check in `handleClaimVibe` in HomeView.vue — show banner if no consent, then proceed.
**Warning signs:** PDPA audit finds `vibe_visitor_id` written before `pdpa_consent_ts`.

### Pitfall 5: Mapbox layer ordering for claimed glow ring
**What goes wrong:** Adding the glow circle layer AFTER `unclustered-point` will paint it on top of the pin icon, visually occluding the marker. The glow must be inserted BELOW the pin layer.
**Why it happens:** `map.addLayer()` by default inserts at the top of the layer stack.
**How to avoid:** Pass `"unclustered-point"` as the `beforeId` second argument to `map.addLayer()`.
**Warning signs:** Glow ring covers pin icon; click target is confused by overlapping layers.

### Pitfall 6: Rate limit shared across legitimate users at the same IP (NAT/café/hotel)
**What goes wrong:** `5/hour` per IP will block multiple legitimate users sharing a NAT IP (hotel Wi-Fi, café, coworking).
**Why it happens:** IP-hash rate limiting treats a whole NAT group as one identity.
**How to avoid:** The rate limit window should be generous (e.g., `10/hour` per IP or `20/hour`). Layer with per-visitor-ID deduplication via the DB UNIQUE constraint. The DB constraint is the actual idempotency guarantee; the IP rate limit is only an abuse signal.
**Warning signs:** Support reports from hotels/cafés about "can't claim vibe" during peak hours.

---

## Code Examples

### Confetti trigger (existing pattern in BuyPinsPanel.vue)
```javascript
// Source: src/components/dashboard/BuyPinsPanel.vue line 731
import confetti from "canvas-confetti";
confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
```

### Haptic feedback (existing pattern in coinStore.awardBonus)
```javascript
// Source: src/store/coinStore.js line 269
if (navigator.vibrate) navigator.vibrate([20, 10, 40]);
```

### SmartHeader haptic (existing pattern)
```javascript
// Source: src/components/layout/SmartHeader.vue line 209-210
emit("haptic-tap");
navigator.vibrate(10);
```

### Rate limit decorator on FastAPI (existing pattern)
```python
# Source: backend/app/api/routers/shops.py lines 9-10
@router.get("/")
@limiter.limit("60/minute")
async def read_shops(request: Request):
```

### Supabase RPC call pattern (existing gamificationService.js)
```javascript
// Source: src/services/gamificationService.js lines 56-63
async claimDailyCheckin() {
  const { userId } = await getUserOrVisitorId();
  const { data, error } = await supabase.rpc("claim_daily_checkin", {
    p_visitor_id: userId,
  });
  if (error) throw error;
  return unwrapRpcData(data);
},
```

### VibeActionSheet claim emission (existing)
```javascript
// Source: src/views/HomeView.vue lines 320-322
const handleClaimVibe = () => {
  /* TODO: Phase 2 gamification hook */
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| coinStore.awardCoins() | coinStore.awardBonus(amount, reason) | Existing — never worked | awardCoins callers in ShopCard/ImmersiveFeed are broken right now |
| localStorage-only coins | Server-synced via `visitor_gamification.balance` | Phase 2 (new) | GAME-06 requires server sync |
| No consent gate | ConsentBanner + pdpa_consent_ts | Phase 2 (new) | COMP-01 PDPA requirement |

**Deprecated/outdated:**
- `coinStore.checkIn()` calls `supabase.functions.invoke("coin-action", ...)` — this Edge Function may not exist in production. The gamificationService RPC pattern (`supabase.rpc(...)`) is the canonical approach for Phase 2.
- `coinStore.syncCheckIn()` writes to `gamification_logs` table with `user_id` — anonymous users have no user_id, so this fails silently for visitor sessions. Do not use for GAME-01.

---

## Open Questions

1. **Supabase anonymous auth vs. localStorage UUID**
   - What we know: Ops prerequisite says "Enable Anonymous Sign-ins in Supabase." But zero code in the codebase calls `signInAnonymously`. The gamificationService uses a plain localStorage UUID as the visitor key.
   - What's unclear: Is the anonymous sign-in prerequisite meant to back the existing UUID pattern server-side (so RLS can identify anon users), or is it meant to switch to `supabase.auth.signInAnonymously()` in Phase 2?
   - Recommendation: Decide in planning before writing any Supabase migration. If using Supabase anon auth, the RPC should use `auth.uid()` instead of `p_visitor_id TEXT`. If staying with localStorage UUID, the Supabase anon auth setting may not be needed.

2. **`claim_vibe` RPC: WHERE does it live — Supabase Edge Function or Postgres RPC?**
   - What we know: Daily checkin and lucky wheel use `supabase.rpc()` (Postgres functions). coinStore.checkIn uses `supabase.functions.invoke("coin-action")` (Edge Function).
   - What's unclear: Which pattern should `claim_vibe` follow? SAFE-01 says IP-hash rate limit must go server-side. Postgres RPCs cannot see the client IP — so rate limiting must happen at the FastAPI layer or a Supabase Edge Function.
   - Recommendation: Use FastAPI `POST /v1/gamification/claim` with `@limiter.limit("10/hour")` as the IP-hash gate, which then calls `supabase_admin.rpc("claim_vibe", ...)`. This matches the existing pattern in `payments.py` and keeps rate limiting in the FastAPI layer where `slowapi` is already configured.

3. **Claimed marker persistence across page reloads**
   - What we know: `coinStore.collectedVenues` is persisted to localStorage via pinia-plugin-persistedstate. useMapLayers.js has no concept of claimed venues yet.
   - What's unclear: Should claimed venue IDs come from `coinStore.collectedVenues` (localStorage) or from a server fetch of `venue_claims`?
   - Recommendation: On load, fetch claimed venues for today from `venue_claims` via a `get_my_claims` RPC (returns venue IDs claimed today). Store in a dedicated `claimedVenueIds` ref in coinStore (or a new `claimStore`). Use this to drive the `claimed-glow` Mapbox layer.

---

## Sources

### Primary (HIGH confidence)
- `src/services/gamificationService.js` — complete visitor ID pattern, all existing RPC calls
- `src/components/ui/VibeActionSheet.vue` — current emit-only action sheet (no claim logic)
- `src/views/HomeView.vue` lines 320-322 — `handleClaimVibe` stub with TODO comment
- `src/store/coinStore.js` — full coinStore including `awardBonus`, `checkIn` patterns, persisted paths
- `src/lib/supabase.js` — static header injection (visitor ID header limitation)
- `src/composables/map/useMapLayers.js` — all existing layer IDs (`unclustered-point`, `claimed-glow` gap)
- `backend/app/core/rate_limit.py` — `slowapi` with Redis URI, `limiter` instance
- `backend/app/api/routers/payments.py` lines 209, 251 — `_hash_ip` pattern
- `backend/app/main.py` — router registration pattern, import conventions
- `backend/db/schema.sql` — existing tables (no `visitor_gamification` or `venue_claims` exists)
- `backend/db/rpc.sql` — existing RPCs (`award_coins`, `grant_rewards` — both require UUID user_id)
- `src/i18n.js` lines 107-114, 240-247 — `gamification.*` keys in both en and th
- `src/components/ui/ConfettiEffect.vue` — custom confetti component (exists but canvas-confetti is preferred)
- `package.json` — confirms `canvas-confetti ^1.9.4` installed, `@thumbmarkjs/thumbmarkjs` NOT installed

### Secondary (MEDIUM confidence)
- `src/main.js` lines 73-79 — `vibecity:consent` event listener (confirms consent event design intent)
- `src/components/layout/SmartHeader.vue` lines 203-210 — haptic pattern (`navigator.vibrate(10)`)

### Tertiary (LOW confidence — needs validation)
- Supabase anonymous auth behavior when `p_visitor_id` TEXT is used instead of `auth.uid()` — not verified against Supabase docs; should be confirmed before migration is written.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against package.json and live imports
- Architecture patterns: HIGH — all patterns extracted from live codebase files
- Supabase schema gaps: HIGH — schema.sql has no visitor_gamification or venue_claims tables
- Anonymous auth decision: LOW — conflicting signals between ops note and codebase pattern
- Pitfalls: HIGH — all verified against actual code (awardCoins bug confirmed, layer order, etc.)

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (30 days — stable tech stack)
