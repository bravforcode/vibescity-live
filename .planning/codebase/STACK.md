# Technology Stack

**Analysis Date:** 2026-03-03

## Languages

**Primary:**
- JavaScript/TypeScript (ES2024+) - Frontend application logic, Vue components, composables
- Python (3.12) - Backend API, service layer, async workers
- Vue3 (composition API + `<script setup>`) - Frontend UI framework

**Secondary:**
- HTML5 - Template markup (via Vue SFC)
- PostCSS - CSS preprocessing
- GLSL - Fragment shaders (map rendering: `src/engine/rendering/shaders/chromaticGlass.js`)

## Runtime

**Environment:**
- Node.js (maintained LTS, no version pinned in `.nvmrc`)
- Python 3.12 runtime (requires `>=3.12` per `backend/pyproject.toml`)
- Browser: ES2024, modern APIs (AbortSignal, IndexedDB, Service Worker)

**Package Manager:**
- Frontend: npm/bun (uses `package.json`, no bun lockfile visible)
- Backend: uv (Python package manager, referenced in `pyproject.toml`)
- Lockfile: `package-lock.json` (npm format)

## Frameworks

**Core:**
- Vue 3.5.24 - Progressive framework for reactive UI
- FastAPI 0.109.0+ - Async Python web framework for REST API
- Pinia 3.0.4 - State management store (Vue)
- Vue Router 4.6.4 - Client-side routing
- Vue i18n 9.14.5 - Internationalization (en, th locales)

**UI & Components:**
- Tailwind CSS 3.4.19 - Utility-first CSS framework
- Rsbuild 1.7.2 - Rust-based build bundler (replaces Webpack)
- Storybook 10.2.0 - Component development environment

**Data Fetching:**
- TanStack Vue Query 5.92.8 - Server state management + caching
- Axios 1.13.2 - HTTP client (dual with native fetch)
- Supabase JS Client 2.95.3 - PostgreSQL + auth client
- FastAPI Depends + background tasks

**Real-time & Signals:**
- WebSocket (native API) - For map effect updates, hotspot broadcasts
- Redis 5.0.0+ (Python client) - Session/ephemeral caching, event queues

**Testing:**
- Playwright 1.58.2 - E2E testing (smoke tests, visual regression)
- Vitest 4.0.18 - Unit testing framework (happy-dom environment)
- pytest 8.0.0+ (backend) - Python unit/integration tests
- @vue/test-utils 2.4.6 - Vue component testing utilities

**Build & Compile:**
- Rsbuild (@rsbuild/core 1.7.2) - Rust-based bundler (main build tool)
- Vite 7.2.4 - Development server + module bundler fallback
- PostCSS 8.5.6 - CSS transformation with autoprefixer
- Tailwind CSS JIT - On-demand style generation
- Workbox 7.4.0 - Service Worker precaching for PWA
- TypeScript 5.9.3 - Type checking (compiled to JS)

**Code Quality:**
- Biome 2.3.11 - Linter + formatter (ESLint alternative, Prettier alternative)
- Ruff 0.2.0+ (Python) - Fast linter for backend
- Knip 5.83.0 - Unused file/export detection
- Lighthouse 12.8.2 - Performance auditing

## Key Dependencies

**Critical Frontend:**
- `@supabase/supabase-js` 2.95.3 - Database, auth, RLS via REST API
- `maplibre-gl` 4.7.0 - Vector maps (Mapbox-compatible, fully open-source)
- `@mapbox/mapbox-gl-geocoder` 5.1.2 - Address search (depends on Mapbox services)
- `stripe` (client-side via Checkout.js) - Payment processing
- `lottie-web` 5.13.0 - SVG animations
- `@vueuse/core` 14.2.0 - Vue composition utilities
- `qrcode.vue` 3.8.0 - QR code generation
- `uuid` 13.0.0 - ID generation
- `idb-keyval` 6.2.2 - IndexedDB wrapper for offline cache

**Infrastructure & Observability:**
- `@sentry/vue` 10.36.0 - Error tracking (frontend DSN configurable via env)
- `@microsoft/clarity` 1.0.2 - Session replay + analytics (opt-in via consent)
- `@vercel/speed-insights` 1.3.1 - Core Web Vitals monitoring
- `canvas-confetti` 1.9.4 - Particle effects
- `aos` 2.3.4 - Scroll animations (Animate On Scroll)

**Critical Backend:**
- `fastapi` 0.109.0+ - ASGI web framework
- `uvicorn[standard]` 0.27.0+ - ASGI server
- `pydantic` 2.6.0+ - Data validation + parsing
- `stripe` 8.1.0+ - Stripe payment API client
- `supabase` 2.3.0+ - Python Supabase client
- `redis` 5.0.0+ - Cache + queue client
- `websockets` 12.0+ - WebSocket server (realtime)
- `httpx` 0.26.0+ - Async HTTP client (for third-party APIs)
- `python-multipart` 0.0.7+ - Multipart form handling

**Observability (Backend):**
- `prometheus-client` 0.20.0+ - Metrics collection
- `opentelemetry-api` 1.26.0+, `opentelemetry-sdk`, `opentelemetry-exporter-otlp` - Distributed tracing
- `opentelemetry-instrumentation-fastapi` 0.47b0+ - Auto-instrumentation
- `opentelemetry-instrumentation-httpx` 0.47b0+ - HTTP client tracing

**External Services (Python):**
- `gspread` 6.1.2 - Google Sheets API client (event logging)
- `google-auth` 2.29.0 - Google OAuth for Sheets
- `requests` 2.31.0 - Sync HTTP (fallback for some integrations)
- `h3` 4.4.0 - Hierarchical hexagonal indexing for geo (map clustering)

## Configuration

**Environment:**
- **Frontend:**
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` - Supabase REST endpoint + public key
  - `VITE_API_URL` - Backend base URL (e.g., `https://api.vibecity.live`)
  - `VITE_WS_URL` - WebSocket server (realtime map updates)
  - `VITE_SENTRY_DSN` - Error tracking endpoint
  - `VITE_CLARITY_PROJECT_ID` - Microsoft Clarity tracking ID
  - `VITE_ANALYTICS_ENABLED`, `VITE_DISABLE_ANALYTICS` - Opt-in tracking
  - `VITE_API_TIMEOUT_MS` - Default timeout for API calls (default 8000ms)
  - Loaded from `.env` + `.env.local` (git-ignored)

- **Backend:**
  - Loaded via `pydantic-settings` from `.env` (git-ignored)
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Stripe API credentials
  - `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` - Database access
  - `REDIS_URL` - Cache connection string
  - `DATABASE_URL` - Direct Postgres connection (primary)
  - `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` - Tracing config
  - `ADMIN_EMAIL_ALLOWLIST` - Comma-separated admin emails for fallback auth
  - `GOOGLE_SHEETS_CREDENTIALS_PATH`, `GOOGLE_SHEETS_SPREADSHEET_ID` - Event logging

**Build:**
- `rsbuild.config.ts` - Build configuration (Rsbuild entry point)
- `tsconfig.json` - TypeScript compiler options (strict: false, path alias `@/src`)
- `vite.config.js` - Fallback dev server config
- `vitest.config.js` - Unit test runner (happy-dom environment, v8 coverage)
- `playwright.config.ts` - E2E test runner (Desktop Chromium, Firefox, WebKit)
- `tailwind.config.js` - CSS utility classes
- `postcss.config.js` - CSS processing chain
- `.prettierrc` or Biome rules - Code formatting

**Security & Validation:**
- `python .agent/scripts/security_validator.py .` - Mandatory security check
- `python .agent/scripts/metrics_collector.py .` - Mandatory performance metrics
- Pre-commit hook: i18n hardcoding detection (`scripts/setup-i18n-hook.mjs`)

## Platform Requirements

**Development:**
- Node.js (any maintained LTS)
- Python 3.12+
- Docker (for local Postgres + Redis: `docker-compose.yml`)
- Git
- Recommended: VS Code with ESLint + Biome extensions

**Production:**
- **Frontend:** Vercel (static hosting, edge functions via Supabase)
- **Backend:** Fly.io (Docker container orchestration)
- **Database:** Supabase (managed Postgres + pgvector extension)
- **Cache:** Fly.io Redis (external managed Redis)
- **CDN:** Vercel CDN (automatic for static assets)
- **DNS/Domain:** vibecity.live (HTTPS enforced)

**Service Dependencies:**
- Stripe (payment processing)
- Maplibre GL (vector tiles via public sources, optional Mapbox geocoder)
- Google Sheets API (admin event logging)
- Supabase (authentication, RLS policies, Edge Functions)
- OpenTelemetry (OTLP-compatible backend, optional)

---

*Stack analysis: 2026-03-03*
