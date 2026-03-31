---
name: monitoring-observability
description: >
  Expert monitoring, observability, and alerting skill covering OpenTelemetry, Prometheus,
  Grafana, structured logging, distributed tracing, and SLO/SLA design. ALWAYS use this
  skill when the user mentions: Prometheus, Grafana, OpenTelemetry, metrics, logging,
  tracing, alerting, Loki, Jaeger, Datadog, New Relic, Sentry, uptime monitoring, SLO,
  SLA, error rate, latency tracking, dashboards, or observability. Also triggers for:
  "how do I monitor X", "set up logging for Y", "create alerts for Z", "instrument my app",
  "track performance metrics", "set up tracing", "build a dashboard for", "why is my app
  slow in production", or "what metrics should I track". Delivers complete instrumentation
  code, Prometheus configs, Grafana dashboard JSON, and alerting rules. Follows the three
  pillars: Metrics, Logs, Traces.
---

# Monitoring & Observability Skill

## The Three Pillars Framework
1. **Metrics** — What is happening (quantitative: latency, throughput, error rate, saturation)
2. **Logs** — Why it happened (detailed event records)
3. **Traces** — Where it happened (request path across services)

## The Four Golden Signals (always track these first)
1. **Latency** — How long requests take (P50, P95, P99 — never just average)
2. **Traffic** — How much demand (req/s, events/s)
3. **Errors** — Rate of failed requests
4. **Saturation** — How full the service is (CPU, memory, queue depth)

---

## OpenTelemetry: Node.js Full Instrumentation

```typescript
// src/instrumentation.ts — MUST be imported before anything else
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.SERVICE_NAME ?? 'my-service',
    [SEMRESATTRS_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? '1.0.0',
    environment: process.env.NODE_ENV ?? 'production',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://jaeger:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/metrics',
    }),
    exportIntervalMillis: 10000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-redis': { enabled: true },
    }),
  ],
})

sdk.start()
process.on('SIGTERM', () => sdk.shutdown())
```

```typescript
// src/telemetry.ts — custom spans and metrics
import { trace, metrics, context, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('my-service')
const meter = metrics.getMeter('my-service')

// Custom metrics
export const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request duration in milliseconds',
  unit: 'ms',
})

export const httpRequestTotal = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests',
})

export const activeConnections = meter.createUpDownCounter('active_connections', {
  description: 'Number of active connections',
})

// Custom span wrapper
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number>,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttributes(attributes)
    try {
      const result = await fn()
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
      span.recordException(err as Error)
      throw err
    } finally {
      span.end()
    }
  })
}

// Usage example
const user = await withSpan('user.fetch', { 'user.id': userId }, () =>
  db.user.findUnique({ where: { id: userId } })
)
```

---

## Prometheus: Metrics Endpoint (Express)

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'

export const register = new Registry()

// Collect default Node.js metrics (CPU, memory, event loop, GC)
collectDefaultMetrics({ register })

// HTTP metrics
export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
})

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
})

// Business metrics
export const activeUsers = new Gauge({
  name: 'active_users_total',
  help: 'Number of active users in last 5 minutes',
  registers: [register],
})

export const jobQueueDepth = new Gauge({
  name: 'job_queue_depth',
  help: 'Number of jobs waiting in queue',
  labelNames: ['queue_name'],
  registers: [register],
})

// Middleware
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer({ method: req.method, route: req.route?.path ?? req.path })
  res.on('finish', () => {
    end({ status_code: res.statusCode })
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path ?? req.path, status_code: res.statusCode })
  })
  next()
}

// Metrics endpoint — add to Express
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})
```

---

## Structured Logging (Pino)

```typescript
// lib/logger.ts
import pino from 'pino'
import { trace, context } from '@opentelemetry/api'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin() {
    // Auto-inject trace context into every log
    const span = trace.getActiveSpan()
    if (!span) return {}
    const ctx = span.spanContext()
    return {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // In production: output JSON. In dev: pretty print
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})

// Usage — always use structured fields, never string interpolation
logger.info({ userId, action: 'login', ip: req.ip }, 'User logged in')
logger.error({ err, orderId, userId }, 'Payment processing failed')
logger.warn({ latencyMs: 1250, endpoint: '/api/search' }, 'Slow request detected')
```

**Log levels — when to use what:**
- `error` — Requires immediate attention, something broke
- `warn` — Unexpected but handled, degraded state
- `info` — Normal significant events (login, order created, job started)
- `debug` — Detailed debugging info (disable in production)
- `trace` — Ultra-verbose (DB queries, every function call)

---

## Prometheus + Grafana: docker-compose

```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus:v2.49.0
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alerts.yml:/etc/prometheus/alerts.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'

  grafana:
    image: grafana/grafana:10.3.0
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH: /var/lib/grafana/dashboards/overview.json
    volumes:
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
      - grafana_data:/var/lib/grafana

  loki:
    image: grafana/loki:2.9.4
    ports:
      - "3100:3100"
    volumes:
      - ./monitoring/loki.yml:/etc/loki/config.yml
      - loki_data:/loki

  promtail:
    image: grafana/promtail:2.9.4
    volumes:
      - /var/log:/var/log
      - ./monitoring/promtail.yml:/etc/promtail/config.yml

  jaeger:
    image: jaegertracing/all-in-one:1.53
    ports:
      - "16686:16686"   # UI
      - "4318:4318"     # OTLP HTTP
    environment:
      COLLECTOR_OTLP_ENABLED: "true"

volumes:
  prometheus_data:
  grafana_data:
  loki_data:
```

---

## Prometheus Config & Alerting Rules

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - alerts.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'myapp'
    static_configs:
      - targets: ['app:3000']
    metrics_path: /metrics

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

```yaml
# monitoring/alerts.yml
groups:
  - name: application
    rules:
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status_code=~"5.."}[5m])
          / rate(http_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 5% for {{ $labels.route }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency above 1s on {{ $labels.route }}"

      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Pod {{ $labels.pod }} is crash looping"

      - alert: HighMemoryUsage
        expr: |
          container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Container {{ $labels.container }} memory > 85%"
```

---

## SLO Design Template

```markdown
## SLO: API Availability

**Service**: myapp API
**Owner**: Platform Team

### SLIs (What we measure)
- **Availability**: % of requests returning non-5xx
- **Latency**: % of requests completing in < 500ms

### SLOs (Targets)
| SLI | Target | Window |
|-----|--------|--------|
| Availability | 99.9% | 30 days rolling |
| Latency P95 | 99% of requests < 500ms | 7 days rolling |

### Error Budget
- 99.9% availability = **43.2 min/month** allowed downtime
- If error budget < 20%: freeze non-critical deployments
- If error budget < 0%: incident review required

### Prometheus SLO Queries
```promql
# Availability SLI
sum(rate(http_requests_total{status_code!~"5.."}[30d]))
/ sum(rate(http_requests_total[30d]))

# Latency SLI  
sum(rate(http_request_duration_seconds_bucket{le="0.5"}[7d]))
/ sum(rate(http_request_duration_seconds_count[7d]))
```
```

---

## Health Check Endpoints

```typescript
// Always expose /health (liveness) and /ready (readiness)
import { db } from './db'
import { redis } from './redis'

app.get('/health/live', (req, res) => {
  // Just check if process is alive
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.get('/health/ready', async (req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {}
  
  try { await db.$queryRaw`SELECT 1`; checks.database = 'ok' }
  catch { checks.database = 'error' }
  
  try { await redis.ping(); checks.redis = 'ok' }
  catch { checks.redis = 'error' }
  
  const allOk = Object.values(checks).every(v => v === 'ok')
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  })
})
```

---

## Sentry Error Tracking

```typescript
// src/instrumentation.ts
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    nodeProfilingIntegration(),
    Sentry.prismaIntegration(),
  ],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 0.1,
  beforeSend(event) {
    // Scrub sensitive data before sending
    if (event.request?.headers) {
      delete event.request.headers['authorization']
      delete event.request.headers['cookie']
    }
    return event
  },
})

// Express error handler (must be last middleware)
app.use(Sentry.Handlers.errorHandler())
```
