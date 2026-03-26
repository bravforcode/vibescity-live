# Codebase Concerns

**Analysis Date:** 2026-03-03

## Tech Debt

**MapboxContainer.vue - Component Size & Complexity:**
- Issue: Single component file is 4,462 lines (largest in codebase)
- Files: `src/components/map/MapboxContainer.vue`
- Impact: Difficult to maintain, test, and reason about. Combines map initialization, layer management, markers, interactions, and rendering orchestration. Tight coupling between concerns.
- Fix approach: Extract into smaller modules - `useMapInitialization`, `useMapFeatures`, `useMapRenderPipeline`. Create facade component that composes them. Start with testable layer extraction.

**useSentientMap.js - Hidden Complexity:**
- Issue: 1,277 lines with 44 `watch`/`computed`/`ref` declarations. Complex FSM with 9 states and adaptive behavior adds cognitive load.
- Files: `src/composables/map/useSentientMap.js`
- Impact: Difficult to debug state transitions and timing edge cases. Hard for new developers to understand intent behind velocity/hysteresis/dwell configurations.
- Fix approach: Extract FSM into separate module with explicit state transition types. Create separate composable for configuration/defaults. Add state diagram documentation.

**useMapLayers.js - Large Composable:**
- Issue: 1,703 lines combining layer definitions, styling logic, visibility toggles, and cluster rendering
- Files: `src/composables/map/useMapLayers.js`
- Impact: Mixed responsibilities. Changes to styling affect initialization logic. Hard to test individual layer behavior.
- Fix approach: Separate layer definitions (data) from management logic. Create `layerRegistry` module containing layer configs. Extract cluster logic to `useMapClustering`.

**VibeModal.vue - Monolithic Modal Container:**
- Issue: 1,783 lines, uses `defineAsyncComponent` with 30s timeout for ReviewSystem, VisitorCount, PhotoGallery
- Files: `src/components/modal/VibeModal.vue`
- Impact: Modal open/close is gated on slow component loading. Timeouts masked in MEMORY.md Phase 12 note suggest load time issues. Modal responsiveness depends on slowest child.
- Fix approach: Move heavy children to separate routes/modals. Use skeleton loaders for async sections. Consider route-based navigation instead of modal for large content.

**Admin Components - Missing Pagination Safety:**
- Issue: AdminView.vue (2,305 lines) and multiple admin sub-components fetch data without explicit limit validation
- Files: `src/views/AdminView.vue`, `src/components/admin/*.vue`
- Impact: Potential memory issues on large datasets. No cursor pagination apparent in UI layer.
- Fix approach: Add limit/offset tracking in adminDataService. Implement virtual scrolling for large tables. Add safeguards for query responses.

**Service Layer - Weak Error Boundaries:**
- Issue: Services catch errors broadly and log to console/sheets without structured error tagging
- Files: `src/services/analyticsService.js`, `src/services/placesService.js`, `src/services/eventService.js`
- Impact: Hard to trace failures in production. No correlation IDs between frontend/backend errors. Sheets logger may lose events during network failures.
- Fix approach: Implement structured logging with request_id + service_name + operation tags. Add retry logic with exponential backoff. Replace console logging with observability service.

**Timeout Configuration Workaround (Phase 12):**
- Issue: Async component timeouts increased: VibeModal (10s→30s), MapContainer (20s→40s) as temporary fix
- Files: `src/components/modal/VibeModal.vue`, `src/components/map/MapboxContainer.vue`
- Impact: Root cause unaddressed. App startup slow on slow connections. Risk of timeout cascade if more components added.
- Fix approach: Profile Mapbox/component load times. Implement resource preloading. Consider splitting route chunks. Measure actual performance on slow 4G.

**Old Component Files Not Removed:**
- Issue: Unused old versions left in codebase
- Files: `src/components/layout/SmartHeader_old.vue`, `src/views/HomeView_old.vue`
- Impact: Cognitive overhead, accidental imports, merge conflicts
- Fix approach: Delete old files. If rollback needed, restore from git history.

---

## Known Bugs

**Logout Store Cleanup Gap:**
- Symptoms: After logout, cached shop data and collected venue IDs remain in memory
- Files: `src/store/userStore.js` (logout method), `src/store/shopStore.js`, `src/store/coinStore.js`
- Trigger: User logs out and logs back in → may see stale shop cache or ghost coins
- Workaround: Manual store refresh on login. Already documented in MEMORY.md as WARN-53.
- Impact: Low - data refetched on next login anyway, but violates clean state expectations

**Mapbox Warn Spam - Suppression Incomplete:**
- Symptoms: Console warnings: "Couldn't find terrain source", "Couldn't find layer", feature namespace issues
- Files: `src/composables/map/useMapCore.js` (line 12-32, MAPBOX_SUPPRESSED_WARN_PATTERNS)
- Trigger: Map initialization with certain style sources missing or misconfigured
- Workaround: Warnings filtered for dev console, but still fired internally. See CLAUDE.md Phase 12 note.
- Impact: Medium - dev console noise, masks real errors

**Schema Cache Brownout Warnings (Production):**
- Symptoms: Periodic "schema cache" warnings from Supabase edge functions (15s debounce applied)
- Files: `src/lib/supabase.js` (lines 8-12, SCHEMA_CACHE_*)
- Trigger: Edge function responses take >8s during high load
- Current mitigation: Debounced warnings (SCHEMA_CACHE_WARN_INTERVAL_MS=15s), retry logic
- Impact: Medium - affects RPC performance during peaks, but auto-recovers

**Circuit Breaker - Threshold Gap:**
- Symptoms: Map pins endpoint may fail with 8s timeout, circuit breaker at threshold 3 (3 failures = cooldown)
- Files: `src/services/shopService.js` (lines 244-245, MAP_PINS_CIRCUIT_BREAKER_*)
- Trigger: Network slowness or backend overload
- Workaround: 8s timeout + 8s-120s cooldown exponential backoff
- Impact: Medium - extended map freeze if backend degrades

---

## Security Considerations

**Stripe Webhook Verification Gap:**
- Risk: Webhook signature validation implemented, but no explicit test for replay attacks
- Files: `backend/app/api/routers/payments.py` (lines 150-161, manual webhook handling)
- Current mitigation: Stripe client validates signature; idempotency keys in order creation
- Recommendations: Add timestamp validation (±5min window), dedupe using order ID + signature combo, log webhook processing with request_id

**Payment Amount Validation - Client-Driven:**
- Risk: Client submits amount in checkout session; backend may not enforce min/max properly
- Files: `backend/app/api/routers/payments.py` (lines 96-104, validate_amount), `src/services/paymentService.js`
- Current mitigation: Server-side validation in PRICES dict (hardcoded), but custom amount path exists
- Recommendations: Move PRICES to database. Add per-user transaction limits. Log all custom amounts to audit log.

**Admin Email Allowlist - Environment-Dependent:**
- Risk: Admin list loaded from env var; no hot-reload if compromised
- Files: `src/store/userStore.js` (lines 38-40, ENV_ADMIN_EMAILS), `backend/app/core/auth.py` (lines 26-33, _admin_email_allowlist)
- Current mitigation: Allowlist parsed from string at startup
- Recommendations: Load from secure config service or database. Implement role revocation without restart. Add audit trail for admin grants/revokes.

**localStorage/sessionStorage - Unencrypted:**
- Risk: ~106 uses of storage APIs across codebase store sensitive session data
- Files: `src/utils/storageHelper.js` and dependent modules
- Current mitigation: No sensitive PII stored (tokens handled by Supabase auth)
- Recommendations: Review all storage writes. Consider adding tamper detection (HMAC). Add warning if sensitive data detected.

**IP Hashing - Incomplete:**
- Risk: `_hash_ip()` used for geolocation tracking, but no session binding
- Files: `backend/app/api/routers/payments.py` (lines 129-132, _hash_ip)
- Current mitigation: SHA256 hash stored with order, but no rate limiting by IP hash
- Recommendations: Bind IP hash to user session, add geo-velocity checks (e.g., order from different country in <1hr)

**API Client - Error Message Leakage:**
- Risk: Error details may include backend stack traces or database errors
- Files: `src/services/apiClient.js` (lines 215, error.json().catch)
- Current mitigation: Caught and logged, but response body unchecked
- Recommendations: Sanitize error responses. Only expose error codes, hide details. Log full details server-side.

---

## Performance Bottlenecks

**Mapbox Library Size - Blocking Critical Path:**
- Problem: 1,645.8 kB uncompressed (444.4 kB gzipped). Async chunk but still significant impact on Time to Interactive
- Files: `src/components/map/MapboxContainer.vue` (async component, 40s timeout)
- Cause: Full Maplibre-GL included; not tree-shaken despite partial features usage
- Improvement path:
  - Profile actual feature usage (layers, sources, controls used)
  - Consider MapGL alternatives (deck.gl, Cesium) for specific use case
  - Defer non-critical layers (traffic, weather) until map idle
  - Implement facade pattern to delay lib import until needed

**MapboxContainer - Multiple Watch/Computed Chains:**
- Problem: 46+ Promise/async/await statements suggest deep nesting and cascading updates
- Files: `src/components/map/MapboxContainer.vue`
- Cause: Layer visibility, data updates, style changes trigger re-renders. No batching visible.
- Improvement path:
  - Use `nextTick` + `batch()` to group updates
  - Debounce layer visibility changes
  - Consider map.setStyle() batching

**Places Service - Promise.allSettled Waterfall:**
- Problem: Three external APIs (OSM, Google, Facebook) called in sequence despite `allSettled` fix noted in MEMORY.md Phase 7
- Files: `src/services/placesService.js` (lines 135-262)
- Cause: Fallback logic: try OSM → Google → Facebook. Each waits for previous timeout.
- Measurement: Phase 7 fix: 1.2s → 300ms (documented), but may still cascade on API failures
- Improvement path: Implement true parallel with circuit breaker per provider. Cache results longer (30min+).

**Schema Cache Brownout - RPC Latency Spike:**
- Problem: Supabase edge function calls spike to >8s during load, causing brownout behavior
- Files: `backend/app/api/routers/*.py` (RPC calls via supabase.rpc())
- Cause: Cold starts or overload on edge function workers
- Improvement path:
  - Measure actual RPC latencies in prod (add monitoring)
  - Implement local caching (Redis) for RPC results
  - Consider pagination (cursor-based) to reduce RPC payload

**Search - No Debounce or Query Limiting:**
- Problem: User types → immediate API call per keystroke
- Files: `src/composables/useAppLogic.js` (search handler), `src/services/shopService.js`
- Cause: No debounce apparent in search box handler
- Improvement path: Add 300ms debounce. Implement autocomplete cache. Add min query length (2 chars).

**Admin Analytics - Synchronous Redis Scan:**
- Problem: Redis SCAN used in pagination without proper cursor handling
- Files: `backend/app/api/routers/admin_analytics.py` (lines 555-575)
- Cause: Offset-based pagination on Redis keys is inefficient
- Improvement path: Use SCAN cursor API. Implement incremental key loading. Add pagination token.

---

## Fragile Areas

**Sentient Map FSM - State Transition Edge Cases:**
- Files: `src/composables/map/useSentientMap.js` (FSM, lines 78-250)
- Why fragile: 9 states + velocity-dependent transitions + dwell timers create combinatorial state space. Hard to test all paths. Touch input sequence matters.
- Safe modification: Add state transition matrix (current → allowed_next). Log all transitions with timing. Create unit tests for each state transition with mocks for `performance.now()`. Avoid adding new states without documenting full graph.
- Test coverage: Likely incomplete. No unit tests visible for FSM state logic. E2E tests may cover happy path only.

**Shop Filter State - Multiple Store Dependencies:**
- Files: `src/composables/useShopFilters.js`, `src/store/shopStore.js`, `src/composables/useAppLogic.js`
- Why fragile: Filters update shopStore, which triggers map layers, which affects prefetch engine. Changes to filter order/timing may cascade. No explicit dependency documentation.
- Safe modification: Map out filter → store → layer → prefetch dependency chain before changes. Add integration tests that verify entire chain. Avoid changing filter data structure without migration.
- Test coverage: Gaps in integration tests between store updates and map layer visibility.

**Async Component Timeouts - Silent Failures:**
- Files: `src/components/modal/VibeModal.vue`, `src/components/map/MapboxContainer.vue`
- Why fragile: 30s timeout means user waits silently. No fallback UI if timeout hits. Bootstrap phase stretched too far.
- Safe modification: Add timeout error boundary. Show "Still loading..." message at 15s. Implement resource hints (preload critical chunks). Profile build size.
- Test coverage: No explicit timeout unit tests. E2E tests may not cover slow 4G scenarios.

**Supabase Auth Token Caching - Expiry Management:**
- Files: `backend/app/core/auth.py` (lines 14-50, _TOKEN_CACHE)
- Why fragile: In-memory cache TTL=60s, Supabase token TTL=~1h. If token revoked remotely, app won't know for up to 60s. LRU eviction at 2048 entries may not scale.
- Safe modification: Implement token refresh hook (subscribe to auth changes). Add monitoring for cache hit rate. Consider Redis for distributed auth.
- Test coverage: No visible unit tests for cache expiry/eviction logic.

**Deep Nesting in useAppLogic - Hidden Dependencies:**
- Files: `src/composables/useAppLogic.js` (1,722 lines, imports 15+ other composables)
- Why fragile: Composable composition isn't hierarchical. Changes to one imported composable affect useAppLogic silently. No clear module boundary.
- Safe modification: Extract sub-composables (useDeeplinkLogic, useFilterLogic, useShortcutLogic). Document dependency graph. Add integration tests at composable boundaries.
- Test coverage: Low. No visible unit tests for individual useAppLogic functions.

---

## Scaling Limits

**Token Cache - Single-Process Bottleneck:**
- Current capacity: 2,048 concurrent tokens (in-memory)
- Limit: Multi-worker deployment exceeds cache. Workers don't share cache, causing redundant Supabase auth calls.
- Files: `backend/app/core/auth.py` (lines 44-50, LRU eviction)
- Scaling path: Move to Redis-backed cache. Implement distributed invalidation on role changes. Set Redis expiry to token TTL.

**Circuit Breaker - Manual Timeout Tuning:**
- Current capacity: Base cooldown 8s, max 120s exponential backoff
- Limit: Fixed backoff doesn't adapt to sustained outages. No observability into circuit state.
- Files: `src/services/shopService.js` (lines 244-245, exponential backoff)
- Scaling path: Implement adaptive backoff (metrics-driven). Add circuit state metric export. Consider Bulkhead pattern for different shop load types.

**Admin Pagination - Offset-Based Inefficiency:**
- Current capacity: Redis pagination with offset (O(n) scan)
- Limit: Large session counts cause slow listing. No cursor-based pagination visible.
- Files: `backend/app/api/routers/admin_analytics.py` (lines 555-575)
- Scaling path: Implement cursor pagination using Redis SCAN. Cache pagination state in sorted set. Consider ElasticSearch for full-text session search.

**Analytics Queue - Unbounded Logging:**
- Current capacity: Sheets logger fires asyncio.create_task for every event
- Limit: No backpressure. High event volume may overwhelm background task queue.
- Files: `backend/app/api/routers/payments.py` (lines 40-48, sheets_logger)
- Scaling path: Implement event batching (10 events per 100ms). Add queue depth monitoring. Consider separate analytics service.

---

## Dependencies at Risk

**Maplibre-GL - Vendor Lock-in:**
- Risk: Recent migration from Mapbox-GL to Maplibre-GL. Bundle size 1.6MB remains large. Limited ecosystem compared to Mapbox (fewer integrations).
- Impact: Performance overhead. Hard to swap for alternatives (deck.gl, Cesium) without major refactor.
- Files: `src/components/map/MapboxContainer.vue`, `src/composables/map/useMapCore.js`
- Migration plan: Evaluate Maplibre vs Deck.GL for 3D performance. Consider facade pattern to delay lib import. Monitor for upstream Maplibre issues.

**Vue 3 Composition API - Learning Curve:**
- Risk: Heavy use of Composition API in large files (useSentientMap 1,277 lines, useAppLogic 1,722 lines). New developers struggle with implicit dependencies.
- Impact: Maintenance burden. Difficult to onboard. Refactoring risk.
- Files: `src/composables/**/*.js`
- Migration plan: Extract smaller, documented composables. Add JSDoc with dependency graphs. Consider Pinia stores for state that doesn't need reactivity overhead.

**Supabase Edge Functions - Cold Start Latency:**
- Risk: RPC calls spike to >8s during brownout. No SLA visible. Edge function debugging hard to trace.
- Impact: User experience degrades during peaks. Schema cache errors logged.
- Files: `backend/app/api/routers/*.py` (RPC calls)
- Migration plan: Implement local Redis cache for RPC results. Add observability (latency metrics per RPC). Consider moving hot RPC paths to HTTP endpoints.

**Stripe Pricing Configuration - Hardcoded:**
- Risk: PRICES dict hardcoded in router. No hot reload. Admin UI required to change pricing.
- Impact: Cannot adjust prices without deployment. Risk of price inconsistency if admin panel has different prices.
- Files: `backend/app/api/routers/payments.py` (lines 182-190, PRICES dict)
- Migration plan: Move to database config table. Add admin UI for price management. Implement price version history with effective dates.

**i18n - 603 Hardcoded String Violations:**
- Risk: Detection system in place (Phase 11+), but baseline is 603 violations across 77 files
- Impact: Inconsistent translations. User-facing strings may not be translatable. Maintenance burden.
- Files: `src/**/*.{vue,js,ts}` (77 files)
- Migration plan: Run `scripts/ci/check-source-i18n-hardcoded.mjs` in CI. Prioritize high-impact violations (UI > logs). Use codemod to bulk-fix category strings.

---

## Missing Critical Features

**Persistent Offline State:**
- Problem: App doesn't persist critical state (favorites, pins purchased) for offline access
- Blocks: Offline-first experience. Users can't access favorites without network.
- Impact: Low network reliability → poor UX in Thailand (rural areas)
- Approach: Implement local IndexedDB cache for shops/favorites. Add sync queue for purchases. Show "offline" badge in UI.

**Observability - Structured Logging:**
- Problem: Console.log/warn scattered across services. No centralized error tracking with request_id correlation.
- Blocks: Production debugging. Hard to trace user actions → errors. No alerting on error spikes.
- Impact: Mean time to resolution increased. Customer support blind.
- Approach: Implement structured logging (JSON with request_id). Add Sentry/similar for error tracking. Export metrics to Prometheus.

**Rate Limiting - User-Level:**
- Problem: Rate limiter exists at IP level (slowapi), no per-user or per-session limits
- Blocks: Abuse prevention (API hammering). Bot detection.
- Impact: Potential DoS risk. No protection for shared IP addresses (proxies, corporate networks).
- Approach: Add per-user rate limit in auth context. Implement bot detection (CAPTCHA or behavior analysis). Log rate limit hits.

---

## Test Coverage Gaps

**Untested Area: Map Layer Visibility Toggle**
- What's not tested: Layer visibility changes don't have unit tests. Hard to verify layer state changes don't break map rendering.
- Files: `src/composables/map/useMapLayers.js`, `src/components/map/MapboxContainer.vue`
- Risk: Changes to layer visibility (traffic, weather, clusters) may break silently. E2E tests may miss rendering issues.
- Priority: High - affects user experience directly

**Untested Area: FSM State Transitions (Sentient Map)**
- What's not tested: No unit tests for state machine transitions. Velocity-dependent behavior only tested manually.
- Files: `src/composables/map/useSentientMap.js`
- Risk: Edge cases in state transitions not caught. Timing-dependent bugs hard to reproduce.
- Priority: High - complex logic, many state combinations

**Untested Area: Payment Flow Integration**
- What's not tested: End-to-end payment flow (checkout → Stripe → webhook → order creation) not in E2E suite
- Files: `backend/app/api/routers/payments.py`, `src/services/paymentService.js`
- Risk: Payment failures in production. Silent webhook drops (no retry visible).
- Priority: Critical - financial impact

**Untested Area: Supabase Schema Cache Retry Logic**
- What's not tested: Schema cache brownout recovery. Retry logic for RPC failures not unit tested.
- Files: `src/lib/supabase.js` (SCHEMA_CACHE_RETRY_MAX_ATTEMPTS)
- Risk: RPC failures may cascade. Retry backoff untested under load.
- Priority: Medium - affects API stability

**Untested Area: Admin Store Cleanup**
- What's not tested: Logout doesn't reset shopStore/coinStore. No test verifies clean state after logout→login
- Files: `src/store/userStore.js` (logout method)
- Risk: Stale data leaks between sessions. Tests may not catch state pollution bugs.
- Priority: Medium - security/privacy concern

**Untested Area: Circuit Breaker Activation**
- What's not tested: Circuit breaker state transitions. Fallback behavior under sustained failures not tested.
- Files: `src/services/shopService.js` (MAP_PINS_CIRCUIT_BREAKER_*)
- Risk: Circuit breaker may activate/deactivate unexpectedly. Fallback UX not validated.
- Priority: Medium - reliability

---

*Concerns audit: 2026-03-03*
