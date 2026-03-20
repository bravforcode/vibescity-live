# Production CSP, Locale, and Runtime Fix

## Goal

Fix live production issues reported on `https://www.vibecity.live` without touching payment, auth, RLS, schema, or migrations.

## Confirmed Problems

1. Default public locale falls back to `th` in the router even though i18n defaults to `en`.
2. CSP blocks inline handlers in `public/index.html` and legacy SW notification markup.
3. CSP blocks Microsoft Clarity because Vercel `script-src` omits `https://www.clarity.ms`.
4. CSP blocks the service worker because `public/sw.js` imports Workbox from a CDN.
5. Health monitoring treats an unauthenticated Supabase `HEAD /rest/v1/` response as an unhealthy database.
6. Supabase Edge Function calls inherit the global `vibe_visitor_id` header and fail CORS preflight.
7. Production still reports `unsafe-eval` violations, so Vercel CSP needs to be aligned with actual runtime needs after removing avoidable violations.

## Planned Changes

- Switch router locale fallback to `en`.
- Remove inline event handlers from HTML/legacy SW UI.
- Serve Workbox from same-origin instead of the Google CDN.
- Add authenticated public headers to the Supabase reachability probe.
- Route analytics and PII audit calls through a dedicated Edge Function fetch helper that does not inherit global custom headers.
- Align `vercel.json` CSP with production runtime requirements while keeping it as narrow as possible.

## Validation

- Targeted unit/build checks for touched files.
- `bun run test:unit --run`
- `python -X utf8 .agent/scripts/checklist.py .`
