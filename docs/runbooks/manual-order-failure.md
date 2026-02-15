# Manual Order Failure Runbook

## Scenario
Order creation succeeds but OCR queue enqueue fails.

## Expected API behavior
- API still returns `success: true`.
- `ocr_enqueued: false`
- `retryable: true`
- `retry_token` included for tracing.

## Immediate operator actions
1. Search `orders.metadata.ocr_retry_token` for affected order.
2. Re-enqueue OCR job manually via worker tooling.
3. Verify audit row in `slip_audit` exists.

## Safety notes
- Do not re-create the order if it already exists.
- Treat enqueue failure as asynchronous processing issue, not payment rejection.

