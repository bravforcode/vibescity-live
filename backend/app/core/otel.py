from __future__ import annotations

import logging
from typing import Any

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter as GRPCSpanExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.trace.sampling import ALWAYS_OFF, ALWAYS_ON, ParentBased, TraceIdRatioBased
from opentelemetry.trace import Status, StatusCode

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
        # Use gRPC exporter for better performance
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            # HTTP endpoint
            exporter = OTLPSpanExporter(endpoint=endpoint)
        else:
            # gRPC endpoint (default)
            exporter = GRPCSpanExporter(endpoint=endpoint, insecure=settings.ENV.lower() != "production")
        provider.add_span_processor(BatchSpanProcessor(exporter))
    else:
        # Development mode: log to console
        if settings.ENV.lower() == "development":
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        logger.info("OTLP endpoint not set; tracing enabled without exporter.")
    
    trace.set_tracer_provider(provider)

    # Instrument FastAPI with detailed configuration
    FastAPIInstrumentor.instrument_app(
        app, 
        tracer_provider=provider,
        excluded_urls="/health,/health/liveness,/health/readiness,/metrics"
    )
    HTTPXClientInstrumentor().instrument()

    logging.getLogger().addFilter(TraceContextFilter())
    logger.info(f"Tracing initialized: service={settings.OTEL_SERVICE_NAME}, endpoint={endpoint}, sampling={settings.OTEL_TRACES_SAMPLER_ARG}")
    return True


def get_tracer(name: str = "app"):
    """Get a tracer instance for manual instrumentation"""
    return trace.get_tracer(name)


def add_span_attributes(attributes: dict[str, Any]) -> None:
    """Add attributes to the current span"""
    span = trace.get_current_span()
    if span and span.is_recording():
        for key, value in attributes.items():
            span.set_attribute(key, value)


def add_span_event(name: str, attributes: dict[str, Any] | None = None) -> None:
    """Add an event to the current span"""
    span = trace.get_current_span()
    if span and span.is_recording():
        span.add_event(name, attributes=attributes or {})


def set_span_error(exception: Exception) -> None:
    """Mark the current span as error"""
    span = trace.get_current_span()
    if span and span.is_recording():
        span.set_status(Status(StatusCode.ERROR, str(exception)))
        span.record_exception(exception)
