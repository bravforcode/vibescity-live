# Architecture

**Analysis Date:** 2025-03-03

## Pattern Overview

**Overall:** Full-stack pull-first with localized state + WebSocket signals

**Key Characteristics:**
- Pull-based data fetching with cursor pagination from backend APIs
- Visitor-first identity model (device-based, not account-required)
- Monorepo structure: `src/` (Vue3 frontend), `backend/` (FastAPI)
- Real-time updates via WebSocket signals (backoff + fallback)
- Supabase as single source of truth (auth, database, realtime)
- Redis cache for hot endpoints (shops, venues, analytics)
- Mapbox (now MapLibre) for venue discovery and location services

## Layers

**Presentation Layer (Vue3):**
- Purpose: Render UI components, manage viewport-aware interactions, handle offline states
- Location: `src/views/`, `src/components/`
- Contains: Page containers (HomeView, AdminView, PartnerDashboard), modal systems, feature-specific panels
- Depends on: Composables, Pinia stores, VueRouter, VueQuery
- Used by: End users via browser

**View Layer (Router):**
- Purpose: Route requests to correct page containers, enforce locale awareness, guard admin routes
- Location: `src/router/index.js`
- Contains: Route definitions (locale-aware paths `/en`, `/th`), meta guards for auth/admin
- Depends on: Vue Router, userStore for auth checks
- Used by: App.vue router-view

**Composable Layer (State & Logic):**
- Purpose: Encapsulate domain logic, manage local/derived state, coordinate side effects
- Location: `src/composables/`
- Contains: 50+ composables (useAppLogic, useMapLogic, useMapInteractions, etc.)
- Depends on: Pinia stores, services, Vue 3 lifecycle hooks
- Used by: Components, other composables

**State Layer (Pinia):**
- Purpose: Global reactive state, persistence, computed selectors
- Location: `src/store/`
- Contains: userStore, shopStore, coinStore, favoritesStore, locationStore, etc.
- Depends on: Supabase, localStorage, subscriptions
- Used by: Composables, components via storeToRefs

**Service Layer (Business Logic):**
- Purpose: API calls, external integrations, data transformation
- Location: `src/services/`
- Contains: apiClient, paymentService, shopService, analyticsService, geoService, etc.
- Depends on: axios/fetch, apiClient, Supabase client
- Used by: Composables, stores, components

**API Client Layer:**
- Purpose: Unified HTTP client with timeout/retry/backoff, visitor auth injection
- Location: `src/services/apiClient.js`
- Contains: ApiClientError class, request/response interceptors, AbortSignal management
- Depends on: visitorIdentity service for token refresh
- Used by: All services that make HTTP calls

**Backend Entry Point (FastAPI):**
- Purpose: Initialize app, register middleware, configure CORS/rate limiting
- Location: `backend/app/main.py`
- Contains: FastAPI instance, lifespan hook, middleware stack (CORS, RequestId, RateLimit, SecurityHeaders)
- Depends on: Router imports, settings, observability setup
- Used by: Fly.io runtime via ASGI

**Router Layer (API Endpoints):**
- Purpose: Define HTTP routes, validate requests, delegate to services
- Location: `backend/app/api/routers/` (admin.py, shops.py, payments.py, etc.)
- Contains: FastAPI APIRouter instances with endpoints grouped by domain
- Depends on: Pydantic models, core dependencies (verify_admin, verify_user, limiter)
- Used by: FastAPI app includes routers in main.py

**Service Layer (Backend Business Logic):**
- Purpose: Database queries, business rule enforcement, third-party integrations
- Location: `backend/app/services/`
- Contains: VenueRepository, ShopService, AnalyticsService, SlipVerification, etc.
- Depends on: Supabase client, core modules (config, logging)
- Used by: Routers (endpoints)

**Core Layer (Infrastructure & Security):**
- Purpose: Cross-cutting concerns — auth, caching, config, logging, observability
- Location: `backend/app/core/`
- Contains: auth.py (JWT cache + admin check), supabase.py (client init), cache.py, config.py, logging.py, metrics.py, otel.py
- Depends on: Third-party SDKs (supabase, slowapi, sentry, otel)
- Used by: Routers, services, middleware

**Database Layer:**
- Purpose: Schema, migrations, RLS policies
- Location: `backend/migrations/` (SQL), Supabase dashboard
- Contains: Postgres schema (venues, shops, orders, reviews, etc.), RLS policies
- Used by: Backend services via Supabase client

## Data Flow

**Venue Discovery (Main Flow):**

1. User opens app → HomeView mounts
2. useAppLogic activates → initializes stores (shopStore, userStore, locationStore)
3. shopStore.fetchShops() → apiClient.get(/api/v1/shops) with visitor token
4. Backend /shops endpoint → VenueRepository.list_active() → Supabase query + Redis cache check
5. Response: paginated shop list with location, reviews, images
6. shopStore updates → Pinia reactivity triggers component renders
7. MapContainer renders Mapbox with shop markers
8. User taps marker → useSentientMap FSM triggers
9. Pin opens via prefetch → BottomFeed carousel loads related shops

**Payment Flow:**

1. User clicks "Buy Pins" → SubscriptionManager modal
2. Form submission → paymentService.createStripeSession()
3. Backend /payments/create-session endpoint
4. Backend → Stripe API → returns clientSecret
5. Frontend Stripe.js initializes checkout modal
6. User completes payment → Stripe webhook → backend /payments/webhook
7. Backend verifies signature, updates order row (idempotent)
8. Supabase realtime triggers coinStore subscription
9. coinStore updates → UI updates coin counter

**Location Tracking:**

1. useHomeBase composable requests geolocation on first fix
2. locationStore.startWatching() → navigator.geolocation.watchPosition
3. Every location update → useMapLogic.calculateNearestShops() → useCoinStore.trackNearbyVibes()
4. Location used for distance calculations, home base persists to localStorage

**State Management:**

- **Stores persist to localStorage:** userStore (partial: auth), coinStore (venueIds), favoritesStore
- **Realtime subscriptions:** shopStore listens to Supabase venues.* changes via subscribeShops()
- **Cache invalidation:** Services manually trigger store resets on auth/logout
- **Derived state:** Computed properties in stores filter/sort shop data

## Key Abstractions

**Visitor Identity:**
- Purpose: Device-based auth for non-logged-in users, idempotent tracking
- Examples: `src/services/visitorIdentity.js`, apiClient uses getVisitorToken()
- Pattern: Generate/persist vibe_visitor_id in localStorage, exchange for JWT token, refresh on expiry

**Composable Orchestration:**
- Purpose: Compose multiple small composables into larger behaviors
- Examples: useAppLogic (60+ internal composables), useMapLogic (aggregates map interactions)
- Pattern: Top-level composables act as facades, delegate to focused single-concern composables

**Error Boundaries:**
- Purpose: Prevent full-page crashes from component render errors
- Examples: `src/components/ui/ErrorBoundary.vue` wraps Map, ErrorBoundary in HomeView
- Pattern: Vue 3 errorCaptured, fallback UI (MapErrorFallback, EmptyState)

**Service Locator Pattern:**
- Purpose: Decouple components from service implementations
- Examples: supabase instance in `src/lib/supabase.js`, shared across stores
- Pattern: Singleton instances exported as default, imported by modules

**Repository Pattern:**
- Purpose: Abstract database access, enable caching/pagination
- Examples: `VenueRepository(supabase_admin)` in admin.py, ShopService in backend
- Pattern: Backend services wrap Supabase calls, add caching logic, return domain models

## Entry Points

**Frontend:**
- Location: `src/main.js`
- Triggers: Browser loads VibeCity URL
- Responsibilities: Initialize Pinia, Vue Router, i18n, analytics, service worker, unhead (SEO)

**Backend:**
- Location: `backend/app/main.py` + `backend/run_backend.py` (dev/prod wrapper)
- Triggers: Fly.io runtime spawns process
- Responsibilities: Create FastAPI app, register routers, configure CORS/auth/observability, start lifespan tasks

**Router Guards (Frontend):**
- Location: `src/router/index.js` → beforeEach + afterEach
- Triggers: Every route change
- Responsibilities: Locale sync, admin auth check, canonical URL redirect, focus management

**Middleware (Backend):**
- Location: `backend/app/middleware/` + main.py
- Triggers: Every HTTP request
- Responsibilities: RequestId injection, CORS preflight, rate limit checking, security headers

## Error Handling

**Strategy:** Multi-layered with fallbacks, per-feature error recovery

**Patterns:**

- **Frontend:** Try-catch in composables, error boundaries for render errors, fallback UI states
  - Example: `useAppLogic` wraps Supabase subscription in try-catch, falls back to polling
  - Example: ApiClientError with retry logic (3 attempts, exponential backoff)

- **Backend:** FastAPI exception handlers, 500 errors logged with request_id, JSON error responses
  - Example: admin.py endpoints catch exceptions, return HTTPException(500, str(e))
  - Example: RequestIdMiddleware logs http_request_failed with all context

- **Network:** Timeout + fallback strategy
  - Example: apiClient has DEFAULT_API_TIMEOUT_MS=8000, AbortSignal cancels hanging requests
  - Example: Supabase subscription failure doesn't block app, graceful degradation

- **Storage:** SSR-safe localStorage guards (typeof window check)
  - Example: router.js checks `typeof window !== "undefined"` before localStorage access

## Cross-Cutting Concerns

**Logging:**
- Frontend: console.log in dev mode, frontendObservabilityService.reportFrontendGuardrail() in prod
- Backend: Python logging module in app/core/logging.py, request_logger tracks http_request/http_request_failed

**Validation:**
- Frontend: Form validation in component setup (manual or via Zod schemas)
- Backend: Pydantic BaseModel in routers for request validation, automatic 422 response on invalid data

**Authentication:**
- Frontend: Supabase Auth session + visitor token in localStorage, injected via apiClient Authorization header
- Backend: verify_user dependency extracts JWT from Authorization header, cached for 60s, verify_admin checks email allowlist

**Rate Limiting:**
- Backend: slowapi limiter with per-endpoint limits (e.g., 100/minute for most endpoints)
- Middleware: SlowAPIMiddleware enforces limits, RateLimitExceeded returns 429

**Observability:**
- Frontend: Sentry for error tracking, Microsoft Clarity for session replay (opt-in), WebVitals for performance
- Backend: OTEL instrumentation for FastAPI traces, analytics_buffer batches events, request_id propagated through logs

---

*Architecture analysis: 2025-03-03*
