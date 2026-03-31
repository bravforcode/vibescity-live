# Observability

## Metrics (Prometheus)

The backend exposes a Prometheus-compatible endpoint at `/metrics` when `METRICS_ENABLED=true`.

In **production**, `/metrics` requires `METRICS_AUTH_TOKEN` and will return `401` if the token is missing.

Optional auth:
- Set `METRICS_AUTH_TOKEN` and call with `Authorization: Bearer <token>` or `X-Metrics-Token: <token>`.

Example (local):
```
METRICS_ENABLED=true
METRICS_AUTH_TOKEN=""
```

Scrape example:
```
- job_name: vibecity-backend
  static_configs:
    - targets: ["backend:8000"]
```

## Tracing (OpenTelemetry)

Tracing is enabled when:
- `OTEL_ENABLED=true`, or
- `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

Recommended env:
```
OTEL_ENABLED=true
OTEL_SERVICE_NAME="vibecity-backend"
OTEL_EXPORTER_OTLP_ENDPOINT="https://otel-collector:4318"
OTEL_TRACES_SAMPLER_ARG=0.1
```

The service sets:
- `service.name`
- `service.version`
- `deployment.environment`

## Logging Correlation

When tracing is enabled, log lines include:
- `trace_id`
- `span_id`

Use these fields to correlate API logs with traces in your APM.
