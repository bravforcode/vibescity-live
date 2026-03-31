# External Integrations

**Analysis Date:** 2026-03-03

## APIs & External Services

**Payment Processing:**
- **Stripe** - Subscription + one-time purchases (coins, shop boosts, verified badges)
  - SDK/Client: `stripe` (Python) + Checkout.js (frontend, auto-loaded)
  - Auth: `STRIPE_SECRET_KEY` (backend), `STRIPE_PUBLISHABLE_KEY` (frontend, public)
  - Webhook: `POST /api/v1/payments/webhook` - Signature verified via `STRIPE_WEBHOOK_SECRET`
  - Implementation: `backend/app/api/routers/payments.py` - creates checkout sessions, marks orders paid
  - Idempotency: `idempotency_key` field in order records prevents duplicate charges
  - Usage: BuyPinsPanel.vue, SubscriptionManager.vue (frontend) → Stripe Checkout → webhook callback

**Maps & Geocoding:**
- **Maplibre GL** - Vector tile rendering (fully open-source, no API key required)
  - SDK: `maplibre-gl` 4.7.0
  - Implementation: `src/composables/map/useMapCore.js`, `src/components/map/MapboxContainer.vue`
  - Tile Sources: Configured via env-driven style URL in `runtimeConfig.js`
  - No auth: Uses public tile server (compatible with Mapbox GL style format)

- **Mapbox Geocoder** (optional, requires Mapbox token)
  - SDK: `@mapbox/mapbox-gl-geocoder` 5.1.2
  - Auth: Depends on Mapbox API key if geocoding needed
  - Usage: Address search in map (optional feature, graceful fallback if disabled)

**Location Services:**
- **H3 Hexagonal Index** (local, no API)
  - SDK: `h3` (Python) 4.4.0
  - Purpose: Map clustering, geospatial partitioning
  - Implementation: Backend map core logic for venue grouping

**Google Sheets API:**
- **Google Sheets** - Admin event logging (not for runtime analytics)
  - SDK: `gspread` 6.1.2 (Python), `google-auth` 2.29.0
  - Auth: Service account via `GOOGLE_SHEETS_CREDENTIALS_PATH` (git-ignored JSON)
  - Implementation: `backend/app/services/sheets_logger.py`
  - Usage: Async logging of payment events, admin actions, validation failures
  - Webhooks: Optional webhooks configured via `SHEETS_WEBHOOK_EVENTS_URL`, `SHEETS_WEBHOOK_PARTNER_URL`
  - Strategy: `SHEETS_STRATEGY` env var selects `db_sync` (default) or `legacy_webhook`

## Data Storage

**Databases:**
- **Supabase (PostgreSQL 15 + pgvector)**
  - Connection: Supabase REST API (public anon key) via `src/lib/supabase.js`
  - Backend Admin: Direct admin role via `SUPABASE_SERVICE_ROLE_KEY` in `backend/app/core/supabase.py`
  - Client: `@supabase/supabase-js` 2.95.3 (frontend), `supabase` 2.3.0 (Python backend)
  - Auth: Supabase managed (JWT tokens, session-based)
  - RLS: Row-level security policies enforce user-scoped data access
  - Schema Cache Retry: Built-in retry logic in `src/lib/supabase.js` (3 attempts, exponential backoff up to 1200ms)
  - Tables: orders, shops, venues, users, vibes, reviews, slip_audit, analytics tables, etc.
  - Extensions: pgvector (similarity search for recommendations)

- **Redis**
  - Connection: `REDIS_URL` env var, client: `redis` (Python) 5.0.0+
  - Implementation: `backend/app/services/cache/redis_client.py` with fallback in-memory cache
  - Purpose: Session state, ephemeral analytics, OCR job queue
  - TTL: Cache entries use Redis `setex()` with configurable expiry (30s–7d depending on data)
  - Failover: Automatic fallback to in-memory cache if Redis unavailable (warns in dev)
  - Streams: `OCR_QUEUE_STREAM` for async document processing jobs

**File Storage:**
- **Supabase Storage** (PostgreSQL BYTEA + object storage)
  - Purpose: Venue photos, user avatars, receipt images (payment verification)
  - Access: Via Supabase client (bucket policies enforce auth)
  - Implementation: Referenced in shop.py, upload endpoints handle multipart forms

- **Browser IndexedDB** (local client-only)
  - SDK: `idb-keyval` 6.2.2
  - Purpose: Offline cache, prefetch state (non-critical, regenerated on reload)
  - Scope: Per-domain, per-user (localStorage-based visitor ID as key)

**Caching:**
- **Redis** (primary, see above)
- **HTTP Cache** (Backend): Cache-Control headers on GET endpoints
  - `shops.py` GET /: `public/60/300/60` (s-maxage for CDN, cache for 1–5 min)
  - `shops.py` GET /{id}/reviews: `public/30/120/30` (shorter TTL for dynamic data)
- **Browser Cache**: Service Worker precaches ~2 MB of static assets (via Workbox)
- **TanStack Vue Query**: Client-side deduplication + staleTime (5 min default)

## Authentication & Identity

**Auth Provider:**
- **Supabase Auth** (managed OAuth + session-based)
  - Implementation: `backend/app/core/auth.py` (verify_user dependency injection)
  - Flow: Bearer token JWT validation via Supabase.auth.getUser()
  - Token Cache: 60s in-memory cache on backend (prevents remote call on every request)
  - Endpoints: `/api/v1/auth/*` (delegated to Supabase)

**Anonymous Visitor Tracking:**
- **Visitor Identity System** (custom implementation)
  - SDK: Custom in `src/services/visitorIdentity.js`
  - Storage: localStorage (`vibe_visitor_id`), regenerated if missing
  - Token: Custom JWT signed visitor token (TTL configurable via `VISITOR_TOKEN_TTL_SECONDS`)
  - Signing Secret: `VISITOR_SIGNING_SECRET` (backend config)
  - Audit: Tracked in Redis and analytics tables for 30 days (configurable)
  - Implementation: `backend/app/core/anonymous_tracking.py` handles session lifecycle

**Session Management:**
- **Backend JWT Cache**: Supabase tokens cached 60s in-memory (`_TOKEN_CACHE` dict)
- **Redis Sessions**: User + anonymous sessions stored in Redis with TTL
- **CORS** - Enforces origin validation (localhost during dev, vibecity.live in production)

## Monitoring & Observability

**Error Tracking:**
- **Sentry** (optional, error reporting)
  - SDK: `@sentry/vue` 10.36.0 (frontend), sentry-sdk (Python backend, optional)
  - Init: `src/main.js` - conditionally initializes if `VITE_SENTRY_DSN` provided
  - Environment: `VITE_DISABLE_ANALYTICS` flag disables all telemetry
  - Do Not Track: Respects `navigator.doNotTrack === "1"` (hard deny)

**Session Replay & Analytics:**
- **Microsoft Clarity** (optional, session replay)
  - SDK: `@microsoft/clarity` 1.0.2
  - Init: `src/main.js` if `VITE_CLARITY_PROJECT_ID` set
  - Consent: Requires `vibe_analytics_consent === "granted"` in localStorage
  - Features: Session recording, heatmaps (opt-in via ConsentBanner.vue)

**Performance Monitoring:**
- **Vercel Speed Insights** (Core Web Vitals)
  - SDK: `@vercel/speed-insights` 1.3.1
  - Auto-collected: LCP, FID, CLS, FCP metrics sent to Vercel dashboard

**OpenTelemetry Tracing** (optional backend, OTLP-compatible)
  - Exporter: `opentelemetry-exporter-otlp` (HTTP-based)
  - Endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT` env var
  - Service: Auto-instrumentation of FastAPI + httpx clients
  - Sampling: Configurable via `OTEL_TRACES_SAMPLER_ARG` (default 10%)
  - Implementation: `backend/app/core/otel.py` - setup happens in `main.py` lifespan

**Metrics & Logging:**
- **Prometheus Metrics** (Python backend)
  - Client: `prometheus-client` 0.20.0+
  - Implementation: `backend/app/core/metrics.py` - exposes `/metrics` endpoint
  - Scrape: Configured in Fly.io or external monitoring stack

- **Structured Logging:**
  - Frontend: `console.*` (dev) + Sentry (prod errors)
  - Backend: Python `logging` module with request ID tagging (from `X-Request-ID` header)
  - Log Level: Configurable via environment (default INFO in prod)

## CI/CD & Deployment

**Hosting:**
- **Frontend:** Vercel (Git-based automatic deployments, Edge Functions via Supabase)
- **Backend:** Fly.io (Docker container, auto-restart, health checks)

**CI Pipeline:**
- GitHub Actions (workflows in `.github/workflows/`)
- Triggers: PR push, main branch commits, scheduled (weekly quality trends)
- Key checks:
  - `npm run check` - Biome + i18n hardcoding validation
  - `npm run build` - Rsbuild compilation
  - `npm run test:e2e:smoke` - Playwright smoke tests
  - Backend: `pytest` + health check (`GET /health`)
  - `python .agent/scripts/security_validator.py .` - Mandatory security audit
  - `python .agent/scripts/metrics_collector.py .` - Performance metrics collection

**Secret Scanning:**
- Gitleaks integration (`npm run ci:secret-scan:gitleaks`)
- Generic secret patterns (`npm run ci:secret-scan`)

**Database Migrations:**
- Supabase migrations (SQL files in `supabase/migrations/`)
- Pre-deploy validation: `npm run ci:db-migration-safety`
- Neon History DB: Optional historical archive via `NEON_DATABASE_URL`

## Environment Configuration

**Required env vars (Frontend):**
- `VITE_SUPABASE_URL` - Supabase API endpoint
- `VITE_SUPABASE_ANON_KEY` - Public API key
- `VITE_API_URL` - Backend REST API base URL

**Optional env vars (Frontend):**
- `VITE_WS_URL` - WebSocket server (realtime, fail-open if missing)
- `VITE_SENTRY_DSN` - Sentry error tracking
- `VITE_CLARITY_PROJECT_ID` - Clarity session replay
- `VITE_ANALYTICS_ENABLED` - Override analytics consent
- `VITE_DISABLE_ANALYTICS` - Hard-disable all telemetry
- `VITE_API_TIMEOUT_MS` - HTTP timeout (default 8000ms)

**Required env vars (Backend):**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Stripe payments
- `SUPABASE_URL`, `SUPABASE_KEY` - Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access (database writes)
- `DATABASE_URL` - Primary Postgres connection
- `REDIS_URL` - Cache connection

**Optional env vars (Backend):**
- `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT` - Distributed tracing
- `GOOGLE_SHEETS_CREDENTIALS_PATH`, `GOOGLE_SHEETS_SPREADSHEET_ID` - Event logging
- `ADMIN_EMAIL_ALLOWLIST` - Fallback admin auth (email-based)
- `NEON_DATABASE_URL` - Historical archive (BigQuery export)

**Secrets location:**
- `.env` (git-ignored, never committed)
- `.env.local` (dev overrides, git-ignored)
- `.env.production.local` (production overrides, git-ignored)
- Vercel environment settings (production secrets)
- Fly.io secrets (backend environment variables)

## Webhooks & Callbacks

**Incoming Webhooks:**
- **Stripe Webhook** - `POST /api/v1/payments/webhook`
  - Signature: Verified via `stripe.Webhook.construct_event()`
  - Events: `checkout.session.completed` (order fulfillment)
  - Payload: Order ID, session ID, customer email
  - Idempotency: Database row lock on orders table (atomic transaction)
  - Implementation: `backend/app/api/routers/payments.py:handle_webhook()`

- **Google Sheets Webhooks** (optional legacy mode)
  - Endpoints: `SHEETS_WEBHOOK_EVENTS_URL`, `SHEETS_WEBHOOK_PARTNER_URL`
  - Signature: Verified via `SHEETS_WEBHOOK_SECRET`
  - Strategy: Toggled via `SHEETS_STRATEGY` env (default: `db_sync` bypasses webhooks)

**Outgoing Webhooks/Callbacks:**
- **Discord Webhook** (optional admin notifications)
  - Endpoint: `DISCORD_WEBHOOK_URL`
  - Purpose: Real-time alerts for critical events (payment failures, security issues)
  - Implementation: Async via `asyncio.create_task()` in payment routes

- **Browser Notifications** (PWA)
  - Method: Service Worker via Notification API
  - Triggers: App updates, local alerts (push not enabled by default)

## Rate Limiting

**Backend:**
- Framework: `slowapi` (Starlette-based rate limiter)
- Config: Per-route limits in router decorators (e.g., `@limiter.limit("60/minute")`)
- Implementation: `backend/app/core/rate_limit.py`
- Storage: In-memory (resets per process), no distributed state
- Fallback: 429 Too Many Requests response

**Frontend:**
- Query client: Auto-retry with exponential backoff (max 2 attempts)
- Timeout: 8s default, configurable via `VITE_API_TIMEOUT_MS`
- No client-side rate limiting enforced

---

*Integration audit: 2026-03-03*
