# Migration Guide

## Migrating to Phase 1

This guide helps you integrate Phase 1 features into your existing VibeCity installation.

## Prerequisites

- Node.js 18+
- Bun or npm/yarn
- Vue 3.5+
- Existing VibeCity installation

## Step-by-Step Migration

### 1. Update Dependencies

No new dependencies required! Phase 1 uses existing packages:
- `dompurify` (already installed)
- `@sentry/vue` (already installed)
- Vue 3 built-in features

### 2. Add Phase 1 Files

All Phase 1 files are already in place:
```
src/utils/performance/
src/utils/security/
src/utils/analytics/
src/utils/errorHandling/
src/utils/monitoring/
src/utils/pwa/
src/plugins/
```

### 3. Update main.js

**Before:**
```javascript
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);
app.mount('#app');
```

**After:**
```javascript
import { createApp } from 'vue';
import App from './App.vue';
import MasterIntegration from '@/plugins/masterIntegration';

const app = createApp(App);

// Add Phase 1 features
app.use(MasterIntegration, {
  phase1: {
    enablePerformanceMonitoring: true,
    enableAnalytics: true,
    enableErrorHandling: true,
    enableHealthChecks: true,
    enableServiceWorker: true,
  },
});

app.mount('#app');
```

### 4. Configure Environment Variables

Add to `.env`:
```env
VITE_ENABLE_PERFORMANCE_MONITORING=true
VITE_ENABLE_ANALYTICS=true
VITE_GA_ID=your-ga-id
VITE_CLARITY_ID=your-clarity-id
VITE_SENTRY_DSN=your-sentry-dsn
```

### 5. Update Components (Optional)

Add error boundaries to critical components:

```vue
<template>
  <ErrorBoundary>
    <YourComponent />
  </ErrorBoundary>
</template>
```

Add lazy loading to images:

```vue
<template>
  <img
    v-lazy-image
    data-src="/path/to/image.jpg"
    alt="Description"
  />
</template>
```

### 6. Test Migration

```bash
# Run tests
bun test

# Run validation
python .agent/scripts/checklist.py .

# Build
bun run build

# Preview
bun run preview
```

## Gradual Adoption

You can enable features gradually:

### Week 1: Monitoring Only
```javascript
app.use(MasterIntegration, {
  phase1: {
    enablePerformanceMonitoring: true,
    enableHealthChecks: true,
  },
});
```

### Week 2: Add Analytics
```javascript
app.use(MasterIntegration, {
  phase1: {
    enablePerformanceMonitoring: true,
    enableHealthChecks: true,
    enableAnalytics: true,
  },
});
```

### Week 3: Full Features
```javascript
app.use(MasterIntegration, {
  phase1: {
    enablePerformanceMonitoring: true,
    enableAnalytics: true,
    enableErrorHandling: true,
    enableHealthChecks: true,
    enableServiceWorker: true,
  },
});
```

## Rollback Plan

If issues occur, disable Phase 1:

```javascript
// Comment out or remove
// app.use(MasterIntegration, { ... });
```

Or disable specific features:

```javascript
app.use(MasterIntegration, {
  phase1: {
    enablePerformanceMonitoring: false, // Disable this
    enableAnalytics: true,
    // ... other features
  },
});
```

## Breaking Changes

None! Phase 1 is fully backward compatible.

## Support

- Documentation: `docs/phase1/`
- Troubleshooting: `docs/phase1/TROUBLESHOOTING.md`
- API Reference: `docs/phase1/API_REFERENCE.md`

