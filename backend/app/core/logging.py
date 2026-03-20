import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

# Context variables for correlation IDs and trace context (Task 3.2)
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
trace_id_var: ContextVar[str | None] = ContextVar("trace_id", default=None)
span_id_var: ContextVar[str | None] = ContextVar("span_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)


class JsonFormatter(logging.Formatter):
    """
    Enhanced JSON formatter with correlation IDs and trace context.
    Task 3.2: Configure structured logging in backend
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": "vibecity-backend",
        }

        # Add correlation ID (Task 3.2)
        request_id = request_id_var.get()
        if request_id:
            payload["request_id"] = request_id
            payload["correlation_id"] = request_id  # Alias for compatibility

        # Add trace context for distributed tracing (Task 3.2)
        trace_id = trace_id_var.get()
        if trace_id:
            payload["trace_id"] = trace_id

        span_id = span_id_var.get()
        if span_id:
            payload["span_id"] = span_id

        # Add user context
        user_id = user_id_var.get()
        if user_id:
            payload["user_id"] = user_id

        # Attach extra fields (request_id, path, etc.)
        for key, value in record.__dict__.items():
            if key.startswith("_"):
                continue
            if key in (
                "name",
                "msg",
                "args",
                "levelname",
                "levelno",
                "pathname",
                "filename",
                "module",
                "exc_info",
                "exc_text",
                "stack_info",
                "lineno",
                "funcName",
                "created",
                "msecs",
                "relativeCreated",
                "thread",
                "threadName",
                "processName",
                "process",
            ):
                continue
            payload[key] = value

        # Add exception info if present
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
            payload["error"] = True

        # Add source location for debugging
        if record.pathname:
            payload["source"] = {
                "file": record.filename,
                "line": record.lineno,
                "function": record.funcName,
            }

        return json.dumps(payload, ensure_ascii=False)


def setup_logging(env: str = "development") -> None:
    """
    Set up logging configuration with JSON formatting for production.
    Enhanced for Task 3.2: Configure structured logging in backend
    """
    level = logging.INFO if env.lower() == "production" else logging.DEBUG

    handler = logging.StreamHandler(sys.stdout)
    if env.lower() == "production":
        handler.setFormatter(JsonFormatter())
    else:
        # Development: human-readable format with correlation ID
        handler.setFormatter(
            logging.Formatter(
                "%(levelname)s [%(name)s] [req:%(request_id)s] %(message)s",
                defaults={"request_id": "N/A"},
            )
        )

    root = logging.getLogger()
    root.handlers = []
    root.setLevel(level)
    root.addHandler(handler)


def set_request_context(
    request_id: str | None = None,
    trace_id: str | None = None,
    span_id: str | None = None,
    user_id: str | None = None,
) -> None:
    """
    Set request context for correlation IDs and trace context.
    Task 3.2: Add correlation IDs to all logs
    """
    if request_id:
        request_id_var.set(request_id)
    if trace_id:
        trace_id_var.set(trace_id)
    if span_id:
        span_id_var.set(span_id)
    if user_id:
        user_id_var.set(user_id)


def clear_request_context() -> None:
    """Clear request context after request completion."""
    request_id_var.set(None)
    trace_id_var.set(None)
    span_id_var.set(None)
    user_id_var.set(None)


def get_request_id() -> str | None:
    """Get current request ID from context."""
    return request_id_var.get()


def get_trace_id() -> str | None:
    """Get current trace ID from context."""
    return trace_id_var.get()
