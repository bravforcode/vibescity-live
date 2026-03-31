"""
Tests for visitor auth utilities and /visitor/bootstrap endpoint.
Covers: normalize_visitor_id, issue_visitor_token, verify_visitor_token,
        get_token_payload, payload_expiry_iso, and HTTP endpoints.
"""
import time
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.visitor_auth import (
    get_token_payload,
    issue_visitor_token,
    normalize_visitor_id,
    payload_expiry_iso,
    verify_visitor_token,
)

# ─── normalize_visitor_id ─────────────────────────────────────────────────────

def test_normalize_visitor_id_valid():
    uid = str(uuid4())
    assert normalize_visitor_id(uid) == uid


def test_normalize_visitor_id_strips_whitespace():
    uid = str(uuid4())
    assert normalize_visitor_id(f"  {uid}  ") == uid


def test_normalize_visitor_id_uppercase_to_lowercase():
    uid = str(uuid4()).upper()
    result = normalize_visitor_id(uid)
    assert result == uid.lower()


def test_normalize_visitor_id_invalid_raises_400():
    with pytest.raises(HTTPException) as exc_info:
        normalize_visitor_id("not-a-uuid")
    assert exc_info.value.status_code == 400


def test_normalize_visitor_id_empty_raises_400():
    with pytest.raises(HTTPException):
        normalize_visitor_id("")


# ─── issue_visitor_token ──────────────────────────────────────────────────────

def test_issue_visitor_token_returns_token_and_payload():
    visitor_id = str(uuid4())
    token, payload = issue_visitor_token(visitor_id)
    assert isinstance(token, str)
    assert "." in token
    assert isinstance(payload, dict)


def test_issue_visitor_token_payload_has_required_fields():
    visitor_id = str(uuid4())
    _, payload = issue_visitor_token(visitor_id)
    assert "vid" in payload
    assert "iat" in payload
    assert "exp" in payload
    assert payload["vid"] == visitor_id


def test_issue_visitor_token_exp_greater_than_iat():
    visitor_id = str(uuid4())
    _, payload = issue_visitor_token(visitor_id)
    assert payload["exp"] > payload["iat"]


def test_issue_visitor_token_custom_ttl():
    visitor_id = str(uuid4())
    ttl = 3600
    _, payload = issue_visitor_token(visitor_id, ttl_seconds=ttl)
    assert payload["exp"] - payload["iat"] == ttl


def test_issue_visitor_token_minimum_ttl_60():
    visitor_id = str(uuid4())
    _, payload = issue_visitor_token(visitor_id, ttl_seconds=1)
    assert payload["exp"] - payload["iat"] == 60  # enforced minimum


# ─── verify_visitor_token ─────────────────────────────────────────────────────

def test_verify_visitor_token_valid():
    visitor_id = str(uuid4())
    token, _ = issue_visitor_token(visitor_id)
    assert verify_visitor_token(visitor_id, token) is True


def test_verify_visitor_token_wrong_visitor_id():
    visitor_id = str(uuid4())
    other_id = str(uuid4())
    token, _ = issue_visitor_token(visitor_id)
    assert verify_visitor_token(other_id, token) is False


def test_verify_visitor_token_empty_token():
    visitor_id = str(uuid4())
    assert verify_visitor_token(visitor_id, "") is False


def test_verify_visitor_token_none_token():
    visitor_id = str(uuid4())
    assert verify_visitor_token(visitor_id, None) is False


def test_verify_visitor_token_tampered_signature():
    visitor_id = str(uuid4())
    token, _ = issue_visitor_token(visitor_id)
    # Tamper: replace last char of signature
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    assert verify_visitor_token(visitor_id, tampered) is False


def test_verify_visitor_token_expired(monkeypatch):
    visitor_id = str(uuid4())
    # Issue a token that expires immediately
    token, _ = issue_visitor_token(visitor_id, ttl_seconds=60)
    # Monkeypatch time.time to simulate expiry
    future_time = int(time.time()) + 10000
    import app.core.visitor_auth as va
    monkeypatch.setattr(va.time, "time", lambda: future_time)
    assert verify_visitor_token(visitor_id, token) is False


# ─── get_token_payload ────────────────────────────────────────────────────────

def test_get_token_payload_returns_dict():
    visitor_id = str(uuid4())
    token, expected_payload = issue_visitor_token(visitor_id)
    payload = get_token_payload(token)
    assert isinstance(payload, dict)
    assert payload["vid"] == visitor_id


def test_get_token_payload_invalid_returns_none():
    assert get_token_payload("not.valid.token.at.all") is None


def test_get_token_payload_empty_returns_none():
    assert get_token_payload("") is None


def test_get_token_payload_no_dot_returns_none():
    assert get_token_payload("nodothere") is None


# ─── payload_expiry_iso ───────────────────────────────────────────────────────

def test_payload_expiry_iso_returns_iso_string():
    _, payload = issue_visitor_token(str(uuid4()))
    iso = payload_expiry_iso(payload)
    assert isinstance(iso, str)
    assert "T" in iso  # ISO 8601 format


def test_payload_expiry_iso_uses_exp_field():
    payload = {"exp": 1_700_000_000}
    iso = payload_expiry_iso(payload)
    assert "2023" in iso  # Nov 2023 timestamp


# ─── HTTP endpoints ───────────────────────────────────────────────────────────

def test_bootstrap_post_returns_token(client):
    visitor_id = str(uuid4())
    resp = client.post("/api/v1/visitor/bootstrap", json={"visitor_id": visitor_id})
    assert resp.status_code == 200
    data = resp.json()
    assert "visitor_token" in data
    assert "expires_at" in data


def test_bootstrap_post_token_is_verifiable(client):
    visitor_id = str(uuid4())
    resp = client.post("/api/v1/visitor/bootstrap", json={"visitor_id": visitor_id})
    token = resp.json()["visitor_token"]
    assert verify_visitor_token(visitor_id, token) is True


def test_bootstrap_post_invalid_visitor_id_returns_400(client):
    resp = client.post("/api/v1/visitor/bootstrap", json={"visitor_id": "not-a-uuid"})
    assert resp.status_code == 400


def test_bootstrap_get_returns_token(client):
    visitor_id = str(uuid4())
    resp = client.get(f"/api/v1/visitor/bootstrap?visitor_id={visitor_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "visitor_token" in data


def test_bootstrap_get_invalid_visitor_id_returns_400(client):
    resp = client.get("/api/v1/visitor/bootstrap?visitor_id=bad-id")
    assert resp.status_code == 400
