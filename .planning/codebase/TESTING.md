# Testing Patterns

**Analysis Date:** 2026-03-03

## Test Framework

**Frontend Runner:**
- Framework: Vitest 4.0.18
- Config: `vitest.config.js`
- Environment: happy-dom (lightweight DOM simulation)
- Global test utilities enabled: `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi`

**E2E Framework:**
- Framework: Playwright 1.58.2
- Config: `playwright.config.ts`
- Browsers: Desktop Chromium (mobile via device profiles optional)
- Base URL: `http://localhost:5173` (configurable via `PLAYWRIGHT_BASE_URL`)

**Backend Framework:**
- Framework: pytest (Python)
- Config: `conftest.py` with FastAPI TestClient
- Auto-skip network tests when DNS unavailable

**Run Commands:**
```bash
# Frontend unit tests
bun run test:unit              # Watch mode
bun run test:unit:coverage     # With coverage report

# E2E tests
bun run test:e2e               # Full suite
bun run test:e2e:smoke         # Smoke tests only (@smoke tag)
bun run test:e2e:ui            # Playwright UI mode
bun run test:e2e:map-required  # Tests requiring @map-required tag
bun run test:e2e:debug         # Slow-motion debug (150ms)

# Backend tests
cd backend && pytest            # All tests
cd backend && pytest -k test_health_contract  # Specific test
```

## Test File Organization

**Location:**
- Frontend unit: `tests/unit/**/*.spec.js` (separate from src/)
- Frontend system: `src/**/*.system.spec.js` (co-located with source)
- E2E: `tests/e2e/**/*.spec.ts` (Playwright format)
- Backend: `backend/tests/test_*.py` (pytest format)

**Naming:**
- Unit: `apiClient.spec.js`, `queryClient.spec.js`, `router.spec.js`
- System: `visitorIdentity.system.spec.js`, `networkState.system.spec.ts`
- E2E: `smoke.spec.ts`, `map_flow.spec.ts`, `payment_status_contract.spec.ts`
- Backend: `test_health.py`, `test_auth.py`, `test_map_core.py`

**File Structure:**
```
tests/
├── unit/
│   ├── apiClient.spec.js       # API client behavior
│   ├── queryClient.spec.js     # TanStack Query integration
│   └── router.spec.js          # Vue Router
├── e2e/
│   ├── smoke.spec.ts           # Basic app functionality
│   ├── map_flow.spec.ts        # Map interactions
│   ├── payment_status_contract.spec.ts  # Payment flows
│   └── helpers/
│       ├── mapProfile.ts       # Map readiness helpers
│       └── consoleGate.ts      # Console error detection
└── integration/
    └── (optional)

src/
├── services/
│   ├── visitorIdentity.js
│   └── visitorIdentity.system.spec.js   # Co-located
└── composables/
    └── (system specs co-located)

backend/tests/
├── conftest.py                 # Shared fixtures
├── test_health_contract.py
├── test_map_core.py
├── test_admin_orders.py
└── test_geodata.py
```

## Test Structure

**Frontend Unit Test Pattern** (`tests/unit/apiClient.spec.js`):
```javascript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock external dependencies
vi.mock("../../src/lib/runtimeConfig", () => ({
  getApiV1BaseUrl: () => "https://api.test",
}));

vi.mock("../../src/services/visitorIdentity", () => ({
  bootstrapVisitor: vi.fn(async () => {}),
  getOrCreateVisitorId: vi.fn(() => "visitor-123"),
  getVisitorToken: vi.fn(() => "token-abc"),
  isVisitorTokenExpired: vi.fn(() => false),
}));

import * as visitorIdentity from "../../src/services/visitorIdentity";
import {
  ApiClientError,
  apiFetch,
  isRetriableApiError,
  parseApiError,
} from "../../src/services/apiClient";

describe("apiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("injects visitor headers and JSON body", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await apiFetch("/ping", {
      method: "POST",
      body: { ok: true },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.test/ping",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ok: true }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Visitor-Id": "visitor-123",
          "X-Visitor-Token": "token-abc",
        }),
      }),
    );
  });
});
```

**Frontend System Test Pattern** (`src/services/visitorIdentity.system.spec.js`):
```javascript
import {
  getOrCreateVisitorId,
  getVisitorToken,
  getVisitorTokenPayload,
  isVisitorTokenExpired,
  setVisitorToken,
} from "./visitorIdentity";

const VISITOR_ID_KEY = "vibe_visitor_id";
const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("visitorIdentity", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns existing valid visitor id from localStorage", () => {
    localStorage.setItem(VISITOR_ID_KEY, VALID_UUID);
    expect(getOrCreateVisitorId()).toBe(VALID_UUID);
  });

  it("creates and stores a UUID when missing or invalid", () => {
    localStorage.setItem(VISITOR_ID_KEY, "invalid-id");
    const visitorId = getOrCreateVisitorId();
    expect(visitorId).toMatch(UUID_V4_PATTERN);
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBe(visitorId);
  });
});
```

**E2E Test Pattern** (`tests/e2e/smoke.spec.ts`):
```typescript
import { expect, test } from "@playwright/test";
import {
  enforceMapConditionOrSkip,
  hasWebGLSupport,
} from "./helpers/mapProfile";

const APP_TITLE = /VibeCity/;

async function waitForAppLoad(page: any) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator("[data-testid='splash-screen']")
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => console.log("Splash screen handling timed out or skipped"));
  await page.waitForTimeout(1000);
}

function locators(page: any) {
  return {
    titleOk: async () => {
      await expect(page).toHaveTitle(APP_TITLE, { timeout: 15_000 });
    },
    mapShell: page
      .getByTestId("map-shell")
      .or(page.locator("[data-testid='map-shell']"))
      .or(page.locator("#map")),
    header: page.getByTestId("header"),
    drawer: page.getByTestId("drawer-shell").or(page.getByTestId("drawer")),
  };
}

test.describe("VibeCity – Smoke Tests", { tag: "@smoke" }, () => {
  test("title is correct", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await locators(page).titleOk();
  });

  test("non-admin visiting /admin is redirected home", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForURL(
      (url) => url.pathname === "/" || /^\/(th|en)$/.test(url.pathname),
      { timeout: 15_000 },
    );
    await expect(page).not.toHaveURL(/\/admin(\/|$)/);
  });
});
```

**Backend Test Pattern** (`backend/tests/test_health_contract.py`):
```python
def test_health_contract_shape(client):
    response = client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert body.get("status") in {"ok", "degraded"}
    assert isinstance(body.get("version"), str)

    checks = body.get("checks")
    assert isinstance(checks, dict)
    for key in ("supabase", "redis", "qdrant"):
        assert key in checks


def test_health_response_includes_request_id(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")
```

## Mocking

**Framework:** Vitest's `vi` module (Mock implementation)

**Setup Pattern:**
```javascript
// Before imports
vi.mock("../../src/lib/runtimeConfig", () => ({
  getApiV1BaseUrl: () => "https://api.test",
}));

vi.mock("../../src/services/visitorIdentity", () => ({
  bootstrapVisitor: vi.fn(async () => {}),
  getOrCreateVisitorId: vi.fn(() => "visitor-123"),
  getVisitorToken: vi.fn(() => "token-abc"),
  isVisitorTokenExpired: vi.fn(() => false),
}));

// After imports
import * as visitorIdentity from "../../src/services/visitorIdentity";
```

**Mocking Patterns:**

1. **Spy on function calls**:
```javascript
const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
vi.stubGlobal("fetch", fetchSpy);

expect(fetchSpy).toHaveBeenCalledTimes(1);
expect(fetchSpy).toHaveBeenCalledWith(url, config);
```

2. **Return values**:
```javascript
visitorIdentity.getVisitorToken
  .mockReturnValueOnce("expired-token")
  .mockReturnValueOnce("expired-token")
  .mockReturnValueOnce("fresh-token");
```

3. **Fake objects for external APIs**:
```python
# backend/tests/test_map_core.py
class FakeSupabase:
    def __init__(self, *, rpc_data=None, table_rows=None):
        self._rpc_data = rpc_data or {}
        self._table_rows = table_rows or []

    def rpc(self, name, _params):
        return _FakeRPC(self._rpc_data.get(name, []))

    def table(self, _name):
        return _FakeTableQuery(self._table_rows)

@pytest.fixture()
def fake_supabase(monkeypatch):
    def _install(*, rpc_data=None, table_rows=None):
        sb = FakeSupabase(rpc_data=rpc_data, table_rows=table_rows)
        monkeypatch.setattr(map_core_module, "_get_supabase", lambda: sb)
        return sb
    return _install
```

**What to Mock:**
- External APIs (fetch, Supabase, Stripe)
- Network calls (HTTP requests)
- Environment variables (via vi.mock or env override)
- Time (Date.now() when testing expiry logic)
- Local storage / session storage

**What NOT to Mock:**
- Internal module logic (unless circular dependency)
- Vue composables (test real behavior)
- Form submission handlers (test integration)
- Routers and navigation guards
- Local state mutations

## Fixtures and Factories

**Frontend Test Data:**
```javascript
const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const buildToken = (payload) =>
  `${base64UrlEncode(JSON.stringify(payload))}.test-signature`;
```

**Backend Test Fixtures** (`backend/tests/conftest.py`):
```python
@pytest.fixture(scope="session")
def client():
    return TestClient(app)

@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}

@pytest.fixture()
def fake_user():
    return SimpleNamespace(id="user-123", app_metadata={})

@pytest.fixture()
def override_auth(fake_user):
    app.dependency_overrides[verify_user] = lambda: fake_user
```

**Location:**
- Frontend fixtures: Inline in test file or `tests/unit/fixtures/` (optional)
- Backend fixtures: `backend/tests/conftest.py` (shared across all tests)
- Test data: Define constants near describe/test blocks

## Coverage

**Requirements:** No enforced minimum (development phase)

**View Coverage:**
```bash
bun run test:unit:coverage    # HTML report at coverage/index.html
```

**Configuration** (`vitest.config.js`):
```javascript
coverage: {
  provider: "v8",
  reporter: ["text", "lcov", "html"],
  reportsDirectory: "coverage",
  all: true,  // Include all src files, even untested
  include: ["src/**/*.{js,ts,vue}"],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/public/**",
    "src/main.{js,ts}",
    "src/**/router/**",
    "src/**/i18n/**",
  ],
  reportOnFailure: true,
}
```

## Test Types

**Unit Tests:**
- Scope: Single function/service in isolation
- Mocking: All external dependencies
- Location: `tests/unit/**/*.spec.js`
- Example: `apiClient.spec.js` (tests fetch behavior, timeout handling, error translation)
- Speed: Fast (< 100ms per test)

**System Tests (Frontend):**
- Scope: Component + service integration without full app
- Mocking: Minimal (test real localStorage, real DOM behavior)
- Location: `src/**/*.system.spec.js` (co-located)
- Example: `visitorIdentity.system.spec.js` (tests token caching, localStorage sync)
- Speed: Medium (< 500ms per test)

**E2E Tests:**
- Scope: Full app flow from user perspective
- Mocking: None (hit real backend, real map, real auth)
- Location: `tests/e2e/**/*.spec.ts`
- Example: `smoke.spec.ts`, `map_flow.spec.ts`
- Tags: `@smoke`, `@map-required`, `@map-quarantine`, `@smoke-map-lite`
- Speed: Slow (5-60s per test)

**Backend Contract Tests:**
- Scope: HTTP endpoint behavior, data shape validation
- Mocking: Supabase RPC via `FakeSupabase`
- Location: `backend/tests/test_*.py`
- Example: `test_health_contract.py` (validates `/health` response shape)
- Speed: Medium (< 1s per test)

**E2E Test Tags:**
```bash
# Mark tests with @tag
test.describe("...", { tag: "@smoke" }, () => {
  test("...", async () => { ... });
});

# Run by tag
bun run test:e2e:smoke           # Only @smoke
bun run test:e2e:map-required    # Only @map-required
bun run test:e2e:map-quarantine  # Only @map-quarantine
```

## Common Patterns

**Async Testing (Vitest):**
```javascript
it("refreshes visitor token when requested and expired", async () => {
  visitorIdentity.getVisitorToken
    .mockReturnValueOnce("expired-token")
    .mockReturnValueOnce("fresh-token");
  visitorIdentity.isVisitorTokenExpired.mockReturnValue(true);

  const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);

  await apiFetch("/secure", { refreshVisitorTokenIfNeeded: true });

  expect(visitorIdentity.bootstrapVisitor).toHaveBeenCalledWith({
    forceRefresh: true,
  });
});
```

**Error Testing:**
```javascript
it("wraps timeout abort as retriable ApiClientError", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new DOMException("Request timed out", "TimeoutError"));
        });
      });
    }),
  );

  await expect(apiFetch("/slow", { timeoutMs: 10 })).rejects.toMatchObject({
    code: "API_TIMEOUT",
    timeout: true,
    retriable: true,
    path: "/slow",
  });
});
```

**E2E Assertions:**
```typescript
// Check visibility
await expect(mapShellReady).toBeVisible();

// Check attributes
await expect(page).not.toHaveURL(/\/admin(\/|$)/);

// Wait for state change
const drawerVisible = await drawer
  .waitFor({ state: "visible", timeout: 10_000 })
  .then(() => true)
  .catch(() => false);

// Count elements
const markerCount = await markers.count();
enforceMapConditionOrSkip(markerCount > 0, "No map markers found.");
```

**Playwright Helpers** (`tests/e2e/helpers/mapProfile.ts`):
```typescript
export async function waitForMapReadyOrSkip(page, timeout = 60_000) {
  return page
    .locator('[data-testid="map-shell"][data-map-ready="true"]')
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

export function enforceMapConditionOrSkip(condition, message) {
  if (!condition) {
    test.skip(true, message);
  }
}

export function hasWebGLSupport() {
  // Check browser capability
  return true; // or false
}
```

**Playwright Console Gate** (`tests/e2e/helpers/consoleGate.ts`):
```typescript
export function attachConsoleGate(page) {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  return {
    assertClean: () => {
      expect(errors).toEqual([]);
    },
  };
}
```

## Test Configuration

**Vitest** (`vitest.config.js`):
- Environment: happy-dom (lightweight)
- Globals: enabled (no need to import describe/it)
- Test pattern: `tests/unit/**/*.spec.{js,ts}`
- Coverage: v8, lcov format for SonarCloud

**Playwright** (`playwright.config.ts`):
- Test dir: `tests/e2e`
- Workers: 1 in CI, 50% of CPUs in local dev (unless `PW_LOW_MEM=1`)
- Retries: 2 in CI, 0 locally
- Timeout: 90s per test (configurable per test via `timeout:`)
- Base URL: `http://localhost:5173` (overrideable)

---

*Testing analysis: 2026-03-03*
