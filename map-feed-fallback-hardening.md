# Map Feed Fallback Hardening

## Scope

- Restore expected giant-pin aggregation behavior when zooming out.
- Open the venue detail modal once when a horizontal card settles at center.
- Stop owner/partner dashboard fallback cascades from producing repeated `504`, CORS, and `401` noise in frontend-only localhost runs.
- Fix locally actionable accessibility and i18n warnings discovered in the current flow.

## Success Criteria

- Zooming out collapses detail neon pins into aggregate giant pins at the intended zoom bands.
- Horizontal card centering auto-opens the matching venue modal once per venue per session.
- Owner/partner pages degrade quietly to local fallback mode when API/Supabase routes are unavailable from localhost.
- The filter/favorites modal backdrop no longer triggers the `aria-hidden`/focus warning.
- `a11y.input_field` exists in both `th` and `en` locales.
- The filter sheet no longer attempts to cancel non-cancelable `touchmove` events.

## Constraints

- No auth, RLS, schema, or migration changes.
- Prefer frontend/client behavior fixes and fallback gating over backend contract changes.
