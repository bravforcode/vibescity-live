"""
Logging Examples for VibeCity Backend
Task 3.2: Configure structured logging in backend

This module demonstrates best practices for using the enhanced logging system
with correlation IDs, trace context, and structured logging.
"""

import logging
from typing import Any

from app.core.logging import get_request_id, get_trace_id, set_request_context

# Get logger for this module
logger = logging.getLogger(__name__)


# Example 1: Basic logging with automatic context
def process_order(order_id: str, user_id: str) -> dict[str, Any]:
    """
    Example of logging with automatic request context.
    The request_id and trace_id are automatically included from context.
    """
    logger.info("Processing order", extra={"order_id": order_id, "user_id": user_id})

    try:
        # Simulate order processing
        result = {"order_id": order_id, "status": "completed"}
        logger.info("Order processed successfully", extra={"order_id": order_id})
        return result

    except Exception as e:
        logger.exception(
            "Failed to process order",
            extra={"order_id": order_id, "error": str(e)},
        )
        raise


# Example 2: Logging with performance metrics
def fetch_user_data(user_id: str) -> dict[str, Any]:
    """Example of logging with performance metrics."""
    import time

    start_time = time.perf_counter()

    logger.debug("Fetching user data", extra={"user_id": user_id})

    try:
        # Simulate database query
        time.sleep(0.1)
        user_data = {"user_id": user_id, "name": "John Doe"}

        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            "User data fetched",
            extra={
                "user_id": user_id,
                "duration_ms": round(duration_ms, 2),
                "cache_hit": False,
            },
        )

        return user_data

    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.exception(
            "Failed to fetch user data",
            extra={
                "user_id": user_id,
                "duration_ms": round(duration_ms, 2),
                "error": str(e),
            },
        )
        raise


# Example 3: Logging with business metrics
def track_payment(payment_id: str, amount: float, currency: str) -> None:
    """Example of logging business events."""
    logger.info(
        "Payment processed",
        extra={
            "payment_id": payment_id,
            "amount": amount,
            "currency": currency,
            "event_type": "payment_success",
        },
    )


# Example 4: Logging with correlation across services
async def call_external_service(service_name: str, endpoint: str) -> dict[str, Any]:
    """Example of logging external service calls with correlation."""
    import httpx

    request_id = get_request_id()
    trace_id = get_trace_id()

    logger.info(
        "Calling external service",
        extra={
            "service": service_name,
            "endpoint": endpoint,
            "request_id": request_id,
            "trace_id": trace_id,
        },
    )

    try:
        async with httpx.AsyncClient() as client:
            # Pass correlation IDs to external service
            headers = {}
            if request_id:
                headers["X-Request-ID"] = request_id
            if trace_id:
                headers["X-Trace-ID"] = trace_id

            response = await client.get(endpoint, headers=headers)
            response.raise_for_status()

            logger.info(
                "External service call successful",
                extra={
                    "service": service_name,
                    "status_code": response.status_code,
                },
            )

            return response.json()

    except Exception as e:
        logger.exception(
            "External service call failed",
            extra={
                "service": service_name,
                "endpoint": endpoint,
                "error": str(e),
            },
        )
        raise


# Example 5: Structured error logging
def handle_validation_error(field: str, value: Any, error_message: str) -> None:
    """Example of structured error logging."""
    logger.warning(
        "Validation error",
        extra={
            "error_type": "validation_error",
            "field": field,
            "value": str(value),
            "error_message": error_message,
        },
    )


# Example 6: Logging with different severity levels
def demonstrate_log_levels() -> None:
    """Demonstrate different log levels."""

    # DEBUG: Detailed information for debugging
    logger.debug("Debug information", extra={"detail": "verbose details"})

    # INFO: General informational messages
    logger.info("Operation completed", extra={"operation": "data_sync"})

    # WARNING: Warning messages for potentially harmful situations
    logger.warning("Cache miss", extra={"cache_key": "user:123"})

    # ERROR: Error messages for serious problems
    logger.error("Database connection failed", extra={"retry_count": 3})

    # CRITICAL: Critical messages for very serious problems
    logger.critical("System out of memory", extra={"available_mb": 10})


# Example 7: Logging in async context
async def async_operation_with_logging(operation_id: str) -> None:
    """Example of logging in async operations."""
    logger.info("Starting async operation", extra={"operation_id": operation_id})

    try:
        # Simulate async work
        import asyncio

        await asyncio.sleep(0.1)

        logger.info("Async operation completed", extra={"operation_id": operation_id})

    except Exception as e:
        logger.exception(
            "Async operation failed",
            extra={"operation_id": operation_id, "error": str(e)},
        )
        raise


# Example 8: Logging with custom context
def operation_with_custom_context(user_id: str, session_id: str) -> None:
    """Example of setting custom context for logging."""

    # Set custom context (in addition to request context)
    set_request_context(user_id=user_id)

    logger.info(
        "User session started",
        extra={
            "session_id": session_id,
            "user_id": user_id,
        },
    )

    # All subsequent logs in this context will include user_id
    logger.info("User action performed", extra={"action": "view_profile"})


# Example 9: Logging database queries
def log_database_query(query: str, params: dict[str, Any], duration_ms: float) -> None:
    """Example of logging database queries."""
    logger.debug(
        "Database query executed",
        extra={
            "query": query,
            "params": params,
            "duration_ms": duration_ms,
            "query_type": "SELECT" if query.strip().upper().startswith("SELECT") else "WRITE",
        },
    )


# Example 10: Logging with sampling (for high-volume logs)
def log_with_sampling(event_type: str, data: dict[str, Any]) -> None:
    """Example of log sampling for high-volume events."""
    import random

    # Only log 10% of events
    if random.random() < 0.1:
        logger.debug(
            f"Sampled event: {event_type}",
            extra={
                "event_type": event_type,
                "data": data,
                "sampled": True,
            },
        )
