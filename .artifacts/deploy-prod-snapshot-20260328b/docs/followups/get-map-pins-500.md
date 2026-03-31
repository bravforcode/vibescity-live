# `get_map_pins` 500 Follow-up

## Context

- Frontend recovery work has already isolated the UI from this failure:
  - map runtime now falls back safely instead of leaving half-black UI
  - popup/modal media issues were fixed separately
  - partner/locale work is unrelated
- If `POST /rest/v1/rpc/get_map_pins` still returns `500` after the current frontend patch, treat it as a backend/database contract issue, not a frontend blocker.

## Symptom

- Browser console shows:
  - `POST https://...supabase.co/rest/v1/rpc/get_map_pins 500 (Internal Server Error)`
- Secondary frontend effects before the recovery patch included:
  - MapLibre tile/error spam
  - degraded map shell
  - marker/popup availability dropping with no clear user-facing explanation

## Reproduction Target

1. Load the home page with a fresh session.
2. Wait for the initial venue/map bootstrap.
3. Capture the failing `get_map_pins` request payload, response body, and headers.
4. Re-run the same payload against the RPC directly outside the browser if possible.

## What To Collect

- Exact RPC payload sent by the frontend
- Supabase response body for the `500`
- Postgres error text from Supabase logs
- Current function definition for `get_map_pins`
- `EXPLAIN (ANALYZE, BUFFERS)` for the failing SQL path when reproducible
- Whether the failure depends on:
  - `visitor_id`
  - locale/category filters
  - zoom / bounding box parameters
  - anonymous vs authenticated caller

## Primary Hypotheses To Verify

- Function body still has an enum/status cast path that breaks for some rows
- Search path or helper view dependency drifted from the expected schema
- Bounding box / geometry input can produce invalid spatial operations
- New columns or joins added in later migrations are nullable in ways the RPC did not defend against
- RLS or auth-context assumptions changed and now surface as `500` instead of a typed permission/status response
- Query plan regressed and the function is timing out, with the timeout surfaced upstream as `500`

## Backend Checks

- Confirm the live RPC definition matches the intended migration chain
- Audit recent migrations that touched:
  - map pin status casting
  - geography / gist indexes
  - search path
  - venue status compatibility
- Validate the RPC against:
  - empty result bounds
  - dense urban bounds
  - anonymous caller
  - authenticated caller
- If timing-related, compare plan/runtime before and after forcing relevant indexes

## Exit Criteria

- `get_map_pins` returns non-500 responses for the reproduced payload set
- Supabase logs no longer show unhandled exceptions for this RPC
- Frontend map loads pins without entering error fallback for the same scenario
- A regression test or reproducible SQL script exists for the original failing case

## Out Of Scope For This Follow-up

- No frontend popup/modal/layout changes
- No partner/dashboard routing changes
- No locale behavior changes
