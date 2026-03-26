---
name: performance-profiling
description: >
  Expert performance analysis and optimization skill for Node.js, databases, and web frontends.
  ALWAYS use this skill when the user asks about: slow performance, high latency, memory leaks,
  CPU spikes, load testing, k6, profiling, Core Web Vitals, Lighthouse, bundle size, slow
  queries, performance optimization, throughput benchmarking, or "why is X slow". Also triggers
  for: "my app is slow", "optimize this code", "memory keeps growing", "reduce bundle size",
  "improve TTFB", "load test my API", "profile my Node app", "CPU is high", "find the bottleneck",
  or any performance-related question. Delivers profiling commands, load test scripts, concrete
  optimization code, and measurable before/after comparisons. Always starts with measurement
  before suggesting fixes — never optimize blindly.
---

# Performance Profiling Skill

## Golden Rule: Measure First, Optimize Second
**Never guess the bottleneck.** Profile first. The slowest thing is almost never where you expect.

## Performance Audit Flow
1. **Baseline**: Measure current performance (what's slow, how slow?)
2. **Profile**: Find the actual bottleneck (CPU? Memory? I/O? Network?)
3. **Optimize**: Fix the root cause
4. **Measure**: Verify the improvement with same test
5. **Monitor**: Ensure it stays fast in production

---

## Load Testing with k6

```javascript
// tests/load/baseline.js
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

// Custom metrics
const errorRate = new Rate('errors')
const successfulLogins = new Counter('successful_logins')
const apiLatency = new Trend('api_latency', true)

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // warm up
    { duration: '1m', target: 50 },    // ramp up to 50 VUs
    { duration: '3m', target: 50 },    // hold steady
    { duration: '1m', target: 100 },   // spike
    { duration: '1m', target: 0 },     // cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95th < 500ms
    errors: ['rate<0.01'],                             // < 1% error rate
    http_req_failed: ['rate<0.01'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

export default function () {
  // Test user list endpoint
  const listRes = http.get(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
    tags: { endpoint: 'list-users' },
  })
  
  check(listRes, {
    'status 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has data array': (r) => JSON.parse(r.body).data !== undefined,
  })
  
  errorRate.add(listRes.status !== 200)
  apiLatency.add(listRes.timings.duration)
  
  sleep(1)
}

export function handleSummary(data) {
  return {
    'results/summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  }
}
```

```bash
# Run load test
k6 run --env BASE_URL=https://api.myapp.com --env TEST_TOKEN=xxx tests/load/baseline.js

# Output to InfluxDB + Grafana
k6 run --out influxdb=http://localhost:8086/k6 tests/load/baseline.js

# Quick smoke test (1 VU, 30s)
k6 run --vus 1 --duration 30s tests/load/baseline.js
```

---

## Node.js Profiling

### CPU Profile (find hot functions)
```bash
# Method 1: Node.js built-in profiler
node --prof server.js
# Run your load test...
node --prof-process isolate-*.log > profile.txt
cat profile.txt | head -100

# Method 2: clinic.js (best for production-like analysis)
npm install -g clinic
clinic doctor -- node server.js
clinic flame -- node server.js    # flame graph
clinic bubbleprof -- node server.js  # async bottlenecks

# Method 3: Chrome DevTools
node --inspect server.js
# Open chrome://inspect → profiler tab
```

### Memory Leak Detection
```bash
# Heap snapshot diff
node --inspect server.js

# clinic.js heap
clinic heapprofiler -- node server.js
```

```typescript
// Runtime memory monitoring
import v8 from 'v8'
import process from 'process'

export function getMemoryStats() {
  const mem = process.memoryUsage()
  const heap = v8.getHeapStatistics()
  
  return {
    rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,           // total process memory
    heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`, // JS heap used
    heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
    external: `${(mem.external / 1024 / 1024).toFixed(1)} MB`,  // C++ objects
    heapUtilization: `${((heap.used_heap_size / heap.heap_size_limit) * 100).toFixed(1)}%`,
  }
}

// Log memory every 30s — watch for steady growth (leak indicator)
setInterval(() => {
  const stats = getMemoryStats()
  if (parseFloat(stats.heapUtilization) > 80) {
    logger.warn({ ...stats }, 'High memory utilization')
  }
}, 30_000)
```

### Common Memory Leaks and Fixes
```typescript
// ❌ Leak: growing Set/Map that's never cleared
const cache = new Map()
app.get('/user/:id', async (req, res) => {
  cache.set(req.params.id, await fetchUser(req.params.id))  // never evicted!
})

// ✅ Fix: use LRU cache with max size
import LRU from 'lru-cache'
const cache = new LRU<string, User>({ max: 1000, ttl: 60_000 })

// ❌ Leak: event listener accumulation
function setupJob() {
  emitter.on('data', processData)   // adds listener every call
}

// ✅ Fix: use once, or remove listener
function setupJob() {
  emitter.once('data', processData)
  // or
  const handler = (data) => processData(data)
  emitter.on('data', handler)
  return () => emitter.off('data', handler)  // return cleanup
}

// ❌ Leak: closure holding large object
function processRequest(req) {
  const bigObject = loadAllData()    // 100MB
  return function handler() {
    return bigObject.find(x => x.id === req.id)  // bigObject kept alive
  }
}

// ✅ Fix: extract only what's needed
function processRequest(req) {
  const allData = loadAllData()
  const item = allData.find(x => x.id === req.id)  // extract
  return () => item   // bigObject GC'd
}
```

---

## Database Query Performance

### Query Analysis (PostgreSQL)
```sql
-- Find slowest queries (requires pg_stat_statements extension)
SELECT 
  round(total_exec_time::numeric, 2) AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2) AS avg_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows,
  query
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check index usage
SELECT 
  schemaname, tablename, indexname,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;  -- low scans = possibly unused index

-- Table bloat / cache hit rate
SELECT 
  heap_blks_read,
  heap_blks_hit,
  round(heap_blks_hit::numeric / nullif(heap_blks_hit + heap_blks_read, 0) * 100, 2) AS hit_rate
FROM pg_statio_user_tables
WHERE relname = 'users';  -- aim for > 99% hit rate
```

### Prisma Query Optimization
```typescript
// ❌ Slow: fetches all fields, then filters in JS
const users = await prisma.user.findMany()
const admins = users.filter(u => u.role === 'admin')

// ✅ Filter in DB
const admins = await prisma.user.findMany({ where: { role: 'admin' } })

// ❌ Slow: N+1 — 1 query for posts + N queries for authors
const posts = await prisma.post.findMany()
for (const post of posts) {
  post.author = await prisma.user.findUnique({ where: { id: post.authorId } })
}

// ✅ Single JOIN query
const posts = await prisma.post.findMany({
  include: { author: { select: { id: true, name: true } } }
})

// ❌ Over-fetching: loads entire user for each post
const posts = await prisma.post.findMany({ include: { author: true } })

// ✅ Select only needed fields
const posts = await prisma.post.findMany({
  select: {
    id: true, title: true, createdAt: true,
    author: { select: { name: true } },
  }
})
```

---

## Frontend Performance

### Core Web Vitals Targets
| Metric | Good | Needs Work | Poor |
|--------|------|------------|------|
| LCP (largest content paint) | < 2.5s | 2.5–4s | > 4s |
| FID/INP (interaction delay) | < 100ms | 100–300ms | > 300ms |
| CLS (layout shift) | < 0.1 | 0.1–0.25 | > 0.25 |
| TTFB (time to first byte) | < 800ms | 800ms–1.8s | > 1.8s |

### Next.js Bundle Analysis
```bash
# Analyze bundle
npm install --save-dev @next/bundle-analyzer
ANALYZE=true npm run build

# Add to next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
module.exports = withBundleAnalyzer({ /* your config */ })
```

### Code Splitting & Lazy Loading
```typescript
// ❌ Loads entire component tree upfront
import HeavyDashboard from './HeavyDashboard'

// ✅ Lazy load heavy components
import dynamic from 'next/dynamic'

const HeavyDashboard = dynamic(() => import('./HeavyDashboard'), {
  loading: () => <Skeleton />,
  ssr: false,   // skip SSR for client-only components
})

const RichTextEditor = dynamic(() => import('./RichTextEditor'), {
  loading: () => <div>Loading editor...</div>,
  ssr: false,
})

// ✅ Lazy load on interaction
const [showChart, setShowChart] = useState(false)
const Chart = showChart ? dynamic(() => import('recharts').then(m => m.LineChart)) : null
```

### Image Optimization
```typescript
// ✅ Next.js Image (auto WebP, lazy load, size optimization)
import Image from 'next/image'

<Image
  src="/hero.jpg"
  alt="Hero image"
  width={1200}
  height={600}
  priority   // LCP image: add priority
  placeholder="blur"
  blurDataURL={blurDataUrl}
  sizes="(max-width: 768px) 100vw, 50vw"
/>

// ✅ Preload critical images in <head>
<link rel="preload" as="image" href="/hero.jpg" fetchpriority="high" />
```

---

## Caching Strategy

```typescript
// Redis caching layer
import { redis } from './redis'

export async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)
  
  const result = await fn()
  await redis.setex(key, ttlSeconds, JSON.stringify(result))
  return result
}

// Usage
const users = await cachedQuery(
  'users:list:admin',
  300,  // 5 minutes
  () => prisma.user.findMany({ where: { role: 'admin' } })
)

// Cache invalidation
export async function invalidateUserCache(userId: string) {
  const keys = await redis.keys(`user:${userId}:*`)
  if (keys.length) await redis.del(...keys)
}
```

### HTTP Caching Headers
```typescript
// Static assets — cache forever (use content hash in filename)
app.use('/static', express.static('public', {
  maxAge: '1y',
  immutable: true,   // tells browser never re-validate
}))

// API responses — conditional caching
app.get('/api/products', async (req, res) => {
  const products = await getProducts()
  const etag = createHash('md5').update(JSON.stringify(products)).digest('hex')
  
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end()   // not modified — save bandwidth
  }
  
  res.set({
    'ETag': etag,
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
  }).json(products)
})
```

---

## Performance Benchmarking Script

```bash
#!/bin/bash
# scripts/benchmark.sh — quick API benchmark
URL=${1:-http://localhost:3000/api/users}
DURATION=${2:-30s}
VUS=${3:-50}

echo "🔥 Benchmarking: $URL"
echo "   VUs: $VUS | Duration: $DURATION"
echo ""

# Using autocannon (npm install -g autocannon)
autocannon -c $VUS -d ${DURATION//s/} --renderStatusCodes "$URL"

# Or using wrk (macOS: brew install wrk)
# wrk -t4 -c$VUS -d$DURATION --latency "$URL"
```
