# Owner + Partner + Neon Remediation

## Problem

- `/:locale/partner` redirects back home for visitors because the dashboard guard only allows visitor fallback for `owner`.
- Local frontend uses an absolute production API base during `localhost:5173` development, causing CORS failures for owner, partner, reviews, and directions requests.
- Owner dashboard degrades poorly when API calls fail and does not match the visual language of the promotion flow.
- High-zoom neon signs still overlap and the map effects pipeline retries source/layer work too aggressively.

## Goals

1. Keep `partner` and `owner` routes open for visitor-based onboarding flows.
2. Use same-origin `/api` in local development so Vite proxy/local backend can be used without browser CORS failures.
3. Add resilient read fallbacks for partner/owner dashboard loading so the page stays usable when API is unavailable.
4. Restyle the dashboard hero/panels toward the promote-shop visual system.
5. Make neon sign blocks more orderly and reduce unnecessary refresh/retry churn.

## Validation

- `bun run check`
- `bun run build`
- Focused route smoke for `/en/partner` and `/en/merchant`
