# Slip Verification (Google Cloud Vision OCR)

This project verifies manual transfer slips using **Google Cloud Vision OCR** (GCV) with a high‑confidence scoring model to prevent fraud.

## High‑Level Flow

1. User uploads slip image to Supabase storage.
2. `create-manual-order` FastAPI endpoint enqueues OCR on Fly (always-on worker via Redis stream).
3. OCR text is parsed for:
   - success phrase (e.g., "โอนเงินสำเร็จ")
   - amount
   - receiver name/bank/account tail
4. Signals produce a confidence score.
5. Duplicates are rejected using:
   - `slip_image_hash`
   - `slip_text_hash`
6. Final status:
   - `verified` when score is high + amount matches
   - `pending_review` when confidence is low
   - `rejected` when duplicate or amount mismatch

## Environment Variables

```
GCV_SERVICE_ACCOUNT_JSON=base64-or-raw-json
GCV_PROJECT_ID=your-gcp-project-id
GCV_OCR_MAX_BYTES=5242880
SLIP_STORE_OCR_RAW=false
SLIP_DUPLICATE_WINDOW_DAYS=90
SLIP_EXPECT_RECEIVER_NAME="ชื่อผู้รับ"
SLIP_EXPECT_RECEIVER_BANKS="KBANK,กสิกรไทย"
SLIP_EXPECT_RECEIVER_ACCOUNT="0113222743"
SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL=4
SLIP_DISABLE_MANUAL_REVIEW=false
```

## Metadata Fields

Each order receives the following metadata:

- `slip_verification.provider = "gcv"`
- `slip_verification.status` (`verified` | `rejected` | `pending_review` | `error`)
- `slip_verification.score`
- `slip_verification.signals`
- `slip_image_hash`
- `slip_text_hash`
- `slip_ocr_raw` (optional, gated by `SLIP_STORE_OCR_RAW`)

## Fraud Prevention Signals

- Amount mismatch (hard reject)
- Duplicate image/text hash within window (hard reject)
- Missing success phrase
- Receiver name/bank/account tail mismatch

## Deprecation

EasySlip healthcheck is deprecated and disabled by default. Remove cron jobs and secrets when GCV is active.
