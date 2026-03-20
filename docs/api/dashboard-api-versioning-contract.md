# Dashboard API Versioning and Envelope Contract

## Goal

Prevent silent frontend breakage when backend contracts evolve (`v1` to `v2`) and provide predictable migration windows.

## Base Version

- Current version: `v1`
- Base path: `/api/v1`
- Compatibility mode: enabled (raw JSON and envelope are both accepted by client adapter)

## Response Headers

Every `/api/*` response must include:

- `X-API-Version`: current backend contract version (`v1`, `v2`, ...)
- `X-Request-ID`: request correlation ID

Optional lifecycle headers:

- `X-API-Deprecated-At`: ISO datetime when version entered deprecation state
- `X-API-Sunset-At`: ISO datetime when unsupported clients are no longer guaranteed to work

## Envelope Opt-in Contract

Client opt-in header:

- `X-API-Envelope: 1`

If provided on JSON endpoints, server returns:

```json
{
  "data": {},
  "meta": {
    "version": "v1",
    "requestId": "uuid",
    "timestamp": "2026-03-06T12:00:00Z",
    "deprecatedAt": null,
    "sunsetAt": null
  },
  "errors": []
}
```

Error response envelope shape:

```json
{
  "data": { "detail": "Invalid payload" },
  "meta": {
    "version": "v1",
    "requestId": "uuid",
    "timestamp": "2026-03-06T12:00:00Z",
    "deprecatedAt": "2026-06-01T00:00:00Z",
    "sunsetAt": "2026-09-01T00:00:00Z"
  },
  "errors": [
    { "code": "API_ERROR", "message": "Invalid payload" }
  ]
}
```

## Frontend Adapter Rules

Frontend must consume responses through `src/services/api/dashboardApiAdapter.js` and `parseApiJson()`.

- Raw JSON payloads are wrapped into local envelope format.
- Enveloped payloads are unwrapped into a stable client contract.
- `meta.version` should be logged to observability when mismatched with expected client version.

## Breaking Change Policy

1. New fields: additive only in same major contract (`v1`).
2. Field removal/rename/type changes: require new version (`v2`).
3. Dual-serve period: backend serves `v1` and `v2` in parallel for minimum 90 days.
4. Sunset notice: set `X-API-Deprecated-At` and `X-API-Sunset-At` before removing support.

## Migration Checklist (`v1` -> `v2`)

1. Define `v2` schema and adapters.
2. Dual-publish `v1` + `v2`.
3. Monitor client version adoption.
4. Announce deprecation date.
5. Enforce sunset after adoption target is met.
