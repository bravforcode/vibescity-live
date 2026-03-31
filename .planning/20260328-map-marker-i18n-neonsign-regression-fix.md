## Goal

Fix three visible regressions on the public map UI:

1. Locale text is rendering translation keys instead of human-readable copy.
2. Giant pin should render as a clean pin only, without oversized preview chrome.
3. The selected neon sign pin should remain visible when popup/detail UI opens.

## Scope

- `src/i18n.js`
- `src/composables/map/useNeonPinsLayer.js`
- `src/utils/mapRenderer.js`
- `src/assets/css/map-markers.css`

## Validation

- Browser check on local dev server for translated header/sidebar text
- Browser check that giant pin renders as pin-only
- Browser check that highlighted neon sign remains visible above popup/detail state
