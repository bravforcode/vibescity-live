#!/usr/bin/env python3
"""
Standalone test script for logging functionality
Task 3.2: Configure structured logging in backend
"""

import json
import logging
import sys
from io import StringIO

# Add app to path
sys.path.insert(0, ".")

from app.core.logging import (
    JsonFormatter,
    clear_request_context,
    get_request_id,
    get_trace_id,
    set_request_context,
    setup_logging,
)


def test_json_formatter():
    """Test JSON formatter."""
    print("Testing JSON formatter...")

    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger("test_logger")
    logger.handlers = []
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    logger.info("Test message", extra={"user_id": "123", "order_id": "456"})

    output = stream.getvalue()
    log_entry = json.loads(output.strip())

    assert log_entry["level"] == "INFO"
    assert log_entry["message"] == "Test message"
    assert log_entry["user_id"] == "123"
    assert log_entry["order_id"] == "456"
    assert log_entry["service"] == "vibecity-backend"

    print("✅ JSON formatter test passed")


def test_request_context():
    """Test request context."""
    print("Testing request context...")

    # Set context
    set_request_context(
        request_id="req-123",
        trace_id="trace-456",
        span_id="span-789",
        user_id="user-abc",
    )

    # Verify
    assert get_request_id() == "req-123"
    assert get_trace_id() == "trace-456"

    # Clear
    clear_request_context()

    # Verify cleared
    assert get_request_id() is None
    assert get_trace_id() is None

    print("✅ Request context test passed")


def test_context_in_logs():
    """Test context appears in logs."""
    print("Testing context in logs...")

    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger("test_logger_2")
    logger.handlers = []
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    # Set context
    set_request_context(
        request_id="req-999",
        trace_id="trace-888",
    )

    logger.info("Test with context")

    output = stream.getvalue()
    log_entry = json.loads(output.strip())

    assert log_entry["request_id"] == "req-999"
    assert log_entry["correlation_id"] == "req-999"
    assert log_entry["trace_id"] == "trace-888"

    # Clean up
    clear_request_context()

    print("✅ Context in logs test passed")


def test_exception_logging():
    """Test exception logging."""
    print("Testing exception logging...")

    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger("test_logger_3")
    logger.handlers = []
    logger.addHandler(handler)
    logger.setLevel(logging.ERROR)

    try:
        raise ValueError("Test error")
    except ValueError:
        logger.exception("Error occurred")

    output = stream.getvalue()
    log_entry = json.loads(output.strip())

    assert log_entry["level"] == "ERROR"
    assert log_entry["error"] is True
    assert "exc_info" in log_entry
    assert "ValueError: Test error" in log_entry["exc_info"]

    print("✅ Exception logging test passed")


def test_setup_logging():
    """Test logging setup."""
    print("Testing logging setup...")

    # Test production setup
    setup_logging("production")
    root_logger = logging.getLogger()
    assert root_logger.level == logging.INFO

    # Test development setup
    setup_logging("development")
    assert root_logger.level == logging.DEBUG

    print("✅ Logging setup test passed")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Running Logging System Tests")
    print("=" * 60)
    print()

    try:
        test_json_formatter()
        test_request_context()
        test_context_in_logs()
        test_exception_logging()
        test_setup_logging()

        print()
        print("=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print()
        print("=" * 60)
        print(f"❌ Test failed: {e}")
        print("=" * 60)
        return 1

    except Exception as e:
        print()
        print("=" * 60)
        print(f"❌ Unexpected error: {e}")
        print("=" * 60)
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
