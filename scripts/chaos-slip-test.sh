#!/usr/bin/env bash
set -euo pipefail

EDGE_URL="${EDGE_URL:-http://localhost:54321/functions/v1}"
VENUE_ID="${VENUE_ID:-00000000-0000-0000-0000-000000000000}"
SLIP_URL_OK="${SLIP_URL_OK:-https://example.com/slip-ok.jpg}"
SLIP_URL_DUP="${SLIP_URL_DUP:-$SLIP_URL_OK}"
SLIP_URL_BAD="${SLIP_URL_BAD:-https://example.com/does-not-exist.jpg}"

post_order() {
  local amount="$1"
  local slip_url="$2"
  local sku="${3:-verified}"
  curl -sS -X POST "$EDGE_URL/create-manual-order" \
    -H "Content-Type: application/json" \
    -d "{
      \"venue_id\": \"${VENUE_ID}\",
      \"sku\": \"${sku}\",
      \"amount\": ${amount},
      \"slip_url\": \"${slip_url}\",
      \"consent_personal_data\": true,
      \"buyer_profile\": {
        \"full_name\": \"Chaos Tester\",
        \"phone\": \"0800000000\",
        \"email\": \"chaos@example.com\",
        \"address_line1\": \"123 Chaos Street\",
        \"address_line2\": \"Suite 9\",
        \"country\": \"TH\",
        \"province\": \"Bangkok\",
        \"district\": \"Pathum Wan\",
        \"postal_code\": \"10330\"
      },
      \"visitor_id\": \"chaos-test\",
      \"metadata\": {\"pkg_name\":\"Chaos Test\",\"option\":\"N/A\"}
    }"
  echo
}

echo "== Chaos Test: Valid Slip =="
post_order 199 "$SLIP_URL_OK"

echo "== Chaos Test: Amount Mismatch =="
post_order 200 "$SLIP_URL_OK"

echo "== Chaos Test: Invalid Slip URL =="
post_order 199 "$SLIP_URL_BAD"

echo "== Chaos Test: Duplicate Slip (2x) =="
post_order 199 "$SLIP_URL_DUP"
post_order 199 "$SLIP_URL_DUP"

echo "== Chaos Test: Concurrency Burst (5 requests) =="
for i in {1..5}; do
  post_order 199 "$SLIP_URL_OK" "boost_7d" &
done
wait

echo "Chaos tests completed."
