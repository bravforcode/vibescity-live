"""
Tests for enhanced logging system
Task 3.2: Configure structured logging in backend
"""

import json
import logging
from io import StringIO

import pytest

from app.core.logging import (
    JsonFormatter,
    clear_request_context,
    get_request_id,
    get_trace_id,
    set_request_context,
    setup_logging,
)


@pytest.fixture
def log_capture():
    """Fixture to capture log output."""
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger("test_logger")
    logger.handlers = []
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)

    yield logger, stream

    logger.handlers = []


def test_json_formatter_basic(log_capture):
    """Test basic JSON formatting."""
    logger, stream = log_capture

    logger.info("Test message")

    output = stream.getvalue()
    log_entry = json.loads(output.strip())

    assert log_entry["level"] == "INFO"
    assert log_entry["message"] == "Test message"
    assert log_entry["logger"] == "test_logger"
    assert log_entry["service"] == "vibecity-backend"
    assert "timestamp" in log_entry


def test_json_formatter_with_extra_fields(log_capture):
    """Test JSON formatting with extra fields."""
    logger, stream = log_capture

    logger.info("Test message", extra={"user_id": "123", "order_id": "456"})

    output = stream.getvalue()
    log_entry = json.loads(output.strip())

    assert log_entry["user_id"] == "123"
    assert log_entry["order_id"] == "456"


def test_request_context():
    """Test request context management."""
    # Set context
    set_request_context(
        request_id="req-123",
        trace_id="trace-456",
        span_id="span-789",
        user_id="user-abc",
    )

    # Verify context
    assert get_request_id() == "req-123"
    assert get_trace_id() == "trace-456"

    # Clear context
    clear_request_context()

    # Verify cleared
    assert get_request_id() is None
    assert get_trace_id() is None


def test_json_formatter_with_request_context(log_capture):
    """Test JSON formatting with request context."""
    logger, stream = log_capture

    # Set request context
    set_request_context(
        request_id="req-123",
        trace_id="trace-456",
        span_id="span-789",
    )

    logger.info("Test message")

    output = stream.getvalue()
    log_entry = json.loads(output.strip())

    assert log_entry["request_id"] == "req-123"
    assert log_entry["correlation_id"] == "req-123"
    assert log_entry["trace_id"] == "trace-456"
    assert log_entry["span_id"] == "span-789"

    # Clean up
    clear_request_context()


def test_json_formatter_with_exception(log_capture):
    """Test JSON formatting with exception."""
    logger, stream = log_capture

    try:
        raise ValueError("Test error")
    except ValueError:
        logger.exception("Error occurred")

    output = stream.getvalue()
    log_entry = json.loads(output.strip())

    assert log_entry["level"] == "ERROR"
    assert log_entry["message"] == "Error occurred"
    assert log_entry["error"] is True
    assert "exc_info" in log_entry
    assert "ValueError: Test error" in log_entry["exc_info"]


def test_json_formatter_with_source_location(log_capture):
    """Test JSON formatting includes source location."""
    logger, stream = log_capture

    logger.info("Test message")

    output = stream.getvalue()
    log_entry = json.loads(output.strip())

    assert "source" in log_entry
    assert "file" in log_entry["source"]
    assert "line" in log_entry["source"]
    assert "function" in log_entry["source"]


def test_setup_logging_production():
    """Test logging setup for production."""
    setup_logging("production")

    root_logger = logging.getLogger()
    assert root_logger.level == logging.INFO
    assert len(root_logger.handlers) > 0

    handler = root_logger.handlers[0]
    assert isinstance(handler.formatter, JsonFormatter)


def test_setup_logging_development():
    """Test logging setup for development."""
    setup_logging("development")

    root_logger = logging.getLogger()
    assert root_logger.level == logging.DEBUG


def test_context_isolation():
    """Test that context is isolated between requests."""
    # Set context for request 1
    set_request_context(request_id="req-1")
    assert get_request_id() == "req-1"

    # Clear and set context for request 2
    clear_request_context()
    set_request_context(request_id="req-2")
    assert get_request_id() == "req-2"

    # Clean up
    clear_request_context()


def test_partial_context():
    """Test setting partial context."""
    # Set only request_id
    set_request_context(request_id="req-123")
    assert get_request_id() == "req-123"
    assert get_trace_id() is None

    # Add trace_id
    set_request_context(trace_id="trace-456")
    assert get_request_id() == "req-123"
    assert get_trace_id() == "trace-456"

    # Clean up
    clear_request_context()
