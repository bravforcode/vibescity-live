from __future__ import annotations

import logging

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import ALWAYS_OFF, ALWAYS_ON, ParentBased, TraceIdRatioBased

from app.core.config import Settings

logger = logging.getLogger("app.otel")


class TraceContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        span = trace.get_current_span()
        if span:
            ctx = span.get_span_context()
            if ctx and ctx.is_valid:
                record.trace_id = format(ctx.trace_id, "032x")
                record.span_id = format(ctx.span_id, "016x")
        return True


def _build_sampler(rate: float):
    if rate <= 0:
        return ALWAYS_OFF
    if rate >= 1:
        return ALWAYS_ON
    return ParentBased(TraceIdRatioBased(rate))


def setup_tracing(app, settings: Settings) -> bool:
    if not settings.OTEL_ENABLED and not settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        return False

    endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT
    if not endpoint and settings.ENV.lower() == "production":
        logger.warning("OTEL enabled but OTLP endpoint missing; tracing disabled.")
        return False

    resource = Resource.create(
        {
            "service.name": settings.OTEL_SERVICE_NAME,
            "service.version": settings.VERSION,
            "deployment.environment": settings.ENV,
        }
    )

    provider = TracerProvider(resource=resource, sampler=_build_sampler(settings.OTEL_TRACES_SAMPLER_ARG))
    if endpoint:
        exporter = OTLPSpanExporter(endpoint=endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
    else:
        logger.info("OTLP endpoint not set; tracing enabled without exporter.")
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    HTTPXClientInstrumentor().instrument()

    logging.getLogger().addFilter(TraceContextFilter())
    return True
