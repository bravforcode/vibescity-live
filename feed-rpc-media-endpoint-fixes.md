# Feed RPC And Media Endpoint Fixes

## Analysis

- Live `POST /rest/v1/rpc/get_feed_cards` returns `500` with code `57014` and message `canceling statement due to statement timeout`.
- Direct SQL execution of `public.get_feed_cards(18.7883, 98.9853, 5)` succeeds, so the failure is specific to the PostgREST-exposed function budget/config, not the core query shape.
- Earlier migrations explicitly restored `search_path` and statement timeout for `get_feed_cards`, but the March 8 recreation dropped those per-function settings.
- Live `https://vibecity-api.fly.dev/api/v1/openapi.json` does not expose `/api/v1/media/{venue_id}/real`, and the frontend currently retries that missing route on every modal open.
- Local backend media route also returns an object placeholder shape that does not match the frontend modal's expected array of `{ type, url }` items.

## Planned Fix

1. Add a new non-destructive migration that restores `statement_timeout` and `search_path` on `public.get_feed_cards(double precision, double precision, integer)`.
2. Replace the placeholder media route with a defensive implementation that returns normalized media items from canonical venue fields plus approved video candidates.
3. Harden the frontend media client to normalize legacy/object payloads and stop retrying if the endpoint returns `404` for the current session.
4. Add focused tests for the frontend media client behavior.
