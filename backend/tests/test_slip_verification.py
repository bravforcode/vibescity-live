"""
Test suite for app.services.slip_verification

Security-critical financial validation tests.
All OCR / network calls are mocked at the boundary layer.
No credentials, no network, fully offline & deterministic.
100% branch coverage for the strict anti-fraud policy.

LOCKED DECISION TABLE:
  fetch error         -> rejected      (fetch_error)
  invalid image bytes -> rejected      (invalid_image)
  OCR error           -> pending_review (ocr_error)
  amount missing      -> pending_review (amount_missing)
  amount mismatch     -> rejected      (amount_mismatch)
  amount match, no phrase -> pending_review (missing_success_phrase)
  amount match + phrase   -> verified   (verified)
"""

from unittest.mock import MagicMock

try:
    from unittest.mock import AsyncMock
except ImportError:
    from unittest.mock import MagicMock as AsyncMock

from decimal import Decimal

import httpx as _httpx_mod
import pytest
import requests as _requests_mod

from app.services.slip_verification import (
    _to_decimal,
    evaluate_slip_text,
    get_feature_from_sku,
    verify_slip_with_gcv,
)

# ---------------------------------------------------------------------------
# Network guard: block any real HTTP or socket calls
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _block_network(monkeypatch):
    """Hard-block real network calls so tests stay offline."""
    def _deny(*a, **kw):
        raise AssertionError("Network call attempted during test — network leak!")

    # Block httpx
    monkeypatch.setattr(_httpx_mod, "get", _deny)
    monkeypatch.setattr(_httpx_mod, "post", _deny)
    monkeypatch.setattr(_httpx_mod, "AsyncClient", MagicMock(side_effect=AssertionError("AsyncClient instantiated without mock")))
    monkeypatch.setattr(_httpx_mod, "Client", MagicMock(side_effect=AssertionError("Client instantiated without mock")))

    # Block requests
    monkeypatch.setattr(_requests_mod, "get", _deny)
    monkeypatch.setattr(_requests_mod, "post", _deny)
    monkeypatch.setattr(_requests_mod, "request", _deny)


# ---------------------------------------------------------------------------
# Fixtures: mock the THREE external boundaries
# ---------------------------------------------------------------------------

MOCK_SETTINGS_DEFAULTS = {
    "GCV_OCR_MAX_BYTES": 5_242_880,
    "SLIP_EXPECT_RECEIVER_NAME": "VibeCity",
    "SLIP_EXPECT_RECEIVER_BANKS": "kbank,scb",
    "SLIP_EXPECT_RECEIVER_ACCOUNT": "1234567890",
    "SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL": 4,
    "GCV_SERVICE_ACCOUNT_JSON": "",
}


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    mock = MagicMock()
    for key, value in MOCK_SETTINGS_DEFAULTS.items():
        setattr(mock, key, value)

    # We monkeypatch the 'settings' object in the module
    monkeypatch.setattr("app.services.slip_verification.settings", mock)
    return mock


@pytest.fixture(autouse=True)
def mock_fetch(monkeypatch):
    m = AsyncMock(return_value=b"fake_image_bytes")
    monkeypatch.setattr("app.services.slip_verification.fetch_slip_bytes", m)
    return m


@pytest.fixture(autouse=True)
def mock_ocr(monkeypatch):
    m = AsyncMock(return_value={"text": "", "raw": {}})
    monkeypatch.setattr("app.services.slip_verification.detect_text_from_image", m)
    return m


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SLIP_URL = "http://example.com/slip.jpg"

EVAL_DEFAULTS = {
    "expected_receiver_name": "VibeCity",
    "expected_receiver_banks": ["kbank", "scb"],
    "expected_receiver_account": "1234567890",
    "expected_receiver_account_tail": 4,
}


def _valid_slip_text(amount: str = "500.00") -> str:
    return (
        "โอนเงินสำเร็จ\n"
        f"จำนวนเงิน {amount} บาท\n"
        "ชื่อผู้รับ VibeCity\n"
        "ธนาคาร KBANK\n"
        "บัญชี xxx-x-x7890\n"
        "06/01/2026 14:30\n"
        "Ref: ABC123456789"
    )


# ===================================================================
# 1. VERIFIED — amount match + success phrase (locked decision table)
# ===================================================================

class TestVerifiedStrict:
    async def test_verified_all_signals_true(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("500.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)

        assert result.status == "verified"
        assert result.reason == "verified"
        assert result.provider == "gcv"
        assert result.error is None
        assert result.signals["success_phrase"] is True
        assert result.signals["amount_found"] is True
        assert result.signals["amount_match"] is True
        assert result.signals["receiver_name_match"] is True
        assert result.signals["receiver_bank_match"] is True
        assert result.signals["receiver_account_match"] is True
        assert len(result.image_hash) == 64
        assert len(result.text_hash) == 64

    async def test_verified_with_comma_amount(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("1,500.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, "1500")
        assert result.status == "verified"
        assert result.signals["amount_match"] is True

    async def test_verified_with_integer_amount_no_decimals(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("500"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "verified"

    async def test_verified_english_success_phrase(self, mock_ocr):
        text = (
            "Transfer Successful\n"
            "จำนวนเงิน 500.00 บาท\n"
            "ชื่อผู้รับ VibeCity\n"
            "ธนาคาร KBANK\n"
            "บัญชี xxx-x-x7890\n"
            "06/01/2026 14:30"
        )
        mock_ocr.return_value = {"text": text, "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "verified"

    async def test_verified_thai_alternative_phrase(self, mock_ocr):
        text = _valid_slip_text("500.00").replace("โอนเงินสำเร็จ", "ทำรายการสำเร็จ")
        mock_ocr.return_value = {"text": text, "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "verified"

    async def test_verified_completed_phrase(self, mock_ocr):
        text = (
            "Completed\n"
            "จำนวนเงิน 500.00 บาท\n"
            "ชื่อผู้รับ VibeCity\n"
            "ธนาคาร KBANK\n"
            "บัญชี xxx-x-x7890\n"
            "06/01/2026 14:30"
        )
        mock_ocr.return_value = {"text": text, "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "verified"

    async def test_verified_amount_as_string(self, mock_ocr):
        """expected_amount passed as string — backward compat."""
        mock_ocr.return_value = {"text": _valid_slip_text("500.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, "500.00")
        assert result.status == "verified"


# ===================================================================
# 2. REJECTED — amount mismatch (hard anti-fraud)
# ===================================================================

class TestRejectedAmountMismatch:
    async def test_wrong_amount_rejected(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("999.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "rejected"
        assert result.reason == "amount_mismatch"

    async def test_slightly_off_rejected(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("500.01"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "rejected"
        assert result.reason == "amount_mismatch"

    async def test_zero_amount_rejected(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("0.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "rejected"
        assert result.reason == "amount_mismatch"

    async def test_huge_fraud_amount_rejected(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("999999.99"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "rejected"
        assert result.reason == "amount_mismatch"

    async def test_amount_mismatch_even_with_success_and_receiver(self, mock_ocr):
        """amount_mismatch overrides everything else."""
        mock_ocr.return_value = {"text": _valid_slip_text("600.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "rejected"
        assert result.reason == "amount_mismatch"
        assert result.signals["success_phrase"] is True
        assert result.signals["receiver_name_match"] is True


# ===================================================================
# 3. PENDING_REVIEW — amount missing
# ===================================================================

class TestPendingReviewMissingAmount:
    async def test_no_amount_in_text(self, mock_ocr):
        text = "โอนเงินสำเร็จ\nชื่อผู้รับ VibeCity\nธนาคาร KBANK"
        mock_ocr.return_value = {"text": text, "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "pending_review"
        assert result.reason == "amount_missing"

    async def test_empty_ocr_text(self, mock_ocr):
        mock_ocr.return_value = {"text": "", "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "pending_review"
        assert result.reason == "amount_missing"


# ===================================================================
# 4. PENDING_REVIEW — missing success phrase
# ===================================================================

class TestPendingReviewMissingSuccessPhrase:
    async def test_amount_match_but_no_success_phrase(self, mock_ocr):
        text = (
            "จำนวนเงิน 500.00 บาท\n"
            "ชื่อผู้รับ VibeCity\n"
            "ธนาคาร KBANK\n"
            "บัญชี xxx-x-x7890\n"
            "06/01/2026 14:30"
        )
        mock_ocr.return_value = {"text": text, "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "pending_review"
        assert result.reason == "missing_success_phrase"
        assert result.signals["success_phrase"] is False
        assert result.signals["amount_match"] is True


# ===================================================================
# 5. VERIFIED even with receiver mismatch (locked decision table:
#    amount match + phrase → verified, receiver is informational only)
# ===================================================================

class TestReceiverMismatchStillVerified:
    """Locked decision table: receiver mismatch does NOT block verification."""

    @pytest.mark.parametrize(
        "_desc, text",
        [
            (
                "name_mismatch",
                "โอนเงินสำเร็จ\nจำนวนเงิน 500.00 บาท\n"
                "ชื่อผู้รับ WrongName\n"
                "ธนาคาร KBANK\nบัญชี xxx-x-x7890",
            ),
            (
                "bank_mismatch",
                "โอนเงินสำเร็จ\nจำนวนเงิน 500.00 บาท\n"
                "ชื่อผู้รับ VibeCity\n"
                "ธนาคาร UNKNOWN_BANK\nบัญชี xxx-x-x7890",
            ),
            (
                "account_mismatch",
                "โอนเงินสำเร็จ\nจำนวนเงิน 500.00 บาท\n"
                "ชื่อผู้รับ VibeCity\n"
                "ธนาคาร KBANK\nบัญชี xxx-x-x0000",
            ),
        ],
        ids=["name_mismatch", "bank_mismatch", "account_mismatch"],
    )
    async def test_receiver_mismatch_still_verified(self, mock_ocr, _desc, text):
        mock_ocr.return_value = {"text": text, "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "verified"
        assert result.reason == "verified"


# ===================================================================
# 6. OCR failure => pending_review (ocr_error)
# ===================================================================

class TestOCRFailure:
    async def test_timeout_returns_pending_review(self, mock_ocr):
        mock_ocr.side_effect = TimeoutError("Connection timed out")
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "pending_review"
        assert result.reason == "ocr_error"
        assert result.error is not None
        assert "timed out" in result.error.lower()
        assert len(result.image_hash) == 64
        mock_ocr.assert_called_once()

    async def test_generic_exception_returns_pending_review(self, mock_ocr):
        mock_ocr.side_effect = Exception("Vision API error: 503")
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "pending_review"
        assert result.reason == "ocr_error"
        mock_ocr.assert_called_once()


# ===================================================================
# 7. Fetch failure => rejected (fetch_error)
# ===================================================================

class TestFetchFailure:
    async def test_fetch_404_rejected(self, mock_fetch, mock_ocr):
        mock_fetch.side_effect = RuntimeError("Failed to fetch slip image: 404")
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "rejected"
        assert result.reason == "fetch_error"
        assert result.error is not None
        mock_ocr.assert_not_called()

    async def test_fetch_size_limit_rejected(self, mock_fetch, mock_ocr):
        mock_fetch.side_effect = RuntimeError("Slip image exceeds size limit")
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "rejected"
        assert result.reason == "fetch_error"
        assert "size limit" in result.error.lower()
        mock_ocr.assert_not_called()


# ===================================================================
# 8. Invalid image bytes => rejected (invalid_image)
# ===================================================================

class TestInvalidImage:
    async def test_empty_bytes_rejected(self, mock_fetch, mock_ocr):
        mock_fetch.return_value = b""
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "rejected"
        assert result.reason == "invalid_image"
        mock_ocr.assert_not_called()


# ===================================================================
# 9. Garbage OCR => pending_review (amount_missing)
# ===================================================================

class TestGarbageOCR:
    async def test_pure_nonsense_no_numbers(self, mock_ocr):
        mock_ocr.return_value = {"text": "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nHello World", "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "pending_review"
        assert result.reason == "amount_missing"

    async def test_random_numbers_no_keyword_pending(self, mock_ocr):
        """Random numbers without amount keywords → amount_missing."""
        mock_ocr.return_value = {"text": "QWERTYUIOP\n1234567890", "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.status == "pending_review"
        assert result.reason == "amount_missing"


# ===================================================================
# 10. Determinism — same input → same output
# ===================================================================

class TestDeterminism:
    async def test_verified_deterministic(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("500.00"), "raw": {}}
        results = [await verify_slip_with_gcv(SLIP_URL, 500) for _ in range(10)]

        assert len({r.status for r in results}) == 1
        assert len({r.reason for r in results}) == 1
        assert all(r.score == 0.0 for r in results)
        assert len({r.image_hash for r in results}) == 1
        assert len({r.text_hash for r in results}) == 1
        for r in results:
            assert r.signals == results[0].signals

    async def test_rejected_deterministic(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("999.00"), "raw": {}}
        results = [await verify_slip_with_gcv(SLIP_URL, 500) for _ in range(10)]
        assert all(r.status == "rejected" for r in results)
        assert all(r.reason == "amount_mismatch" for r in results)


# ===================================================================
# 11. Hashes — sha256 of image_bytes and normalized text
# ===================================================================

class TestHashes:
    async def test_image_hash_is_sha256_of_bytes(self, mock_fetch, mock_ocr):
        import hashlib
        image_bytes = b"fake_image_bytes"
        mock_fetch.return_value = image_bytes
        mock_ocr.return_value = {"text": _valid_slip_text("500.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.image_hash == hashlib.sha256(image_bytes).hexdigest()

    async def test_text_hash_is_sha256_of_normalized_text(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("500.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert len(result.text_hash) == 64
        # text_hash should be deterministic
        result2 = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.text_hash == result2.text_hash

    async def test_fetch_error_has_no_hashes(self, mock_fetch):
        mock_fetch.side_effect = RuntimeError("fetch fail")
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert result.image_hash == ""
        assert result.text_hash == ""

    async def test_ocr_error_has_image_hash_no_text_hash(self, mock_ocr):
        mock_ocr.side_effect = RuntimeError("ocr fail")
        result = await verify_slip_with_gcv(SLIP_URL, 500)
        assert len(result.image_hash) == 64
        assert result.text_hash == ""


# ===================================================================
# 12. evaluate_slip_text direct unit tests (core logic, sync)
# ===================================================================

class TestEvaluateSlipText:
    """Direct tests against the evaluation engine."""

    def test_perfect_slip(self):
        result = evaluate_slip_text(
            text=_valid_slip_text("500.00"),
            expected_amount=500,
            **EVAL_DEFAULTS,
        )
        assert result["status"] == "verified"
        assert result["reason"] == "verified"

    def test_amount_mismatch(self):
        result = evaluate_slip_text(
            text=_valid_slip_text("500.00"),
            expected_amount=999,
            **EVAL_DEFAULTS,
        )
        assert result["status"] == "rejected"
        assert result["reason"] == "amount_mismatch"

    def test_empty_text(self):
        result = evaluate_slip_text(
            text="",
            expected_amount=500,
            **EVAL_DEFAULTS,
        )
        assert result["status"] == "pending_review"
        assert result["reason"] == "amount_missing"

    def test_comma_format(self):
        text = (
            "โอนเงินสำเร็จ\nจำนวนเงิน 1,234.00 บาท\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount="1234", **EVAL_DEFAULTS)
        assert result["signals"]["amount_match"] is True
        assert result["status"] == "verified"

    def test_space_separated_amount(self):
        text = (
            "โอนเงินสำเร็จ\nจำนวนเงิน 1 234.00 บาท\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=1234, **EVAL_DEFAULTS)
        assert result["signals"]["amount_match"] is True

    def test_baht_prefix_amount(self):
        text = (
            "โอนเงินสำเร็จ\nจำนวนเงิน ฿500.00\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=500, **EVAL_DEFAULTS)
        assert result["signals"]["amount_found"] is True
        assert result["signals"]["amount_match"] is True

    def test_thb_prefix_amount(self):
        text = (
            "โอนเงินสำเร็จ\nTHB 1,234.00\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=1234, **EVAL_DEFAULTS)
        assert result["signals"]["amount_match"] is True

    def test_missing_success_phrase_pending(self):
        text = (
            "จำนวนเงิน 500.00 บาท\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=500, **EVAL_DEFAULTS)
        assert result["status"] == "pending_review"
        assert result["reason"] == "missing_success_phrase"

    def test_receiver_mismatch_still_verified(self):
        """Locked table: receiver mismatch does NOT block verification."""
        text = (
            "โอนเงินสำเร็จ\nจำนวนเงิน 500.00 บาท\n"
            "ชื่อผู้รับ WrongPerson\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=500, **EVAL_DEFAULTS)
        assert result["status"] == "verified"
        assert result["signals"]["receiver_name_match"] is False

    def test_no_receiver_name_expected(self):
        """When expected_receiver_name is empty, name_match is False but still verified."""
        result = evaluate_slip_text(
            text=_valid_slip_text("500.00"),
            expected_amount=500,
            expected_receiver_name="",
            expected_receiver_banks=["kbank"],
            expected_receiver_account="1234567890",
            expected_receiver_account_tail=4,
        )
        assert result["signals"]["receiver_name_match"] is False
        assert result["status"] == "verified"

    def test_no_receiver_banks_expected(self):
        """When expected_receiver_banks is empty, bank_match is False but still verified."""
        result = evaluate_slip_text(
            text=_valid_slip_text("500.00"),
            expected_amount=500,
            expected_receiver_name="VibeCity",
            expected_receiver_banks=[],
            expected_receiver_account="1234567890",
            expected_receiver_account_tail=4,
        )
        assert result["signals"]["receiver_bank_match"] is False
        assert result["status"] == "verified"

    def test_account_tail_no_expected(self):
        """When expected_receiver_account is empty, account_match is False."""
        result = evaluate_slip_text(
            text=_valid_slip_text("500.00"),
            expected_amount=500,
            expected_receiver_name="VibeCity",
            expected_receiver_banks=["kbank"],
            expected_receiver_account="",
            expected_receiver_account_tail=4,
        )
        assert result["signals"]["receiver_account_match"] is False

    def test_timestamp_found(self):
        result = evaluate_slip_text(
            text=_valid_slip_text("500.00"),
            expected_amount=500,
            **EVAL_DEFAULTS,
        )
        assert result["signals"]["timestamp_found"] is True

    def test_no_timestamp(self):
        text = (
            "โอนเงินสำเร็จ\nจำนวนเงิน 500.00 บาท\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=500, **EVAL_DEFAULTS)
        assert result["signals"]["timestamp_found"] is False

    def test_successful_transfer_phrase(self):
        text = (
            "Successful Transfer\nจำนวนเงิน 500.00 บาท\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=500, **EVAL_DEFAULTS)
        assert result["signals"]["success_phrase"] is True

    def test_transaction_successful_phrase(self):
        text = (
            "Transaction Successful\nจำนวนเงิน 500.00 บาท\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=500, **EVAL_DEFAULTS)
        assert result["signals"]["success_phrase"] is True

    def test_no_keyword_amounts_are_untrusted(self):
        """Amounts without keyword context are ignored (anti-fraud)."""
        text = (
            "โอนเงินสำเร็จ\n100.00\n500.00\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK"
        )
        result = evaluate_slip_text(
            text=text,
            expected_amount=500,
            expected_receiver_name="VibeCity",
            expected_receiver_banks=["kbank"],
            expected_receiver_account="",
            expected_receiver_account_tail=4,
        )
        assert result["signals"]["amount_found"] is False
        assert result["status"] == "pending_review"
        assert result["reason"] == "amount_missing"

    def test_fraud_user_writes_expected_amount_randomly(self):
        """Fraud: user writes expected amount on slip without keyword → must NOT verify."""
        text = (
            "โอนเงินสำเร็จ\nจำนวนเงิน 300.00 บาท\n"
            "500.00\n"  # fraud: user wrote expected amount somewhere
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=500, **EVAL_DEFAULTS)
        # Keyword-adjacent amount is 300, not 500 → mismatch
        assert result["status"] == "rejected"
        assert result["reason"] == "amount_mismatch"

    def test_fraud_huge_number_on_slip(self):
        """Fraud: user writes 99999 on slip → keyword amount still governs."""
        text = (
            "โอนเงินสำเร็จ\nจำนวนเงิน 500.00 บาท\n"
            "99999\n"
            "ชื่อผู้รับ VibeCity\nธนาคาร KBANK\nบัญชี xxx-x-x7890"
        )
        result = evaluate_slip_text(text=text, expected_amount=500, **EVAL_DEFAULTS)
        assert result["status"] == "verified"
        assert result["signals"]["amount_match"] is True

    def test_account_tail_default_length(self):
        """tail_length=0 falls back to min(4, len(digits))."""
        result = evaluate_slip_text(
            text=_valid_slip_text("500.00"),
            expected_amount=500,
            expected_receiver_name="VibeCity",
            expected_receiver_banks=["kbank"],
            expected_receiver_account="1234567890",
            expected_receiver_account_tail=0,
        )
        assert result["signals"]["receiver_account_match"] is True


# ===================================================================
# 13. _to_decimal coverage (all input types)
# ===================================================================

class TestToDecimal:
    def test_from_int(self):
        assert _to_decimal(500) == Decimal("500.00")

    def test_from_float(self):
        assert _to_decimal(500.0) == Decimal("500.00")

    def test_from_str(self):
        assert _to_decimal("1,234.56") == Decimal("1234.56")

    def test_from_decimal(self):
        assert _to_decimal(Decimal("500")) == Decimal("500.00")

    def test_from_str_with_baht_prefix(self):
        assert _to_decimal("฿1234") == Decimal("1234.00")

    def test_from_str_with_thb_prefix(self):
        assert _to_decimal("THB500.50") == Decimal("500.50")

    def test_invalid_type_raises(self):
        with pytest.raises(Exception):
            _to_decimal([123])


# ===================================================================
# 14. get_feature_from_sku coverage
# ===================================================================

class TestGetFeatureFromSku:
    @pytest.mark.parametrize("sku,expected", [
        ("glow_basic", "glow"),
        ("boost_pro", "boost"),
        ("giant_vip", "giant"),
        ("random_sku", "verified"),
        ("", "verified"),
    ])
    def test_sku_mapping(self, sku, expected):
        assert get_feature_from_sku(sku) == expected


# ===================================================================
# 15. verify_slip_with_gcv with float/Decimal amount (backward compat)
# ===================================================================

class TestFloatBackwardCompat:
    async def test_float_amount_verified(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("500.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, 500.0)
        assert result.status == "verified"

    async def test_decimal_amount_verified(self, mock_ocr):
        mock_ocr.return_value = {"text": _valid_slip_text("500.00"), "raw": {}}
        result = await verify_slip_with_gcv(SLIP_URL, Decimal("500"))
        assert result.status == "verified"
