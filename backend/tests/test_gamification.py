"""
Tests for gamification module pure utilities.
Covers: _extract_ip, _hash_ip helper functions.

NOTE: The /gamification/* HTTP routes are not registered in main.py yet
(router exists but is not mounted). HTTP route tests will be added once
the router is wired up.
"""
from app.api.routers.gamification import _extract_ip, _hash_ip

# ─── _extract_ip ──────────────────────────────────────────────────────────────

class FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


def test_extract_ip_from_x_forwarded_for():
    req = FakeRequest({"x-forwarded-for": "1.2.3.4, 5.6.7.8"})
    assert _extract_ip(req) == "1.2.3.4"


def test_extract_ip_takes_first_of_multiple():
    req = FakeRequest({"x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3"})
    assert _extract_ip(req) == "10.0.0.1"


def test_extract_ip_from_x_real_ip():
    req = FakeRequest({"x-real-ip": "10.0.0.1"})
    assert _extract_ip(req) == "10.0.0.1"


def test_extract_ip_prefers_x_forwarded_for_over_x_real_ip():
    req = FakeRequest({"x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9"})
    assert _extract_ip(req) == "1.2.3.4"


def test_extract_ip_empty_when_no_headers():
    req = FakeRequest()
    assert _extract_ip(req) == ""


def test_extract_ip_strips_whitespace():
    req = FakeRequest({"x-forwarded-for": "  203.0.113.5  "})
    assert _extract_ip(req) == "203.0.113.5"


def test_extract_ip_empty_forwarded_falls_back_to_real_ip():
    req = FakeRequest({"x-forwarded-for": "", "x-real-ip": "5.6.7.8"})
    assert _extract_ip(req) == "5.6.7.8"


# ─── _hash_ip ─────────────────────────────────────────────────────────────────

def test_hash_ip_returns_64_char_hex():
    result = _hash_ip("1.2.3.4")
    assert len(result) == 64
    assert all(c in "0123456789abcdef" for c in result)


def test_hash_ip_deterministic():
    assert _hash_ip("192.168.1.1") == _hash_ip("192.168.1.1")


def test_hash_ip_different_inputs_produce_different_hashes():
    assert _hash_ip("1.1.1.1") != _hash_ip("8.8.8.8")


def test_hash_ip_empty_string_returns_empty():
    assert _hash_ip("") == ""


def test_hash_ip_unicode_input():
    # Malformed IP — should still hash without crashing
    result = _hash_ip("::1")
    assert len(result) == 64


# ─── Integration: extract + hash pipeline ────────────────────────────────────

def test_extract_then_hash_pipeline():
    req = FakeRequest({"x-forwarded-for": "203.0.113.10"})
    ip = _extract_ip(req)
    h = _hash_ip(ip)
    assert ip == "203.0.113.10"
    assert len(h) == 64


def test_empty_ip_hash_is_empty():
    req = FakeRequest()
    ip = _extract_ip(req)
    h = _hash_ip(ip)
    assert h == ""
