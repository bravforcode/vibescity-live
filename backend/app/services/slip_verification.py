import base64
import hashlib
import json
import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from inspect import isawaitable
from typing import Any

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

from app.core.config import get_settings

settings = get_settings()

GCV_SCOPE = "https://www.googleapis.com/auth/cloud-vision"
VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"

SUCCESS_PHRASES = [
    "โอนเงินสำเร็จ",
    "โอนสำเร็จ",
    "ทำรายการสำเร็จ",
    "สำเร็จ",
    "completed",
    "transfer successful",
    "successful transfer",
    "transaction successful",
    "payment successful",
]

AMOUNT_KEYWORDS = ["ยอดเงิน", "จำนวนเงิน", "amount", "total", "บาท", "thb"]
RECEIVER_KEYWORDS = ["ชื่อผู้รับ", "ผู้รับ", "recipient", "to"]
BANK_KEYWORDS = ["ธนาคาร", "bank"]
ACCOUNT_KEYWORDS = ["บัญชี", "account"]
AMOUNT_PATTERN = re.compile(
    r"(?:฿|(?i:thb)\s*)?-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|(?:฿|(?i:thb)\s*)?-?\d+(?:\.\d+)?"
)


def _normalize_compact(value: str) -> str:
    return (
        (value or "")
        .lower()
        .replace(" ", "")
        .replace("\n", "")
        .replace("\t", "")
        .replace("\u200b", "")
        .replace("\u200c", "")
        .replace("\u200d", "")
        .replace("\ufeff", "")
    )


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _to_decimal(value: Any) -> Decimal:
    if isinstance(value, bool):
        raise TypeError("Boolean is not a valid amount")

    if isinstance(value, Decimal):
        amount = value
    elif isinstance(value, int):
        amount = Decimal(value)
    elif isinstance(value, float):
        amount = Decimal(str(value))
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            raise ValueError("Amount string is empty")
        normalized = re.sub(r"(?i)\bthb\b", "", raw)
        normalized = normalized.replace("฿", "")
        normalized = normalized.replace(",", "")
        normalized = normalized.replace(" ", "")
        normalized = re.sub(r"[^\d.\-]", "", normalized)
        if not normalized or normalized in {"-", ".", "-."}:
            raise ValueError(f"Invalid amount: {value!r}")
        try:
            amount = Decimal(normalized)
        except InvalidOperation as exc:
            raise ValueError(f"Invalid amount: {value!r}") from exc
    else:
        raise TypeError(f"Unsupported amount type: {type(value).__name__}")

    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def to_decimal(value: Any) -> Decimal:
    return _to_decimal(value)


def _extract_amount_from_line(line: str) -> Decimal | None:
    for candidate in AMOUNT_PATTERN.findall(line or ""):
        try:
            return _to_decimal(candidate)
        except Exception:
            continue
    return None


def _find_amount(lines: list[str]) -> Decimal | None:
    # Anti-fraud: only trust numbers that appear on lines with amount keywords.
    for line in lines:
        lower = line.lower()
        if not any(keyword in lower for keyword in AMOUNT_KEYWORDS):
            continue
        amount = _extract_amount_from_line(line)
        if amount is not None:
            return amount
    return None


def _extract_after_keyword(line: str, keywords: list[str]) -> str:
    lower = line.lower()
    for keyword in keywords:
        idx = lower.find(keyword)
        if idx >= 0:
            return line[idx + len(keyword) :].strip()
    return ""


def _find_by_keywords(lines: list[str], keywords: list[str]) -> str:
    for line in lines:
        candidate = _extract_after_keyword(line, keywords)
        if candidate:
            return candidate
    return ""


def _account_tail_matches(expected: str, text: str, tail_length: int) -> bool:
    if not expected:
        return False
    expected_digits = _digits_only(expected)
    text_digits = _digits_only(text)
    if not expected_digits or not text_digits:
        return False
    safe_tail = tail_length if tail_length > 0 else min(4, len(expected_digits))
    tail = expected_digits[-safe_tail:]
    return tail in text_digits


def _matches_any_normalized(text: str, expected_list: list[str]) -> bool:
    if not expected_list:
        return False
    text_norm = _normalize_compact(text)
    for item in expected_list:
        if _normalize_compact(str(item)) in text_norm:
            return True
    return False


def _parse_timestamp(text: str) -> str:
    match = re.search(r"(\d{1,2}/\d{1,2}/\d{2,4})\s*(\d{1,2}:\d{2})?", text)
    return match.group(0) if match else ""


def evaluate_slip_text(
    text: str,
    expected_amount: Any,
    expected_receiver_name: str,
    expected_receiver_banks: list[str],
    expected_receiver_account: str,
    expected_receiver_account_tail: int,
) -> dict[str, Any]:
    expected_amount_decimal = _to_decimal(expected_amount)
    lines = [line.strip() for line in (text or "").split("\n") if line.strip()]
    normalized_text = _normalize_text(" ".join(lines))
    normalized_compact = _normalize_compact(normalized_text)

    success_found = any(
        _normalize_compact(phrase) in normalized_compact for phrase in SUCCESS_PHRASES
    )
    amount = _find_amount(lines)
    amount_match = amount is not None and amount == expected_amount_decimal

    receiver_line = _find_by_keywords(lines, RECEIVER_KEYWORDS)
    receiver_name = receiver_line or ""
    receiver_name_match = (
        _normalize_compact(expected_receiver_name) in normalized_compact
        if expected_receiver_name
        else False
    )

    bank_line = _find_by_keywords(lines, BANK_KEYWORDS)
    receiver_bank = bank_line or ""
    receiver_bank_match = _matches_any_normalized(normalized_text, expected_receiver_banks)

    account_line = _find_by_keywords(lines, ACCOUNT_KEYWORDS)
    receiver_account_match = _account_tail_matches(
        expected_receiver_account,
        normalized_text,
        expected_receiver_account_tail,
    )

    timestamp = _parse_timestamp(normalized_text)

    signals = {
        "success_phrase": success_found,
        "amount_found": amount is not None,
        "amount_match": amount_match,
        "receiver_name_match": receiver_name_match,
        "receiver_bank_match": receiver_bank_match,
        "receiver_account_match": receiver_account_match,
        "timestamp_found": bool(timestamp),
    }

    status = "pending_review"
    reason = "missing_success_phrase"
    if not signals["amount_found"]:
        reason = "amount_missing"
    elif not signals["amount_match"]:
        status = "rejected"
        reason = "amount_mismatch"
    elif signals["success_phrase"]:
        status = "verified"
        reason = "verified"

    return {
        "status": status,
        "reason": reason,
        "score": 0.0,
        "amount": amount,
        "timestamp": timestamp,
        "receiver": {"name": receiver_name, "bank": receiver_bank, "account": account_line},
        "signals": signals,
        "normalizedText": normalized_text,
    }


def _decode_service_account(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    text = raw.strip()
    if not text.startswith("{"):
        try:
            text = base64.b64decode(text).decode("utf-8")
        except Exception:
            return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _get_gcv_access_token() -> str:
    service_account_info = _decode_service_account(settings.GCV_SERVICE_ACCOUNT_JSON)
    if not service_account_info:
        raise RuntimeError("Missing or invalid GCV_SERVICE_ACCOUNT_JSON")

    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=[GCV_SCOPE],
    )
    credentials.refresh(Request())
    if not credentials.token:
        raise RuntimeError("Failed to obtain GCV access token")
    return credentials.token


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_hex_string(text: str) -> str:
    return sha256_hex(text.encode("utf-8"))


def fetch_slip_bytes(url: str, max_bytes: int) -> bytes:
    resp = requests.get(url, stream=True, timeout=30)
    if resp.status_code >= 400:
        raise RuntimeError(f"Failed to fetch slip image: {resp.status_code}")

    content_length = resp.headers.get("content-length")
    if content_length and int(content_length) > max_bytes:
        raise RuntimeError("Slip image exceeds size limit")

    total = 0
    chunks: list[bytes] = []
    for chunk in resp.iter_content(chunk_size=1024 * 64):
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            raise RuntimeError("Slip image exceeds size limit")
        chunks.append(chunk)

    return b"".join(chunks)


def detect_text_from_image(image_bytes: bytes) -> dict[str, Any]:
    token = _get_gcv_access_token()
    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(image_bytes).decode("utf-8")},
                "features": [{"type": "TEXT_DETECTION"}],
            }
        ]
    }
    resp = requests.post(
        VISION_ENDPOINT,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Vision API error: {resp.status_code}")

    body = resp.json()
    annotations = (body.get("responses") or [{}])[0] or {}
    text = ""
    if annotations.get("fullTextAnnotation", {}).get("text"):
        text = annotations["fullTextAnnotation"]["text"]
    elif annotations.get("textAnnotations"):
        text = annotations["textAnnotations"][0].get("description", "")

    return {"text": text or "", "raw": annotations}


def get_feature_from_sku(sku: str) -> str:
    safe = (sku or "").lower()
    if safe.startswith("glow"):
        return "glow"
    if safe.startswith("boost"):
        return "boost"
    if safe.startswith("giant"):
        return "giant"
    return "verified"


@dataclass
class SlipVerification:
    status: str
    reason: str
    provider: str
    data: dict[str, Any]
    score: float
    signals: dict[str, Any]
    image_hash: str
    text_hash: str
    ocr_text: str
    raw: dict[str, Any] | None = None
    error: str | None = None


def _empty_signals() -> dict[str, bool]:
    return {
        "success_phrase": False,
        "amount_found": False,
        "amount_match": False,
        "receiver_name_match": False,
        "receiver_bank_match": False,
        "receiver_account_match": False,
        "timestamp_found": False,
    }


async def _resolve(value: Any) -> Any:
    if isawaitable(value):
        return await value
    return value


async def verify_slip_with_gcv(slip_url: str, amount: Any) -> SlipVerification:
    try:
        expected_amount = _to_decimal(amount)
    except Exception as exc:
        return SlipVerification(
            status="rejected",
            reason="amount_mismatch",
            provider="gcv",
            data={},
            score=0.0,
            signals=_empty_signals(),
            image_hash="",
            text_hash="",
            ocr_text="",
            error=str(exc),
        )

    try:
        image_bytes = await _resolve(fetch_slip_bytes(slip_url, settings.GCV_OCR_MAX_BYTES))
    except Exception as exc:
        return SlipVerification(
            status="rejected",
            reason="fetch_error",
            provider="gcv",
            data={},
            score=0.0,
            signals=_empty_signals(),
            image_hash="",
            text_hash="",
            ocr_text="",
            error=str(exc),
        )

    if not image_bytes:
        return SlipVerification(
            status="rejected",
            reason="invalid_image",
            provider="gcv",
            data={},
            score=0.0,
            signals=_empty_signals(),
            image_hash="",
            text_hash="",
            ocr_text="",
            error="empty_image",
        )

    image_hash = sha256_hex(image_bytes)

    try:
        result = await _resolve(detect_text_from_image(image_bytes))
    except Exception as exc:
        return SlipVerification(
            status="pending_review",
            reason="ocr_error",
            provider="gcv",
            data={},
            score=0.0,
            signals=_empty_signals(),
            image_hash=image_hash,
            text_hash="",
            ocr_text="",
            error=str(exc),
        )

    text = str((result or {}).get("text") or "")
    expected_banks = [
        item.strip().lower()
        for item in (settings.SLIP_EXPECT_RECEIVER_BANKS or "").split(",")
        if item.strip()
    ]

    evaluation = evaluate_slip_text(
        text=text,
        expected_amount=expected_amount,
        expected_receiver_name=settings.SLIP_EXPECT_RECEIVER_NAME,
        expected_receiver_banks=expected_banks,
        expected_receiver_account=settings.SLIP_EXPECT_RECEIVER_ACCOUNT,
        expected_receiver_account_tail=settings.SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL,
    )
    text_hash = sha256_hex_string(evaluation["normalizedText"])

    amount_value = evaluation.get("amount")
    if isinstance(amount_value, Decimal):
        amount_value = float(amount_value)

    return SlipVerification(
        status=evaluation["status"],
        reason=evaluation["reason"],
        provider="gcv",
        score=0.0,
        signals=evaluation["signals"],
        data={
            "amount": amount_value,
            "transRef": "",
            "transDate": evaluation.get("timestamp"),
            "receiver": evaluation.get("receiver"),
            "sender": {},
        },
        raw=(result or {}).get("raw"),
        ocr_text=text,
        image_hash=image_hash,
        text_hash=text_hash,
        error=None,
    )
