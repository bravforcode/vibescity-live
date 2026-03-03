# Coding Conventions

**Analysis Date:** 2026-03-03

## Naming Patterns

**Files:**
- PascalCase for Vue components: `SkeletonCard.vue`, `SmartHeader.vue`
- camelCase for JavaScript modules: `useAppLogic.js`, `apiClient.js`, `shopService.js`
- SCREAMING_SNAKE_CASE for constants: `LEVEL_THRESHOLDS`, `DEFAULT_API_TIMEOUT_MS`, `VISITOR_ID_KEY`
- Descriptive service suffixes: `*Service.js`, `*Store.js`, `*Router.js`, `*Composable.js`
- System integration tests use `.system.spec.js/ts` suffix: `visitorIdentity.system.spec.js`, `networkState.system.spec.ts`

**Functions:**
- camelCase for all function names: `getOrCreateVisitorId()`, `calculateDistance()`, `fetchVenuesWithFallback()`
- Use present tense for action functions: `getShops()`, `listPendingShops()`, `verifyUser()`
- Prefix with `is`/`has`/`can` for boolean returns: `isVisitorTokenExpired()`, `hasWebGLSupport()`, `looksLikeVenueId()`
- Prefix with `on` for event handlers: `onPinTap()`, `onUnmounted()`
- Prefix with `use` for Vue composables: `useAppLogic()`, `useMapLogic()`, `usePerformance()`
- Prefix with `_` for private/internal functions: `_normalize_email()`, `_admin_email_allowlist()`, `_cache_get()`

**Variables:**
- camelCase for all variable names: `visitorId`, `visitorToken`, `isOnline`, `isDarkMode`
- Descriptive names over abbreviations: `visibleShops` not `vs`, `userPreferences` not `prefs`
- Boolean variables prefixed with `is`/`has`: `isDarkMode`, `hasWebGLSupport`, `isPromoted`
- Collections use plural forms: `reviews`, `venues`, `roles`, `shops`
- Ref variables in Vue: `const visitorId = ref()` then access as `.value`
- Computed properties named descriptively: `const formattedDate = computed(() => ...)`

**Types:**
- PascalCase for all type/interface names: `ApiClientError`, `ReviewAction`, `AdminOrderRow`, `SimpleNamespace`
- Suffix with `Response`, `Row`, `Error` for clarity: `AdminOrdersListResponse`, `AdminOrderRow`, `ApiClientError`
- Union types use camelCase for type variables: `string | null`, `boolean | undefined`

## Code Style

**Formatting:**
- Tool: Biome v2.3.11 (configured in `biome.json`)
- Indent style: Tab (1 tab = 1 level)
- Quote style: Double quotes (`"` not `'`)
- Line ending: Automatic (git-aware)

**Linting:**
- Tool: Biome linter with "recommended" preset enabled
- Disabled rules (relaxed for pragmatism):
  - `noUnusedVariables`: off (some helpers may be unused)
  - `noUnusedImports`: off
  - `useParseIntRadix`: off
  - `noGlobalIsNan`: off
  - `noDoubleEquals`: off
  - `noExplicitAny`: off (TypeScript projects)
  - `noArrayIndexKey`: off (Vue key handling)

**Run checks:**
```bash
bun run check              # Format + run i18n hardcoded check
bun run lint              # Lint only
bun run lint:fix          # Lint and fix
bun run format            # Format only
```

## Import Organization

**Order:**
1. External packages (Vue, frameworks, utilities)
2. Relative imports from `@/` (alias imports)
3. Relative imports from `../` or `./` (local files)

**Pattern example** (`src/services/apiClient.js`):
```javascript
// 1. External
import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import {
  bootstrapVisitor,
  getOrCreateVisitorId,
  getVisitorToken,
} from "./visitorIdentity";
```

**Pattern example** (`src/composables/useAppLogic.js`):
```javascript
// 1. External
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

// 2. Local @ aliases
import i18n from "../i18n.js";
import { setClientCookie } from "../lib/cookies";
import { supabase } from "../lib/supabase";

// 3. Other local imports
import { socketService } from "../services/socketService";
import { useCoinStore } from "../store/coinStore";
```

**Path Aliases:**
- `@` → `./src` (defined in `rsbuild.config.ts` and `vitest.config.js`)

## Error Handling

**Patterns:**

1. **Custom Error Classes** (always extend Error):
```javascript
export class ApiClientError extends Error {
  constructor(message, {
    code = API_NETWORK_ERROR_CODE,
    status = 0,
    retriable = false,
    timeout = false,
    cause = null,
    method = "GET",
    path = "",
    baseUrl = "",
    timeoutMs = 0,
  } = {}) {
    super(message);
    this.name = "ApiClientError";
    this.code = String(code || API_NETWORK_ERROR_CODE);
    this.status = Number(status || 0);
    // ... rest of properties
  }
}
```

2. **Error Translation**:
```javascript
const toApiClientError = (error, context = {}) => {
  const status = Number(error?.status || error?.statusCode || 0);
  const timeout = Boolean(context.timeoutTriggeredRef?.value);
  const code = timeout ? API_TIMEOUT_CODE : API_NETWORK_ERROR_CODE;
  const message = String(error?.message || defaultMessage);
  const retriable = timeout || status >= 500 || status === 0;

  return new ApiClientError(message, {
    code, status, retriable, timeout, cause: error, ...context
  });
};
```

3. **Fallback Queries** (Supabase schema cache handling):
```javascript
const fetchVenuesWithFallback = async (mutateQuery) => {
  const buildQuery = (select) => {
    let query = supabase.from("venues").select(select);
    if (typeof mutateQuery === "function") {
      query = mutateQuery(query);
    }
    return query;
  };

  let { data, error } = await buildQuery(VENUE_LIST_COLUMNS);
  if (error && isSupabaseSchemaCacheError(error)) {
    ({ data, error } = await buildQuery("*"));
  }
  if (error) throw error;
  return data || [];
};
```

4. **Error Status Checks**:
```javascript
export const isRetriableApiError = (error) =>
  Boolean(error?.retriable) ||
  Boolean(error?.timeout) ||
  Number(error?.status || 0) >= 500;
```

**Backend (FastAPI):**
```python
try:
    # Do work
    response = await asyncio.to_thread(supabase.auth.get_user, token)
    if not response or not response.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return response.user
except HTTPException:
    raise
except Exception:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    ) from e
```

## Logging

**Framework:** `console` (global, no framework)

**Patterns:**
- Use `console.log()` for informational logs (prefixed with descriptive context)
- Use `console.warn()` for warnings (non-fatal issues)
- Use `console.error()` for errors
- Prefix with context (domain/module name) in emoji format: `🔍 [useAppLogic]`, `⚠️ [map-preflight]`

**Examples**:
```javascript
console.log(`🔍 [useAppLogic] visibleShops changed: ${val?.length}`);
console.error("Init Error", e);
console.warn("No home location set yet");
```

**Backend (FastAPI):**
- Use Python's standard `logging` module
- Configure via `app.core.config`
- Context tagging: include `route`, `feature`, `request_id` in structured logs

## Comments

**When to Comment:**
- Complex business logic: explain WHY, not WHAT
- Workarounds or temporary solutions: `// HACK:`, `// TODO:`, `// FIXME:`
- Non-obvious algorithm choices
- Integration-specific behavior

**Examples**:
```javascript
// HACK: Supabase lib is 1645.8 kB — defer map features via lazy-load
const mapboxToken = sanitizeEnvToken(
  process.env.VITE_MAPBOX_TOKEN || readMapboxTokenFromDotEnv(),
);

// Schema cache invalidation — rebuild query if columns not recognized
if (error && isSupabaseSchemaCacheError(error)) {
  ({ data, error } = await buildQuery("*"));
}
```

**JSDoc/TSDoc:**
- Use for service functions, composables, and exported utilities
- Document parameters, return type, and purpose
- Optional for simple internal helpers

**Pattern**:
```javascript
/**
 * Maps Supabase Postgres data to the internal shop object format.
 * This ensures the UI doesn't break even if DB column names differ from CSV headers.
 */
const mapShopData = (item, index) => {
  // ...
};

/**
 * RPC: Get Map Pins (Bounds + Zoom Rules)
 * Includes an aggressive client timeout + circuit-breaker so the UI never hangs
 * waiting for a slow PostGIS query.
 */
export const getMapPins = async (bounds, zoomLevel) => {
  // ...
};
```

**Backend**:
```python
def _normalize_email(value: str | None) -> str:
    """Normalize email to lowercase, stripped."""
    return str(value or "").strip().lower()


async def verify_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Verifies the JWT token using Supabase Auth.
    Returns the user object if valid, raises 401 otherwise.
    Results are cached for 60s to avoid a remote call on every request.
    """
```

## Function Design

**Size:** Keep functions under 100 lines where possible. Complex operations split into smaller helpers.

**Parameters:**
- Pass objects for multiple related parameters: `{ baseUrl, method, body, timeoutMs }`
- Use destructuring in function signature for clarity
- Type-hint parameters (TS/Python) or validate in function body (JS)

**Return Values:**
- Return tuples `[data, error]` OR throw errors (not both)
- Return `null` for "not found", `[]` for empty collections
- Prefer explicit return types in TypeScript/Python
- Use `Promise<T>` for async functions

**Examples**:
```javascript
// ✅ Good: object destructuring
const createTimedAbortSignal = ({ externalSignal, timeoutMs }) => {
  // ...
};

// ❌ Avoid: too many positional parameters
function fetch(url, method, headers, timeout, retries) {}

// ✅ Good: clear return
export const isRetriableApiError = (error) =>
  Boolean(error?.retriable) ||
  Boolean(error?.timeout) ||
  Number(error?.status || 0) >= 500;
```

## Module Design

**Exports:**
- Named exports for utilities, functions, classes
- Default export for Vue components (single component per file)
- Re-export groupings in index.js files if needed

**Pattern** (`src/services/apiClient.js`):
```javascript
export class ApiClientError extends Error { ... }
export const isRetriableApiError = (error) => { ... }
export const apiFetch = async (...) => { ... }
export const parseApiError = async (...) => { ... }
```

**Barrel Files:**
- Use `index.js` in composables/services if grouping related exports
- Avoid circular dependencies — organize by unidirectional imports

**Vue Component Structure:**
```vue
<script setup>
// Imports (external, then @/, then local)
// Props definition
// Emits definition
// Local state (ref, computed, watch)
// Composables
// Methods
</script>

<template>
  <!-- Template markup -->
</template>

<style scoped>
/* Component-scoped styles */
</style>
```

## Constants & Enums

**Pattern:**
- Define near top of file for frequently used constants
- Group related constants together
- Use SCREAMING_SNAKE_CASE

**Examples**:
```javascript
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 2000, 5000];
const DEFAULT_API_TIMEOUT_MS = Number(
  import.meta.env.VITE_API_TIMEOUT_MS || 8000,
);
const API_TIMEOUT_CODE = "API_TIMEOUT";
const API_NETWORK_ERROR_CODE = "API_NETWORK_ERROR";

const VENUE_LIST_COLUMNS =
  "id,name,slug,category,description,status,province,district,...";
```

## Testing Nomenclature

**Test Files:**
- Unit tests: `tests/unit/apiClient.spec.js`
- System tests: `src/services/visitorIdentity.system.spec.js` (co-located)
- E2E tests: `tests/e2e/smoke.spec.ts`
- Named describe blocks match feature/module

## Validation & Data Mapping

**Data Transformation:**
- Create explicit mapper functions with JSDoc
- Handle fallbacks and legacy field names (CSV import context)
- Normalize data types consistently

**Pattern** (`src/services/shopService.js`):
```javascript
const mapShopData = (item, index) => {
  const img1 =
    item.image_urls?.[0] || item.image_url_1 || item.Image_URL1 || "";

  return {
    id: item.id || index,
    name: item.name || "",
    lat: item.location?.coordinates
      ? item.location.coordinates[1]
      : parseFloat(item.latitude || item.Latitude || 0),
    // ...
  };
};
```

---

*Convention analysis: 2026-03-03*
