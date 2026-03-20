"""Database query tracing instrumentation"""
from __future__ import annotations

import functools
import logging
from typing import Any, Callable, TypeVar

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

logger = logging.getLogger("app.tracing.db")

tracer = trace.get_tracer("app.database")

T = TypeVar("T")


def trace_db_query(operation: str, table: str | None = None):
    """
    Decorator to trace database queries
    
    Usage:
        @trace_db_query("SELECT", "shops")
        async def get_shop(shop_id: int):
            return await db.shops.find_one({"id": shop_id})
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> T:
            span_name = f"db.{operation}"
            if table:
                span_name = f"{span_name}.{table}"
            
            with tracer.start_as_current_span(span_name) as span:
                span.set_attribute("db.system", "postgresql")
                span.set_attribute("db.operation", operation)
                if table:
                    span.set_attribute("db.table", table)
                
                # Add function name for debugging
                span.set_attribute("code.function", func.__name__)
                
                try:
                    result = await func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise
        
        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> T:
            span_name = f"db.{operation}"
            if table:
                span_name = f"{span_name}.{table}"
            
            with tracer.start_as_current_span(span_name) as span:
                span.set_attribute("db.system", "postgresql")
                span.set_attribute("db.operation", operation)
                if table:
                    span.set_attribute("db.table", table)
                
                span.set_attribute("code.function", func.__name__)
                
                try:
                    result = func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise
        
        # Return appropriate wrapper based on function type
        import inspect
        if inspect.iscoroutinefunction(func):
            return async_wrapper  # type: ignore
        else:
            return sync_wrapper  # type: ignore
    
    return decorator


def trace_supabase_query(operation: str, table: str):
    """
    Context manager for tracing Supabase queries
    
    Usage:
        with trace_supabase_query("SELECT", "shops"):
            result = supabase.table("shops").select("*").execute()
    """
    span_name = f"supabase.{operation}.{table}"
    span = tracer.start_span(span_name)
    span.set_attribute("db.system", "supabase")
    span.set_attribute("db.operation", operation)
    span.set_attribute("db.table", table)
    
    class SupabaseQueryContext:
        def __enter__(self):
            self.token = trace.context_api.attach(trace.set_span_in_context(span))
            return span
        
        def __exit__(self, exc_type, exc_val, exc_tb):
            if exc_val:
                span.set_status(Status(StatusCode.ERROR, str(exc_val)))
                span.record_exception(exc_val)
            else:
                span.set_status(Status(StatusCode.OK))
            span.end()
            trace.context_api.detach(self.token)
    
    return SupabaseQueryContext()


def add_db_span_attributes(
    query: str | None = None,
    params: dict[str, Any] | None = None,
    row_count: int | None = None
) -> None:
    """Add additional attributes to the current database span"""
    span = trace.get_current_span()
    if span and span.is_recording():
        if query:
            # Truncate long queries
            span.set_attribute("db.statement", query[:500])
        if params:
            # Add sanitized parameters (avoid PII)
            span.set_attribute("db.params.count", len(params))
        if row_count is not None:
            span.set_attribute("db.row_count", row_count)
