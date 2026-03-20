# Realtime Contract Versioning

## Scope

- Partner payout event stream (`/api/v1/partner/payout/events`)
- Future order/financial SSE or WebSocket streams

## Event Version Field

All events must carry `_version`.

Example v1 payload:

```json
{
  "_version": 1,
  "type": "payout.pending",
  "payoutId": "uuid",
  "amount": 899,
  "timestamp": "2026-03-06T12:00:00Z",
  "idempotencyKey": "payout:/partner/payout/request:..."
}
```

## Migration Strategy (`v1` -> `v2`)

1. Dual-publish period:
   - Server emits both `_version: 1` and `_version: 2` events for 90 days.
2. Client negotiation:
   - Client announces supported versions in handshake query/header when moving to WebSocket.
   - For SSE, client drops unsupported event versions safely.
3. Observability:
   - Count unsupported version drops.
   - Alert if unsupported drop rate > 0.5%.
4. Sunset:
   - Remove `v1` only after adoption target and announced sunset date.

## Client Parsing Rules

- Accept known versions only.
- Ignore unknown versions without crashing stream.
- Send non-fatal telemetry for unsupported event versions.

## Server Rules

- Event type names are immutable within same version.
- Type signature changes require new `_version`.
- Financial event payloads must include idempotency key where applicable.
