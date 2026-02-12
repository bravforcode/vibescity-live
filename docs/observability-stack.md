# Observability Stack (Prometheus + OTel Collector + Tempo + Grafana)

This stack runs locally via Docker Compose and provides:
- Prometheus for metrics
- OTel Collector for receiving traces
- Tempo for trace storage
- Grafana with pre-provisioned dashboards

## Quick Start

```bash
cd observability

docker compose up -d
```

Grafana UI:
- URL: http://localhost:3001
- Username: `admin`
- Password: `admin`

Prometheus UI:
- URL: http://localhost:9090

Tempo UI:
- URL: http://localhost:3200

## Backend configuration

Set your backend to export traces to the collector:

```
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=vibecity-backend
```

Ensure `/metrics` is reachable by Prometheus. By default, Prometheus expects `backend:8000`.
If your backend runs on the host machine, update `observability/prometheus.yml` to use:

```
- targets: ["host.docker.internal:8000"]
```

## Dashboards

A default dashboard `VibeCity API Overview` is provisioned automatically and includes:
- Request rate
- Error rate
- Latency p95
- In-flight requests
- Endpoint hotspots
