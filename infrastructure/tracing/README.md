# Distributed Tracing Infrastructure

This directory contains the infrastructure setup for distributed tracing using Jaeger and OpenTelemetry.

## Overview

The tracing infrastructure consists of:
- **Jaeger**: Distributed tracing backend for collecting, storing, and visualizing traces
- **OpenTelemetry Collector**: Receives traces from applications and forwards to Jaeger
- **Elasticsearch**: Storage backend for traces (production)
- **Badger**: Embedded storage for development/testing

## Quick Start

### Development (Docker Compose)

```bash
# Start Jaeger with Docker Compose
cd infrastructure/tracing
docker-compose -f docker-compose.jaeger.yml up -d

# Access Jaeger UI
open http://localhost:16686
```

### Production (Kubernetes)

```bash
# Deploy to Kubernetes
kubectl apply -f kubernetes/jaeger-deployment.yaml

# Check deployment status
kubectl get pods -n observability

# Access Jaeger UI (via port-forward)
kubectl port-forward -n observability svc/jaeger-ui 16686:80

# Or access via LoadBalancer (if configured)
kubectl get svc -n observability jaeger-ui
```

## Configuration

### Sampling Rates

Sampling rates are configured in `kubernetes/jaeger-deployment.yaml`:

- **Default**: 10% of traces (0.1)
- **Backend API**: 50% of traces (0.5)
- **Frontend**: 10% of traces (0.1)

Adjust these based on your traffic volume and observability needs.

### Storage

#### Development
- Uses Badger (embedded key-value store)
- Data persisted in Docker volume `jaeger-badger-data`
- Suitable for testing and development

#### Production
- Uses Elasticsearch for scalable storage
- Configured with 10Gi persistent volume
- Retention policies managed by Elasticsearch

### Retention Policy

Configure trace retention in Elasticsearch:

```bash
# Set retention to 7 days
curl -X PUT "localhost:9200/_ilm/policy/jaeger-ilm-policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {}
      },
      "delete": {
        "min_age": "7d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
'
```

## Endpoints

### Jaeger UI
- **URL**: http://localhost:16686
- **Purpose**: Visualize and search traces

### OTLP Receivers
- **gRPC**: localhost:4317
- **HTTP**: localhost:4318

### Jaeger Native Receivers
- **Thrift Compact**: localhost:6831/udp
- **Thrift Binary**: localhost:6832/udp
- **HTTP**: localhost:14268

## Monitoring

### Health Checks

```bash
# Check Jaeger health
curl http://localhost:14269/

# Check Elasticsearch health
curl http://localhost:9200/_cluster/health
```

### Metrics

Jaeger exposes Prometheus metrics on port 14269:

```bash
curl http://localhost:14269/metrics
```

## Troubleshooting

### No traces appearing

1. Check application is sending traces:
   ```bash
   # Check OTLP endpoint is reachable
   curl -v http://localhost:4318/v1/traces
   ```

2. Check Jaeger logs:
   ```bash
   # Docker
   docker logs jaeger
   
   # Kubernetes
   kubectl logs -n observability deployment/jaeger
   ```

3. Verify sampling rate isn't too low

### High memory usage

1. Reduce sampling rate
2. Decrease trace retention period
3. Scale Elasticsearch horizontally

### Elasticsearch connection issues

```bash
# Check Elasticsearch is running
kubectl get pods -n observability -l app=elasticsearch

# Check Elasticsearch logs
kubectl logs -n observability statefulset/elasticsearch
```

## Architecture

```
┌─────────────┐
│  Frontend   │
│   (Vue.js)  │
└──────┬──────┘
       │ OTLP/HTTP
       │
┌──────▼──────┐
│   Backend   │
│  (FastAPI)  │
└──────┬──────┘
       │ OTLP/gRPC
       │
┌──────▼──────────┐
│     Jaeger      │
│   Collector     │
└──────┬──────────┘
       │
┌──────▼──────────┐
│ Elasticsearch   │
│   (Storage)     │
└─────────────────┘
       │
┌──────▼──────────┐
│   Jaeger UI     │
│ (Visualization) │
└─────────────────┘
```

## Best Practices

1. **Sampling**: Start with low sampling rates (1-10%) and increase as needed
2. **Retention**: Keep traces for 7-30 days based on compliance requirements
3. **Tagging**: Add meaningful tags to spans for better filtering
4. **Context Propagation**: Ensure trace context is propagated across service boundaries
5. **Performance**: Monitor Jaeger's own resource usage

## Integration

See the following documentation for integrating with your application:
- Backend: `backend/docs/tracing.md`
- Frontend: `src/docs/tracing.md`
- Grafana Dashboards: `observability/grafana/dashboards/tracing.json`

## Resources

- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Elasticsearch Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
