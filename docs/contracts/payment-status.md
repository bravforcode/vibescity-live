# Payment Status Contract

## Endpoint
`POST /functions/v1/get-order-status`

## Request (canonical)
```json
{
  "session_id": "cs_test_123"
}
```

## Request (temporary backward compatibility)
```json
{
  "orderId": "cs_test_123"
}
```

`orderId` is deprecated and should be removed after one release cycle.

## Response
```json
{
  "success": true,
  "status": "processing|pending|paid|failed|canceled",
  "order": {}
}
```

## Security
- Requires bearer auth.
- CORS is allowlist-driven via `CORS_ALLOWED_ORIGINS`.

