# Backend Distributed Tracing Guide

## Overview

The VibeCity backend uses OpenTelemetry for distributed tracing, sending traces to Jaeger for visualization and analysis.

## Configuration

### Environment Variables

```bash
# Enable tracing
OTEL_ENABLED=true

# OTLP endpoint (Jaeger collector)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces  # HTTP
# or
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317  # gRPC (recommended)

# Service name
OTEL_SERVICE_NAME=vibecity-api

# Sampling rate (0.0 to 1.0)
OTEL_TRACES_SAMPLER_ARG=0.1  # 10% of traces
```

### Development Setup

```bash
# Start Jaeger
cd infrastructure/tracing
docker-compose -f docker-compose.jaeger.yml up -d

# Set environment variables
export OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_SERVICE_NAME=vibecity-api-dev
export OTEL_TRACES_SAMPLER_ARG=1.0  # 100% for development

# Run backend
cd backend
python -m uvicorn app.main:app --reload
```

## Usage

### Automatic Instrumentation

FastAPI endpoints are automatically instrumented:

```python
@app.get("/api/v1/shops/{shop_id}")
async def get_shop(shop_id: int):
    # Automatically traced
    return await shop_service.get_shop(shop_id)
```

### Database Query Tracing

Use the `@trace_db_query` decorator:

```python
from app.core.tracing_db import trace_db_query

@trace_db_query("SELECT", "shops")
async def get_shop_from_db(shop_id: int):
    return await db.shops.find_one({"id": shop_id})
```

For Supabase queries:

```python
from app.core.tracing_db import trace_supabase_query

with trace_supabase_query("SELECT", "shops"):
    result = supabase.table("shops").select("*").eq("id", shop_id).execute()
```

### Business Logic Tracing

Use the `@trace_business_operation` decorator:

```python
from app.core.tracing_business import trace_business_operation

@trace_business_operation("process_payment", payment_method="stripe")
async def process_payment(order_id: int, amount: float):
    # Business logic here
    pass
```

### Manual Span Creation

```python
from app.core.otel import get_tracer

tracer = get_tracer("my-service")

with tracer.start_as_current_span("custom-operation") as span:
    span.set_attribute("custom.attribute", "value")
    # Your code here
```

### Adding Span Attributes

```python
from app.core.otel import add_span_attributes

add_span_attributes({
    "user.id": user_id,
    "shop.id": shop_id,
    "request.size": len(data)
})
```

### Adding Span Events

```python
from app.core.otel import add_span_event

add_span_event("cache_hit", {"cache.key": cache_key})
```

### Error Handling

```python
from app.core.otel import set_span_error

try:
    result = await risky_operation()
except Exception as e:
    set_span_error(e)
    raise
```

## Best Practices

1. **Use Descriptive Span Names**: `db.SELECT.shops` instead of `query`
2. **Add Meaningful Attributes**: Include IDs, counts, and relevant metadata
3. **Avoid PII**: Don't include sensitive data in spans
4. **Keep Spans Short**: Break long operations into multiple spans
5. **Use Sampling**: Don't trace 100% in production

## Viewing Traces

1. Open Jaeger UI: http://localhost:16686
2. Select service: `vibecity-api`
3. Search for traces by:
   - Operation name
   - Tags (e.g., `http.status_code=500`)
   - Duration
   - Time range

## Troubleshooting

### No traces appearing

1. Check OTEL is enabled:
   ```python
   from app.core.config import get_settings
   settings = get_settings()
   print(f"OTEL_ENABLED: {settings.OTEL_ENABLED}")
   print(f"OTEL_ENDPOINT: {settings.OTEL_EXPORTER_OTLP_ENDPOINT}")
   ```

2. Check Jaeger is running:
   ```bash
   curl http://localhost:16686/api/services
   ```

3. Check sampling rate isn't 0

### High overhead

1. Reduce sampling rate
2. Disable tracing for health check endpoints (already excluded)
3. Use batch span processor (already configured)

## Examples

See `backend/examples/tracing_examples.py` for complete examples.
