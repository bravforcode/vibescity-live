# Owner Venue Query Contract (Cursor + Performance)

## Endpoint

`GET /api/v1/owner/venues`

## Query Parameters

- `visitor_id` (required)
- `limit` (optional, default `50`, max `100`)
- `status` (optional exact match)
- `search` (optional name/category contains)
- `cursor_created_at` (optional ISO datetime)
- `cursor_id` (optional fallback tie-breaker)

## Response Shape

```json
{
  "total": 50,
  "venues": [],
  "has_more": true,
  "next_cursor": {
    "created_at": "2026-03-06T10:00:00Z",
    "id": "uuid"
  },
  "query_contract": {
    "max_page_size": 100,
    "default_page_size": 50,
    "cursor_fields": ["created_at", "id"],
    "timeout_budget_ms": 500
  }
}
```

## Required DB Indexes (Backend)

1. `(owner_visitor_id, created_at DESC, id DESC)`
2. `(owner_visitor_id, status)`
3. `(owner_visitor_id, name text_ops)`

## SLO

- P95 query latency target: `<= 500ms`
- Hard timeout budget per query: `500ms`

