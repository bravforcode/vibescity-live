# Dashboard Migration Notes

## v2.0 UI + Contract Hardening

### Breaking DOM Selector Changes

- Legacy class selector `.od-source-badge` is deprecated.
- Legacy class selector `.pd-tab-bar` is deprecated.
- Automation should prefer `data-testid` selectors and semantic roles.

### API Contract Changes

- Dashboard clients can request envelope mode with `X-API-Envelope: 1`.
- Responses include `X-API-Version` and `X-Request-ID` headers.
- Partner mutation endpoints now require `X-CSRF-Token`.
- Sensitive partner mutation endpoints support `Idempotency-Key`.

### Realtime Contract

- Payout stream events include `_version`.
- Unsupported event versions must be ignored gracefully by client.

### Rollback

- Disable `ff_owner_dashboard_v2` and `ff_partner_dashboard_v2`.
- Keep backend endpoints additive and backward-compatible during migration window.
