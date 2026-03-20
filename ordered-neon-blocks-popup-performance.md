# Ordered Neon Blocks + Smaller Popup + Faster Site

## Summary

- Use the MapLibre neon sprite pipeline as the production neon sign renderer.
- Organize full-detail neon signs into deterministic high-zoom blocks without losing their geographic anchor.
- Reduce popup card size by about 30 percent from the 320px baseline.
- Improve smoothness by removing duplicate neon rendering and avoiding heavy recalculation on every map move frame.

## Decisions

- Production neon rendering uses `NEON_FULL`, `NEON_COMPACT`, and `NEON_MINI`.
- `useNeonPinsLayer` and `NeonPinSign.vue` are debug-only / experimental, not the default production path.
- Ordered block layout applies only to `NEON_FULL` at high zoom.
- Geographic accuracy means anchor-preserving nudges, not road snapping.
- Popup width target is 224px max across map popups.

## Validation

- `bun run check`
- `bun run build`
- `bun run test:e2e:smoke`
- `python .agent/scripts/checklist.py .`
