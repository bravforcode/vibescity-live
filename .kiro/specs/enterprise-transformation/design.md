# Enterprise Transformation - Design Document

## 🏗️ Architecture Overview

### Current State (Phase 0)
```
┌─────────────────────────────────────────────────────────┐
│                    Current Architecture                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Frontend (Vercel)                                       │
│  ├── Vue 3 + Rsbuild                                    │
│  ├── MapLibre GL                                        │
│  └── Pinia State Management                             │
│                                                          │
│  Backend (Fly.io)                                        │
│  ├── FastAPI Monolith                                   │
│  ├── Redis Cache                                        │
│  └── Background Jobs                                     │
│                                                          │
│  Database (Supabase)                                     │
│  ├── PostgreSQL + PostGIS                               │
│  ├── Auth                                               │
│  └── Storage                                            │
│                                                          │
│  Monitoring (Basic)                                      │
│  ├── Sentry (Errors)                                    │
│  ├── Prometheus (Metrics)                               │
│  └── Custom Analytics                                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Target State (Phase 4)
```
┌─────────────────────────────────────────────────────────────────────┐
│                    Enterprise Architecture                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Global CDN (Cloudflare)                                            │
│  ├── Edge Caching                                                   │
│  ├── DDoS Protection                                                │
│  └── WAF                                                            │
│                                                                      │
│  Frontend (Multi-Region)                                            │
│  ├── Vercel Edge Network                                            │
│  ├── Optimized Bundles                                              │
│  ├── Service Worker (Offline)                                       │
│  └── Progressive Web App                                            │
│                                                                      │
│  API Gateway (Kong/Tyk)                                             │
│  ├── Rate Limiting                                                  │
│  ├── Authentication                                                 │
│  ├── Request Routing                                                │
│  └── API Versioning                                                 │
│                                                                      │
│  Microservices (Kubernetes)                                         │
│  ├── Map Service                                                    │
│  ├── Payment Service                                                │
│  ├── Analytics Service                                              │
│  ├── User Service                                                   │
│  └── Notification Service                                           │
│                                                                      │
│  Data Layer                                                          │
│  ├── PostgreSQL (Primary + Replicas)                                │
│  ├── Redis Cluster (Cache + Queue)                                  │
│  ├── TimescaleDB (Time-Series)                                      │
│  ├── Qdrant (Vector Search)                                         │
│  └── S3 (Object Storage)                                            │
│                                                                      │
│  Message Queue (RabbitMQ/Kafka)                                     │
│  ├── Event Streaming                                                │
│  ├── Async Processing                                               │
│  └── Service Communication                                          │
│                                                                      │
│  Observability Stack                                                 │
│  ├── Datadog (Metrics + APM)                                        │
│  ├── Loki (Logs)                                                    │
│  ├── Jaeger (Tracing)                                               │
│  ├── Grafana (Dashboards)                                           │
│  └── PagerDuty (Alerting)                                           │
│                                                                      │
│  Security Layer                                                      │
│  ├── Vault (Secrets)                                                │
│  ├── OAuth 2.0 / OIDC                                               │
│  ├── WAF Rules                                                      │
│  └── Vulnerability Scanning                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📐 Detailed Design by Category

### A. Architecture & Infrastructure

#### 1. Multi-Region CDN Strategy
**Design:**
```typescript
// Cloudflare Workers for edge caching
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    
    // Check cache first
    let response = await cache.match(cacheKey);
    
    if (!response) {
      // Fetch from origin
      response = await fetch(request);
      
      // Cache static assets
      if (response.ok && isStaticAsset(request.url)) {
        response = new Response(response.body, response);
        response.headers.set('Cache-Control', 'public, max-age=31536000');
        await cache.put(cacheKey, response.clone());
      }
    }
    
    return response;
  }
};
```

**Implementation:**
- Deploy Cloudflare Workers
- Configure cache rules
- Set up geo-routing
- Implement cache invalidation

#### 2. Database Read Replicas
**Design:**
```python
# Database router for read/write splitting
class DatabaseRouter:
    def db_for_read(self, model, **hints):
        """Route read queries to replicas"""
        return random.choice(['replica1', 'replica2', 'replica3'])
    
    def db_for_write(self, model, **hints):
        """Route write queries to primary"""
        return 'primary'
```

**Implementation:**
- Set up Supabase read replicas
- Implement connection pooling
- Configure replication lag monitoring
- Add automatic failover

#### 3. CQRS Pattern
**Design:**
```python
# Command (Write) Model
class CreateOrderCommand:
    def __init__(self, user_id: str, items: List[OrderItem]):
        self.user_id = user_id
        self.items = items
    
    async def execute(self):
        # Write to primary database
        order = await db.orders.create(...)
        # Publish event
        await event_bus.publish(OrderCreatedEvent(order))
        return order

# Query (Read) Model
class OrderQueryService:
    async def get_order(self, order_id: str):
        # Read from optimized read model
        return await cache.get(f"order:{order_id}") or \
               await read_db.orders.find_one({"id": order_id})
```

**Implementation:**
- Separate command and query handlers
- Implement event sourcing
- Set up read model projections
- Add eventual consistency handling

#### 4. API Gateway Layer
**Design:**
```yaml
# Kong Gateway Configuration
services:
  - name: map-service
    url: http://map-service:8000
    routes:
      - name: map-route
        paths:
          - /api/v1/map
    plugins:
      - name: rate-limiting
        config:
          minute: 100
          hour: 1000
      - name: jwt
        config:
          secret_is_base64: false
```

**Implementation:**
- Deploy Kong/Tyk gateway
- Configure rate limiting
- Set up authentication
- Implement request routing

#### 5. Microservices Decomposition
**Design:**
```
┌─────────────────────────────────────────────────────────┐
│                  Microservices Architecture              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Map Service                                             │
│  ├── Venue search                                       │
│  ├── Geospatial queries                                 │
│  └── Map rendering                                      │
│                                                          │
│  Payment Service                                         │
│  ├── Stripe integration                                 │
│  ├── Transaction processing                             │
│  └── Refunds                                            │
│                                                          │
│  Analytics Service                                       │
│  ├── Event ingestion                                    │
│  ├── Real-time analytics                                │
│  └── Reporting                                          │
│                                                          │
│  User Service                                            │
│  ├── Authentication                                     │
│  ├── Profile management                                 │
│  └── Preferences                                        │
│                                                          │
│  Notification Service                                    │
│  ├── Push notifications                                 │
│  ├── Email                                              │
│  └── SMS                                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**
- Extract services from monolith
- Implement service mesh
- Set up inter-service communication
- Add circuit breakers

---

### B. Database & Data Layer

#### 16. Database Partitioning
**Design:**
```sql
-- Partition analytics_logs by date
CREATE TABLE analytics_logs (
    id BIGSERIAL,
    event_type TEXT,
    user_id UUID,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE analytics_logs_2026_01 PARTITION OF analytics_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE analytics_logs_2026_02 PARTITION OF analytics_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Partition shops by province
CREATE TABLE shops (
    id BIGSERIAL,
    name TEXT,
    province TEXT,
    ...
) PARTITION BY LIST (province);

CREATE TABLE shops_bangkok PARTITION OF shops
    FOR VALUES IN ('Bangkok');

CREATE TABLE shops_chiangmai PARTITION OF shops
    FOR VALUES IN ('Chiang Mai');
```

**Implementation:**
- Create partition strategy
- Migrate existing data
- Set up automatic partition creation
- Implement partition pruning

#### 17. Materialized Views
**Design:**
```sql
-- Top shops materialized view
CREATE MATERIALIZED VIEW top_shops_by_province AS
SELECT 
    province,
    id,
    name,
    rating,
    review_count,
    ROW_NUMBER() OVER (PARTITION BY province ORDER BY rating DESC, review_count DESC) as rank
FROM shops
WHERE status = 'active'
ORDER BY province, rank;

-- Create index
CREATE INDEX idx_top_shops_province ON top_shops_by_province(province, rank);

-- Refresh strategy
CREATE OR REPLACE FUNCTION refresh_top_shops()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY top_shops_by_province;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh (hourly)
SELECT cron.schedule('refresh-top-shops', '0 * * * *', 'SELECT refresh_top_shops()');
```

**Implementation:**
- Identify expensive queries
- Create materialized views
- Set up refresh schedule
- Monitor view freshness

#### 18. Full-Text Search
**Design:**
```sql
-- Add tsvector column
ALTER TABLE shops ADD COLUMN search_vector tsvector;

-- Create index
CREATE INDEX idx_shops_search ON shops USING GIN(search_vector);

-- Update trigger
CREATE OR REPLACE FUNCTION shops_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('thai', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('thai', coalesce(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shops_search_update 
    BEFORE INSERT OR UPDATE ON shops
    FOR EACH ROW EXECUTE FUNCTION shops_search_trigger();

-- Search query
SELECT id, name, ts_rank(search_vector, query) AS rank
FROM shops, plainto_tsquery('thai', 'ร้านอาหาร') query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

**Implementation:**
- Add tsvector columns
- Create GIN indexes
- Implement search API
- Add Thai language support

---

### C. Frontend Optimization

#### 34. Virtual Scrolling
**Design:**
```vue
<template>
  <RecycleScroller
    :items="venues"
    :item-size="120"
    key-field="id"
    v-slot="{ item }"
  >
    <VenueCard :venue="item" />
  </RecycleScroller>
</template>

<script setup>
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

const venues = ref([]);
</script>
```

**Implementation:**
- Install vue-virtual-scroller
- Replace long lists
- Optimize item rendering
- Add loading states

#### 36. Bundle Size Optimization
**Design:**
```typescript
// rsbuild.config.ts
export default defineConfig({
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
      forceSplitting: {
        // Split large libraries
        maplibre: /node_modules[\\/]maplibre-gl/,
        vue: /node_modules[\\/](@?vue|vue-router|pinia)/,
        charts: /node_modules[\\/](chart\.js|vue-chartjs)/,
        icons: /node_modules[\\/]lucide-vue-next/,
      },
    },
  },
  output: {
    // Modern browsers only
    overrideBrowserslist: [
      'chrome >= 90',
      'firefox >= 88',
      'safari >= 14',
      'edge >= 90',
    ],
  },
});
```

**Implementation:**
- Analyze bundle with visualizer
- Split large chunks
- Remove unused dependencies
- Implement tree-shaking

#### 37. Code Splitting Strategy
**Design:**
```typescript
// router/index.ts
const routes = [
  {
    path: '/',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/map',
    component: () => import(
      /* webpackChunkName: "map" */
      /* webpackPrefetch: true */
      '@/views/MapView.vue'
    ),
  },
  {
    path: '/admin',
    component: () => import(
      /* webpackChunkName: "admin" */
      '@/views/AdminView.vue'
    ),
  },
];

// Component-level splitting
const HeavyChart = defineAsyncComponent({
  loader: () => import('@/components/HeavyChart.vue'),
  loadingComponent: ChartSkeleton,
  delay: 200,
  timeout: 3000,
});
```

**Implementation:**
- Split routes
- Split heavy components
- Add loading states
- Implement prefetching

---

### D. Backend Performance

#### 56. Response Compression
**Design:**
```python
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI()

# Add compression middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Or use Brotli for better compression
from starlette.middleware.base import BaseHTTPMiddleware
import brotli

class BrotliMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        
        if 'br' in request.headers.get('accept-encoding', ''):
            body = b''
            async for chunk in response.body_iterator:
                body += chunk
            
            compressed = brotli.compress(body)
            response.headers['content-encoding'] = 'br'
            response.headers['content-length'] = str(len(compressed))
            
            return Response(
                content=compressed,
                status_code=response.status_code,
                headers=dict(response.headers),
            )
        
        return response
```

**Implementation:**
- Add compression middleware
- Configure compression level
- Test compression ratio
- Monitor CPU usage

#### 59. Response Caching
**Design:**
```python
from functools import wraps
from typing import Optional
import hashlib
import json

def cache_response(ttl: int = 300):
    """Cache decorator for API endpoints"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{func.__name__}:{hashlib.md5(
                json.dumps(kwargs, sort_keys=True).encode()
            ).hexdigest()}"
            
            # Check cache
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Store in cache
            await redis.setex(
                cache_key,
                ttl,
                json.dumps(result)
            )
            
            return result
        return wrapper
    return decorator

@app.get("/api/v1/shops")
@cache_response(ttl=300)
async def get_shops(province: str):
    return await db.shops.find({"province": province})
```

**Implementation:**
- Implement caching decorator
- Set up Redis cluster
- Define cache invalidation strategy
- Monitor cache hit rate

---

### E. Security Enhancements

#### 72. Content Security Policy
**Design:**
```python
# middleware/security.py
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        
        # Content Security Policy
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://api.vibecity.live; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
        
        # Other security headers
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Strict-Transport-Security'] = (
            'max-age=31536000; includeSubDomains; preload'
        )
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = (
            'geolocation=(self), microphone=(), camera=()'
        )
        
        return response
```

**Implementation:**
- Add security middleware
- Configure CSP rules
- Test with CSP Evaluator
- Monitor CSP violations

#### 76. Rate Limiting per User
**Design:**
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"]
)

# Per-user rate limiting
async def get_user_id(request: Request):
    """Extract user ID from JWT token"""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if token:
        payload = jwt.decode(token, SECRET_KEY)
        return payload.get("sub")
    return get_remote_address(request)

user_limiter = Limiter(key_func=get_user_id)

@app.get("/api/v1/shops")
@user_limiter.limit("1000/hour")
async def get_shops():
    return await db.shops.find()
```

**Implementation:**
- Implement user-based rate limiting
- Set up Redis for rate limit storage
- Configure limits per endpoint
- Add rate limit headers

---

### F. Monitoring & Observability

#### 87. Distributed Tracing
**Design:**
```python
from opentelemetry import trace
from opentelemetry.exporter.jaeger import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Set up tracing
trace.set_tracer_provider(TracerProvider())
jaeger_exporter = JaegerExporter(
    agent_host_name="jaeger",
    agent_port=6831,
)
trace.get_tracer_provider().add_span_processor(
    BatchSpanProcessor(jaeger_exporter)
)

tracer = trace.get_tracer(__name__)

# Use in code
@app.get("/api/v1/shops/{shop_id}")
async def get_shop(shop_id: int):
    with tracer.start_as_current_span("get_shop") as span:
        span.set_attribute("shop.id", shop_id)
        
        with tracer.start_as_current_span("db_query"):
            shop = await db.shops.find_one({"id": shop_id})
        
        with tracer.start_as_current_span("cache_store"):
            await redis.set(f"shop:{shop_id}", json.dumps(shop))
        
        return shop
```

**Implementation:**
- Set up Jaeger/Zipkin
- Instrument code with spans
- Configure sampling rate
- Create trace dashboards

#### 91. Real User Monitoring
**Design:**
```typescript
// services/rumService.ts
class RUMService {
  private observer: PerformanceObserver;
  
  init() {
    // Monitor Core Web Vitals
    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeTTFB();
  }
  
  private observeLCP() {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.sendMetric({
          name: 'LCP',
          value: entry.renderTime || entry.loadTime,
          rating: this.getRating('LCP', entry.renderTime),
        });
      }
    });
    observer.observe({ entryTypes: ['largest-contentful-paint'] });
  }
  
  private sendMetric(metric: Metric) {
    // Send to analytics
    navigator.sendBeacon('/api/v1/rum', JSON.stringify(metric));
  }
}
```

**Implementation:**
- Implement RUM SDK
- Collect Core Web Vitals
- Set up analytics pipeline
- Create RUM dashboards

---

## 🔄 Migration Strategy

### Phase 1: Foundation (Parallel Development)
```
Week 1-4: Infrastructure Setup
├── Set up multi-region deployment
├── Configure monitoring stack
├── Implement security baseline
└── Database optimization planning

Week 5-8: Database Migration
├── Create read replicas
├── Implement partitioning
├── Add materialized views
└── Optimize indexes

Week 9-12: Monitoring & Security
├── Deploy observability stack
├── Implement distributed tracing
├── Add security headers
└── Set up alerting
```

### Phase 2: Performance (Incremental Rollout)
```
Week 13-16: Microservices Extraction
├── Extract map service
├── Extract payment service
├── Set up API gateway
└── Implement service mesh

Week 17-20: Caching Strategy
├── Implement Redis cluster
├── Add response caching
├── Set up CDN
└── Optimize cache invalidation

Week 21-24: API Optimization
├── Optimize database queries
├── Implement batch endpoints
├── Add compression
└── Optimize serialization
```

### Phase 3: Quality (Continuous Integration)
```
Week 25-28: Testing Framework
├── Set up E2E testing
├── Implement load testing
├── Add contract testing
└── Set up CI/CD

Week 29-32: UX Improvements
├── Implement virtual scrolling
├── Optimize bundle size
├── Add code splitting
└── Implement skeleton screens

Week 33-36: Reliability
├── Implement chaos engineering
├── Add circuit breakers
├── Set up blue-green deployment
└── Implement canary releases
```

### Phase 4: Polish (Final Optimization)
```
Week 37-40: Mobile Optimization
├── Optimize for low-end devices
├── Implement adaptive loading
├── Add touch gestures
└── Optimize network usage

Week 41-44: Final Optimizations
├── Performance tuning
├── Security audit
├── Load testing
└── Documentation

Week 45-48: Handoff & Training
├── Team training
├── Documentation review
├── Knowledge transfer
└── Post-launch support
```

---

## 📊 Success Metrics

### Technical Metrics
| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| API Latency (p95) | 500ms | 200ms | Datadog APM |
| Page Load (LCP) | 3.5s | 1.5s | Lighthouse |
| Uptime | 99.9% | 99.99% | Pingdom |
| Error Rate | 0.5% | 0.1% | Sentry |
| Test Coverage | 40% | 80% | Coverage.py |

### Business Metrics
| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Concurrent Users | 100K | 1M | Analytics |
| Conversion Rate | 2% | 2.4% | Analytics |
| Mobile Traffic | 60% | 84% | Analytics |
| Customer Satisfaction | NPS 40 | NPS 50 | Surveys |
| Cost per User | $0.10 | $0.07 | Finance |

---

**Document Version:** 1.0
**Last Updated:** 2026-03-16
**Owner:** Tech Lead
**Reviewers:** Engineering Manager, Architects
