# Phase 1 Configuration Guide

## Overview

This guide covers all configuration options for Phase 1 systems.

## Performance Monitor Configuration

### Basic Configuration

```javascript
const perfMonitor = usePerformanceMonitor({
  enableFPS: true,
  enableMemory: true,
  enableNetwork: true,
  enableWebVitals: true,
  sampleRate: 1.0,
  reportInterval: 30000,
});
```

### Performance Budgets

```javascript
const perfMonitor = usePerformanceMonitor({
  budgets: {
    fps: { 
      min: 30,      // Minimum acceptable FPS
      target: 60    // Target FPS
    },
    memory: { 
      max: 100 * 1024 * 1024  // 100MB max
    },
    lcp: { 
      max: 2500     // 2.5s max LCP
    },
    fid: { 
      max: 100      // 100ms max FID
    },
    cls: { 
      max: 0.1      // 0.1 max CLS
    },
  },
});
```

### Callbacks

```javascript
const perfMonitor = usePerformanceMonitor({
  onMetric: (category, metric) => {
    console.log(`Metric recorded: ${category}`, metric);
  },
  onBudgetExceeded: (metric, actual, budget) => {
    console.warn(`Budget exceeded: ${metric}`, { actual, budget });
    // Send alert
  },
});
```

## Analytics Configuration

### Basic Setup

```javascript
const analytics = useAnalytics({
  enableGA: true,
  enableClarity: true,
  enableSentry: true,
  enableCustom: true,
  debug: false,
  sampleRate: 1.0,
});
```

### Custom Endpoint

```javascript
const analytics = useAnalytics({
  enableCustom: true,
  customEndpoint: '/api/analytics',
});
```

## Security Configuration

### Security Headers

Edit `src/utils/security/securityHeaders.js`:

```javascript
export const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://trusted-cdn.com",
    // Add your trusted sources
  ].join('; '),
  // ... other headers
};
```

### Rate Limiting

```javascript
import { RateLimiter } from '@/utils/security/inputSanitizer';

const limiter = new RateLimiter(
  100,  // maxTokens
  10    // refillRate (tokens per second)
);

if (limiter.tryConsume(1)) {
  // Allow request
} else {
  // Rate limit exceeded
}
```

