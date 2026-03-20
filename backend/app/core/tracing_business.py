"""Business logic tracing instrumentation"""
from __future__ import annotations

import functools
from typing import Any, Callable, TypeVar

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

tracer = trace.get_tracer("app.business")

T = TypeVar("T")


def trace_business_operation(operation_name: str, **attributes: Any):
    """
    Decorator to trace business logic operations
    
    Usage:
        @trace_business_operation("process_payment", payment_method="stripe")
        async def process_payment(order_id: int):
            # Business logic here
            pass
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> T:
            with tracer.start_as_current_span(f"business.{operation_name}") as span:
                # Add custom attributes
                for key, value in attributes.items():
                    span.set_attribute(f"business.{key}", value)
                
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
            with tracer.start_as_current_span(f"business.{operation_name}") as span:
                for key, value in attributes.items():
                    span.set_attribute(f"business.{key}", value)
                
                span.set_attribute("code.function", func.__name__)
                
                try:
                    result = func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise
        
        import inspect
        if inspect.iscoroutinefunction(func):
            return async_wrapper  # type: ignore
        else:
            return sync_wrapper  # type: ignore
    
    return decorator
