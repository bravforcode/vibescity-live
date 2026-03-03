# Codebase Structure

**Analysis Date:** 2025-03-03

## Directory Layout

```
vibecity.live/
├── src/                          # Vue3 frontend (Rsbuild + Tailwind)
│   ├── main.js                   # App entry, Pinia/Router/i18n init
│   ├── App.vue                   # Root component with router-view
│   ├── i18n.js                   # i18n config (en, th locales)
│   ├── router/
│   │   └── index.js              # Vue Router with locale guards
│   ├── views/                    # Page containers
│   │   ├── HomeView.vue          # Main app shell (map + feed)
│   │   ├── AdminView.vue         # Admin dashboard
│   │   ├── PartnerDashboard.vue  # Partner portal
│   │   └── *.vue                 # Static pages (Privacy, Terms)
│   ├── components/               # Feature-organized components
│   │   ├── map/                  # MapboxContainer (renamed to MapLibreGL)
│   │   ├── feed/                 # BottomFeed, ImmersiveFeed
│   │   ├── ui/                   # Shared UI (Modal, SidebarDrawer, etc.)
│   │   ├── admin/                # Admin panels (DataTable, AdminUsers, etc.)
│   │   ├── modal/                # Modal dialogs
│   │   ├── layout/               # Header, SideBar
│   │   └── *.vue                 # Other feature components
│   ├── composables/              # State & logic (50+ composables)
│   │   ├── useAppLogic.js        # Main orchestrator
│   │   ├── useMapLogic.js        # Map interactions
│   │   ├── map/                  # Map-specific composables
│   │   ├── engine/               # Performance optimizations
│   │   └── *.js                  # Focused domain composables
│   ├── store/                    # Pinia stores
│   │   ├── index.js              # cleanup function export
│   │   ├── userStore.js          # Auth + profile
│   │   ├── shopStore.js          # Shop/venue data
│   │   ├── coinStore.js          # Gamification state
│   │   ├── favoritesStore.js     # Saved venues
│   │   └── *.js                  # Other state modules
│   ├── services/                 # Business logic + API calls
│   │   ├── apiClient.js          # HTTP client with auth injection
│   │   ├── visitorIdentity.js    # Device-based auth
│   │   ├── shopService.js        # Venue queries
│   │   ├── paymentService.js     # Stripe integration
│   │   ├── analyticsService.js   # Event tracking
│   │   └── *.js                  # Domain-specific services
│   ├── lib/                      # Shared utilities
│   │   ├── supabase.js           # Supabase client
│   │   ├── runtimeConfig.js      # Env config + runtime helpers
│   │   ├── cookies.js            # Client-side cookie management
│   │   └── *.js                  # Other utilities
│   ├── utils/                    # Pure functions
│   │   ├── shopUtils.js          # Distance calc, filtering
│   │   ├── storageHelper.js      # localStorage wrapper
│   │   └── *.js                  # Helpers (date, format, etc.)
│   ├── assets/                   # Static assets
│   │   ├── css/                  # Global CSS (main.postcss hides Mapbox controls)
│   │   ├── map-styles/           # Mapbox style JSONs
│   │   └── animations/           # Optimized animation CSS
│   ├── locales/                  # i18n translations
│   │   ├── en.json               # English strings
│   │   └── th.json               # Thai strings
│   ├── plugins/                  # Vue plugins
│   │   ├── queryClient.js        # VueQuery config
│   │   └── *.js                  # Other plugins
│   ├── engine/                   # Advanced features
│   │   ├── rendering/            # Mapbox rendering (SDFClusterLayer, etc.)
│   │   ├── physics/              # SpringSolver for animations
│   │   ├── audio/                # HapticResonance
│   │   └── workers/              # Web Workers
│   └── schema/                   # Zod/validation schemas
│
├── backend/                      # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── main.py               # FastAPI app init, lifespan, middleware
│   │   ├── api/
│   │   │   └── routers/          # Endpoint routers
│   │   │       ├── admin.py      # Admin endpoints
│   │   │       ├── shops.py      # Shop/venue endpoints
│   │   │       ├── payments.py   # Stripe webhook + session creation
│   │   │       ├── map_core.py   # Map data endpoints
│   │   │       └── *.py          # Other domain routers
│   │   ├── core/                 # Infrastructure & security
│   │   │   ├── auth.py           # JWT verify, admin check, token cache
│   │   │   ├── supabase.py       # Supabase client init
│   │   │   ├── config.py         # Settings from env
│   │   │   ├── logging.py        # Structured logging
│   │   │   ├── cache.py          # Redis wrapper
│   │   │   ├── rate_limit.py     # slowapi rate limiter
│   │   │   ├── metrics.py        # Performance metrics
│   │   │   └── *.py              # Other core modules
│   │   ├── services/             # Business logic
│   │   │   ├── venue_repository.py  # Shop/venue queries + caching
│   │   │   ├── shop_service.py      # Shop business rules
│   │   │   ├── analytics_service.py # Event batching + flush
│   │   │   ├── slip_verification.py # Payment verification
│   │   │   └── *.py              # Other domain services
│   │   ├── models/               # Pydantic models
│   │   │   └── anonymous_session.py # Session tracking
│   │   ├── middleware/           # HTTP middleware
│   │   │   └── security.py       # Security headers, CSP
│   │   ├── db/                   # Database utilities
│   │   ├── jobs/                 # Background tasks
│   │   └── ingestion/            # Data import utilities
│   ├── migrations/               # Alembic or raw SQL
│   ├── tests/                    # Test files
│   │   ├── test_admin.py
│   │   ├── test_map_core.py
│   │   └── *.py
│   ├── scripts/                  # Utility scripts
│   └── requirements.txt          # Python dependencies
│
├── e2e/                          # Playwright E2E tests
│   ├── tests/                    # Test specs
│   └── fixtures/                 # Test data
│
├── public/                       # Static public files
│   ├── index.html                # App shell
│   ├── sw.js                     # Service worker (Workbox)
│   ├── manifest.json             # PWA manifest
│   └── favicons/                 # Icons
│
├── .github/
│   └── workflows/                # GitHub Actions CI/CD
│
├── .planning/                    # GSD planning docs
│   └── codebase/                 # This folder (ARCHITECTURE.md, STRUCTURE.md, etc.)
│
├── .storybook/                   # Storybook config for components
│
├── rsbuild.config.ts             # Frontend build config (Rsbuild)
├── vite.config.js                # Vite config (legacy, for PWA plugins)
├── vitest.config.js              # Unit test config
├── playwright.config.ts          # E2E test config
├── package.json                  # Frontend dependencies + scripts
├── tsconfig.json                 # TypeScript config (Vue components)
├── tailwind.config.js            # Tailwind CSS config
├── .eslintrc or biome.json       # Linting config
│
├── backend/
│   ├── pyproject.toml            # Python project config, dependencies
│   ├── .ruff.toml                # Ruff linting config
│   └── Dockerfile                # Container image for Fly.io
│
├── CLAUDE.md                     # Project constraints & guardrails
└── README.md                     # Documentation
```

## Directory Purposes

**src/**
- Purpose: Vue3 frontend source code (compiled by Rsbuild)
- Contains: Components, composables, services, stores, pages
- Key files: main.js (entry), router/index.js (routes), App.vue (root)

**backend/app/api/routers/**
- Purpose: FastAPI route handlers grouped by domain
- Contains: Endpoint definitions with Pydantic validation
- Key files: shops.py (GET /api/v1/shops), payments.py (POST /api/v1/payments/webhook)

**backend/app/core/**
- Purpose: Infrastructure (auth, config, caching, logging, rate limiting)
- Contains: Cross-cutting concerns, external SDK initialization
- Key files: auth.py (JWT + admin check), supabase.py (Supabase client), config.py (env loading)

**backend/app/services/**
- Purpose: Business logic, data transformation, repository access
- Contains: Domain-specific logic that routers delegate to
- Key files: venue_repository.py (Supabase + Redis), analytics_service.py (event batching)

**src/composables/**
- Purpose: Encapsulate state management & side effects using Vue 3 composition API
- Contains: Hooks for features, state derivation, lifecycle management
- Key files: useAppLogic.js (main orchestrator), useMapLogic.js (map interactions)

**src/store/**
- Purpose: Global reactive state via Pinia
- Contains: State definitions, getters, actions, persistence config
- Key files: userStore.js (auth + profile), shopStore.js (venue data)

**src/services/**
- Purpose: API calls, data fetching, external integrations
- Contains: Business logic that doesn't belong in components
- Key files: apiClient.js (HTTP client), shopService.js (shop queries)

## Key File Locations

**Entry Points:**

- `src/main.js`: Frontend app initialization (creates Vue app, registers Router/Pinia/i18n)
- `backend/app/main.py`: Backend app initialization (creates FastAPI app, registers routers/middleware)
- `src/router/index.js`: Route definitions, locale guards, admin checks
- `public/index.html`: HTML shell, loads main.js

**Configuration:**

- `.env` / `.env.production`: Runtime env vars (not committed)
- `rsbuild.config.ts`: Build settings, chunk splitting, target browsers
- `vite.config.js`: PWA plugin config, Sentry source map upload
- `pyproject.toml`: Python dependencies, project metadata
- `package.json`: Frontend scripts, dependencies, version

**Core Logic:**

- `src/composables/useAppLogic.js`: App initialization, filter logic, geolocation
- `src/composables/useMapLogic.js`: Map interactions, marker handling, flyTo animations
- `src/composables/map/useSentientMap.js`: Advanced venue prefetch FSM (1200+ lines)
- `backend/app/services/venue_repository.py`: Supabase + Redis caching for venues

**Testing:**

- `e2e/`: Playwright smoke tests, map tests, UI flow tests
- `src/**/*.spec.js` / `*.test.js`: Unit tests (vitest)
- `backend/tests/`: Python tests (pytest)
- `playwright.config.ts`: E2E test config with baseURL, timeout, retries

**Styling:**

- `src/assets/css/main.postcss`: Global CSS (Tailwind resets, Mapbox control hiding)
- `tailwind.config.js`: Tailwind design tokens, spacing, colors
- `src/assets/map-atmosphere.css`: Map layer styling
- Component-scoped `<style>` blocks for feature-specific styling

**i18n:**

- `src/i18n.js`: i18n initialization, locale fallback (default: "en")
- `src/locales/en.json`: English translation keys
- `src/locales/th.json`: Thai translation keys
- Components use `{{ $t('nav.home') }}` for template strings

## Naming Conventions

**Files:**

- Vue components: PascalCase (e.g., `HomeView.vue`, `SmartHeader.vue`)
- Composables: camelCase with `use` prefix (e.g., `useAppLogic.js`, `useMapInteractions.js`)
- Services: camelCase with `Service` suffix (e.g., `shopService.js`, `analyticsService.js`)
- Stores: camelCase with `Store` suffix (e.g., `userStore.js`, `shopStore.js`)
- Test files: Match source file + `.spec.js` or `.test.js` (e.g., `apiClient.spec.js`)
- Backend routers: snake_case (e.g., `admin.py`, `map_core.py`)

**Directories:**

- Feature folders: kebab-case (e.g., `src/components/admin/`, `src/composables/map/`)
- Domain grouping: plural nouns (e.g., `services/`, `stores/`, `composables/`)
- Backend: snake_case with domain names (e.g., `app/api/routers/`, `app/services/`)

**Functions:**

- Regular functions: camelCase (e.g., `calculateDistance`, `fetchShops`)
- Vue lifecycle: camelCase (e.g., `onMounted`, `computed`, `watch`)
- Async functions: camelCase (e.g., `fetchData`, `validateUser`)
- Event handlers: `on` + camelCase (e.g., `handleClick`, `onCardTap`)

**Variables:**

- Boolean prefixes: `is`, `has`, `should`, `can` (e.g., `isOpen`, `hasError`, `shouldFetch`)
- Reactive refs: camelCase ending with `Value` or just camelCase (e.g., `selectedVenue`, `isLoading`)
- Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_API_TIMEOUT_MS`, `MAX_RESULTS`)

**Types:**

- TypeScript interfaces: PascalCase (e.g., `User`, `Shop`, `ApiResponse`)
- Pydantic models (backend): PascalCase (e.g., `ShopResponse`, `PaymentWebhook`)

## Where to Add New Code

**New Feature (UI + Logic):**
- Primary code:
  - Component: `src/components/[feature]/[FeatureName].vue`
  - Logic: `src/composables/use[FeatureName].js`
  - State (if needed): `src/store/[featureName]Store.js`
- Tests:
  - E2E: `e2e/tests/[feature].spec.js`
  - Unit: `src/composables/use[FeatureName].spec.js`

**New Component/Module:**
- Implementation:
  - Reusable component: `src/components/ui/[ComponentName].vue`
  - Feature component: `src/components/[feature]/[ComponentName].vue`
  - Composable: `src/composables/use[ModuleName].js`
  - Store: `src/store/[moduleName]Store.js`
- Style:
  - Inline scoped `<style>` or external `src/assets/css/[component].css`
- Tests:
  - Co-locate in same directory or `src/components/[feature]/[ComponentName].spec.js`

**New Backend Endpoint:**
- Router file: `backend/app/api/routers/[domain].py`
  - Example: `backend/app/api/routers/reviews.py` for review endpoints
  - Include Pydantic request/response models
  - Decorate with `@limiter.limit()` for rate limiting
- Service: `backend/app/services/[domain]_service.py`
  - Contains business logic, repository access
- Dependency:
  - Add to router endpoint: `async def endpoint(..., user: dict = Depends(verify_user))`
  - Auto-inject via `Depends(verify_user)`, `Depends(verify_admin)`, or custom dependencies
- Register:
  - Import in `backend/app/main.py`: `from app.api.routers import [domain]`
  - Include in app: `app.include_router([domain].router, prefix="/api/v1", tags=["domain"])`

**Utilities:**
- Shared helpers: `src/utils/[name]Utils.js`
  - Example: `shopUtils.js` for distance calculation, filtering
  - Keep pure (no side effects)
- Backend utilities: `backend/app/core/[concern].py`
  - Example: `cache.py` for Redis helpers, `logging.py` for structured logging

**Database Schema (Backend):**
- Migrations:
  - Path: `backend/migrations/`
  - Approach: Alembic or raw SQL
  - Apply with: `alembic upgrade head`
- RLS Policies:
  - Define in Supabase dashboard or migrations
  - Example: Visitors can only see published venues

## Special Directories

**dist/**
- Purpose: Built frontend (Rsbuild output)
- Generated: Yes (by `bun run build`)
- Committed: No (.gitignore)

**coverage/**
- Purpose: Test coverage reports
- Generated: Yes (by `bun run test:unit:coverage`)
- Committed: No (.gitignore)

**node_modules/**
- Purpose: npm/bun dependencies
- Generated: Yes (by `bun install`)
- Committed: No (.gitignore)

**backend/.venv/**
- Purpose: Python virtual environment
- Generated: Yes (by `python -m venv .venv`)
- Committed: No (.gitignore)

**public/sw.js**
- Purpose: Service worker (Workbox precache manifest injected at build time)
- Generated: Partially (base exists, manifest injected by rsbuild plugin)
- Committed: Yes (base sw.js)

**.env**
- Purpose: Runtime environment variables
- Generated: No (created locally by developer)
- Committed: No (.gitignore)

**migrations/**
- Purpose: Database migration files
- Generated: Yes (by Alembic or manual creation)
- Committed: Yes (tracked for reproducibility)

---

*Structure analysis: 2025-03-03*
