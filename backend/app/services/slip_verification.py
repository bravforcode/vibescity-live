import base64
import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

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
    "สำเร็จ",
    "transfer successful",
    "payment successful",
]

AMOUNT_KEYWORDS = ["ยอดเงิน", "จำนวนเงิน", "amount", "total", "บาท", "thb"]
RECEIVER_KEYWORDS = ["ชื่อผู้รับ", "ผู้รับ", "recipient", "to"]
BANK_KEYWORDS = ["ธนาคาร", "bank"]
ACCOUNT_KEYWORDS = ["บัญชี", "account"]


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


def _parse_number(value: str) -> Optional[float]:
    try:
        return float(value.replace(",", ""))
    except Exception:
        return None


def _extract_numbers(text: str) -> List[float]:
    matches = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2}|\d+", text)
    numbers: List[float] = []
    for match in matches:
        parsed = _parse_number(match)
        if parsed is not None:
            numbers.append(parsed)
    return numbers


def _find_amount(lines: List[str]) -> Optional[float]:
    for line in lines:
        lower = line.lower()
        if any(keyword in lower for keyword in AMOUNT_KEYWORDS):
            nums = _extract_numbers(line)
            if nums:
                return nums[0]
    all_nums = _extract_numbers(" ".join(lines))
    if not all_nums:
        return None
    return max(all_nums)


def _extract_after_keyword(line: str, keywords: List[str]) -> str:
    lower = line.lower()
    for keyword in keywords:
        idx = lower.find(keyword)
        if idx >= 0:
            return line[idx + len(keyword) :].strip()
    return ""


def _find_by_keywords(lines: List[str], keywords: List[str]) -> str:
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


def _matches_any_normalized(text: str, expected_list: List[str]) -> bool:
    if not expected_list:
        return False
    text_norm = _normalize_compact(text)
    for item in expected_list:
        if _normalize_compact(item) in text_norm:
            return True
    return False


def _parse_timestamp(text: str) -> str:
    match = re.search(r"(\d{1,2}/\d{1,2}/\d{2,4})\s*(\d{1,2}:\d{2})?", text)
    return match.group(0) if match else ""


def evaluate_slip_text(
    text: str,
    expected_amount: float,
    expected_receiver_name: str,
    expected_receiver_banks: List[str],
    expected_receiver_account: str,
    expected_receiver_account_tail: int,
) -> Dict[str, Any]:
    lines = [line.strip() for line in (text or "").split("\n") if line.strip()]
    normalized_text = _normalize_text(" ".join(lines))
    normalized_compact = _normalize_compact(normalized_text)

    success_found = any(_normalize_compact(phrase) in normalized_compact for phrase in SUCCESS_PHRASES)
    amount = _find_amount(lines)
    amount_match = amount is not None and abs(amount - expected_amount) < 0.01

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

    score = 0.0
    score += 0.2 if signals["success_phrase"] else 0.0
    score += 0.4 if signals["amount_match"] else 0.0
    score += 0.2 if signals["receiver_name_match"] else 0.0
    score += 0.1 if signals["receiver_bank_match"] else 0.0
    score += 0.1 if signals["receiver_account_match"] else 0.0

    status = "pending_review"
    reason = "low_confidence"
    if not signals["amount_found"]:
        reason = "amount_missing"
    elif not signals["amount_match"]:
        status = "rejected"
        reason = "amount_mismatch"
    elif score >= 0.75:
        status = "verified"
        reason = "verified"

    return {
        "status": status,
        "reason": reason,
        "score": round(score, 2),
        "amount": amount,
        "timestamp": timestamp,
        "receiver": {"name": receiver_name, "bank": receiver_bank, "account": account_line},
        "signals": signals,
        "normalizedText": normalized_text,
    }


def _decode_service_account(raw: str) -> Optional[Dict[str, Any]]:
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
    chunks: List[bytes] = []
    for chunk in resp.iter_content(chunk_size=1024 * 64):
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            raise RuntimeError("Slip image exceeds size limit")
        chunks.append(chunk)

    return b"".join(chunks)


def detect_text_from_image(image_bytes: bytes) -> Dict[str, Any]:
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
    data: Dict[str, Any]
    score: float
    signals: Dict[str, Any]
    image_hash: str
    text_hash: str
    ocr_text: str
    raw: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


def verify_slip_with_gcv(slip_url: str, amount: float) -> SlipVerification:
    image_bytes = fetch_slip_bytes(slip_url, settings.GCV_OCR_MAX_BYTES)
    image_hash = sha256_hex(image_bytes)
    result = detect_text_from_image(image_bytes)
    text = result.get("text", "")

    expected_banks = [
        item.strip().lower()
        for item in (settings.SLIP_EXPECT_RECEIVER_BANKS or "").split(",")
        if item.strip()
    ]

    evaluation = evaluate_slip_text(
        text=text,
        expected_amount=amount,
        expected_receiver_name=settings.SLIP_EXPECT_RECEIVER_NAME,
        expected_receiver_banks=expected_banks,
        expected_receiver_account=settings.SLIP_EXPECT_RECEIVER_ACCOUNT,
        expected_receiver_account_tail=settings.SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL,
    )

    text_hash = sha256_hex_string(evaluation["normalizedText"])

    return SlipVerification(
        status=evaluation["status"],
        reason=evaluation["reason"],
        provider="gcv",
        score=evaluation["score"],
        signals=evaluation["signals"],
        data={
            "amount": evaluation.get("amount"),
            "transRef": "",
            "transDate": evaluation.get("timestamp"),
            "receiver": evaluation.get("receiver"),
            "sender": {},
        },
        raw=result.get("raw"),
        ocr_text=text,
        image_hash=image_hash,
        text_hash=text_hash,
    )
