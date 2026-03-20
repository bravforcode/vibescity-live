# Frontend Distributed Tracing Guide

## Overview

The VibeCity frontend uses OpenTelemetry for browser tracing, connecting frontend traces with backend traces for end-to-end visibility.

## Setup

### 1. Install Dependencies

```bash
npm install @opentelemetry/api \
  @opentelemetry/sdk-trace-web \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/auto-instrumentations-web \
  @opentelemetry/context-zone \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

### 2. Configure Environment Variables

```bash
# .env.local
VITE_OTEL_ENABLED=true
VITE_OTEL_ENDPOINT=http://localhost:4318/v1/traces
VITE_APP_VERSION=1.0.0
VITE_ENV=development
```

### 3. Initialize in main.js

```javascript
import { createApp } from 'vue';
import App from './App.vue';
import tracingPlugin from './plugins/tracing';

const app = createApp(App);

// Initialize tracing
app.use(tracingPlugin, {
  enabled: true,
  traceRouteChanges: true,
  traceUserClicks: false, // Enable for detailed user interaction tracking
});

app.mount('#app');
```

## Usage

### Automatic Instrumentation

The following are automatically traced:
- **Fetch API calls**: All HTTP requests
- **XMLHttpRequest**: Legacy AJAX calls
- **Page loads**: Navigation and route changes
- **Resource loading**: Scripts, stylesheets, images

### Manual Span Creation

```javascript
import { createSpan } from '@/services/tracing';

// Create a custom span
const span = createSpan('map.render', {
  'map.zoom': 12,
  'map.center': 'Bangkok',
});

// Your code here
renderMap();

// End the span
span?.end();
```

### Tracing User Interactions

```javascript
import { traceUserInteraction } from '@/services/tracing';

function handleButtonClick() {
  const span = traceUserInteraction('click', 'search-button', {
    'search.query': searchQuery,
  });
  
  performSearch();
  
  span?.end();
}
```

### Tracing Page Loads

```javascript
import { tracePageLoad } from '@/services/tracing';

// In a route guard or component
onMounted(() => {
  const span = tracePageLoad('MapView', '/map');
  span?.end();
});
```

### Tracing API Calls

```javascript
import { traceApiCall } from '@/services/tracing';

async function fetchShops() {
  const span = traceApiCall('GET', '/api/v1/shops');
  
  try {
    const response = await fetch('/api/v1/shops');
    span?.setAttribute('http.status_code', response.status);
    
    if (!response.ok) {
      span?.setStatus(SpanStatusCode.ERROR, `HTTP ${response.status}`);
    }
    
    return await response.json();
  } finally {
    span?.end();
  }
}
```

## Best Practices

1. **Sampling**: Use low sampling rates in production (1-10%)
2. **Performance**: Tracing adds minimal overhead but avoid excessive manual spans
3. **Privacy**: Never include PII in span attributes
4. **Meaningful Names**: Use descriptive span names like `map.render` not `function1`
5. **Attributes**: Add context that helps debugging (IDs, counts, states)

## Connecting Frontend and Backend Traces

Traces are automatically connected via trace context propagation in HTTP headers:
- `traceparent`: W3C Trace Context header
- `tracestate`: Additional vendor-specific context

No additional configuration needed!

## Viewing Traces

1. Open Jaeger UI: http://localhost:16686
2. Select service: `vibecity-frontend`
3. Find traces that span both frontend and backend
4. Click on a trace to see the full request flow

## Performance Impact

- **Overhead**: < 1% CPU, < 5MB memory
- **Network**: Batched exports every 5 seconds
- **Sampling**: Reduces data volume and overhead

## Troubleshooting

### No traces appearing

1. Check configuration:
   ```javascript
   console.log('OTEL_ENABLED:', import.meta.env.VITE_OTEL_ENABLED);
   console.log('OTEL_ENDPOINT:', import.meta.env.VITE_OTEL_ENDPOINT);
   ```

2. Check browser console for errors

3. Verify CORS is configured on OTLP endpoint

### Traces not connecting to backend

1. Verify backend has CORS headers for trace context:
   ```python
   allow_headers=["traceparent", "tracestate", ...]
   ```

2. Check network tab for `traceparent` header in requests

## Examples

See `src/examples/tracing-examples.vue` for complete examples.
