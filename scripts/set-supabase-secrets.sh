#!/usr/bin/env bash
set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "Error: supabase CLI not found. Install first: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required to base64-encode service account JSON." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required to generate WEBHOOK_SECRET." >&2
  exit 1
fi

: "${SUPABASE_PROJECT_REF:?Missing SUPABASE_PROJECT_REF}"
: "${GCV_SA_JSON_PATH:?Missing GCV_SA_JSON_PATH}"
: "${SLIP_EXPECT_RECEIVER_NAME:?Missing SLIP_EXPECT_RECEIVER_NAME}"
: "${SLIP_EXPECT_RECEIVER_BANKS:?Missing SLIP_EXPECT_RECEIVER_BANKS}"
: "${SLIP_EXPECT_RECEIVER_ACCOUNT:?Missing SLIP_EXPECT_RECEIVER_ACCOUNT}"

if [[ ! -f "${GCV_SA_JSON_PATH}" ]]; then
  echo "Error: GCV_SA_JSON_PATH file not found: ${GCV_SA_JSON_PATH}" >&2
  exit 1
fi

SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL="${SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL:-4}"
SLIP_DISABLE_MANUAL_REVIEW="${SLIP_DISABLE_MANUAL_REVIEW:-false}"
SLIP_DUPLICATE_WINDOW_DAYS="${SLIP_DUPLICATE_WINDOW_DAYS:-90}"
SLIP_STORE_OCR_RAW="${SLIP_STORE_OCR_RAW:-false}"
GCV_OCR_MAX_BYTES="${GCV_OCR_MAX_BYTES:-5242880}"
IPINFO_TOKEN="${IPINFO_TOKEN:-}"
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-$(openssl rand -hex 32)}"

GCV_SERVICE_ACCOUNT_JSON="$(GCV_SA_JSON_PATH="${GCV_SA_JSON_PATH}" python3 - <<'PY'
import base64
import os
import pathlib

p = pathlib.Path(os.environ["GCV_SA_JSON_PATH"])
print(base64.b64encode(p.read_bytes()).decode())
PY
)"

echo "Setting Supabase secrets for project: ${SUPABASE_PROJECT_REF}"
supabase secrets set --project-ref "${SUPABASE_PROJECT_REF}" \
  GCV_SERVICE_ACCOUNT_JSON="${GCV_SERVICE_ACCOUNT_JSON}" \
  GCV_OCR_MAX_BYTES="${GCV_OCR_MAX_BYTES}" \
  SLIP_EXPECT_RECEIVER_NAME="${SLIP_EXPECT_RECEIVER_NAME}" \
  SLIP_EXPECT_RECEIVER_BANKS="${SLIP_EXPECT_RECEIVER_BANKS}" \
  SLIP_EXPECT_RECEIVER_ACCOUNT="${SLIP_EXPECT_RECEIVER_ACCOUNT}" \
  SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL="${SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL}" \
  SLIP_DISABLE_MANUAL_REVIEW="${SLIP_DISABLE_MANUAL_REVIEW}" \
  SLIP_DUPLICATE_WINDOW_DAYS="${SLIP_DUPLICATE_WINDOW_DAYS}" \
  SLIP_STORE_OCR_RAW="${SLIP_STORE_OCR_RAW}" \
  IPINFO_TOKEN="${IPINFO_TOKEN}" \
  WEBHOOK_SECRET="${WEBHOOK_SECRET}" \
  DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL}"

echo "Done."
echo "WEBHOOK_SECRET=${WEBHOOK_SECRET}"
echo "Tip: run 'supabase secrets list --project-ref ${SUPABASE_PROJECT_REF}' to verify."
