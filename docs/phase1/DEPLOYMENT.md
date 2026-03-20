# Phase 1 Deployment Guide

## Pre-Deployment Checklist

### 1. Run All Tests

```bash
bun test
```

Ensure all 114 tests pass.

### 2. Run Validation

```bash
python .agent/scripts/checklist.py .
```

All checks must pass:
- ✅ Security Scan
- ✅ Lint Check
- ✅ Schema Validation
- ✅ Test Runner
- ✅ UX Audit
- ✅ SEO Check

### 3. Build Production

```bash
bun run build
```

Expected output:
- Total: ~4.2 MB
- Gzipped: ~1.2 MB
- Build time: ~6 seconds

### 4. Test Build

```bash
bun run preview
```

Test the production build locally.

## Environment Variables

Create `.env.production`:

```env
# Analytics
VITE_GA_ID=G-XXXXXXXXXX
VITE_CLARITY_ID=xxxxxxxxxx

# Sentry
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# API
VITE_API_URL=https://api.vibecity.live

# Feature Flags
VITE_ENABLE_PERFORMANCE_MONITORING=true
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_ERROR_HANDLING=true
VITE_ENABLE_HEALTH_CHECKS=true
VITE_ENABLE_SERVICE_WORKER=true
```

## Deployment Steps

### 1. Enable Phase 1 Features

In `src/main.js`:

```javascript
import MasterIntegration from '@/plugins/masterIntegration';

app.use(MasterIntegration, {
  phase1: {
    enablePerformanceMonitoring: true,
    enableAnalytics: true,
    enableErrorHandling: true,
    enableHealthChecks: true,
    enableServiceWorker: true,
    
    // Performance options
    performanceOptions: {
      budgets: {
        fps: { min: 30, target: 60 },
        memory: { max: 100 * 1024 * 1024 },
        lcp: { max: 2500 },
        fid: { max: 100 },
        cls: { max: 0.1 },
      },
    },
    
    // Analytics options
    analyticsOptions: {
      enableGA: true,
      enableClarity: true,
      enableSentry: true,
      sampleRate: 1.0,
    },
  },
});
```

### 2. Deploy to Production

```bash
# Build
bun run build

# Deploy (example with Vercel)
vercel --prod

# Or with custom deployment
rsync -avz dist/ user@server:/var/www/vibecity/
```

### 3. Verify Deployment

Check these endpoints:
- `/` - Main app loads
- `/health` - Health check endpoint
- Service Worker registered
- Analytics tracking works
- Error reporting works

