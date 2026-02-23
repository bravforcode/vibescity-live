# Analytics Router Contract

## Log Event
`POST /api/v1/analytics/log`

Payload:
```json
{
  "event_type": "string",
  "data": {},
  "user_id": "optional"
}
```

Behavior:
- Fire-and-forget logging through background task.
- Failures are logged and must not break caller flow.

## Dashboard Stats
`GET /api/v1/analytics/dashboard/stats`

Auth:
- Admin only.

Canonical source:
- Venue totals must be derived from `public.venues`.
- Response keeps `total_shops` as compatibility alias for existing clients.

