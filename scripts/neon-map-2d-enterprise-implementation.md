# neon-map-2d-enterprise-implementation

## Goal
Implement enterprise plan for stable neon 2D map, legacy giant pins, single-modal behavior, auto-reopen lock, and realistic road-car motion.

## P0
- Add modal FSM + gesture intent + lock auto-open.
- Add map lifecycle helpers and feature sanitizer gate.
- Enforce neon persistence and remove selected-circle style.
- Force legacy giant-pin behavior for low/mid zoom aggregate levels.

## P1+
- Harden car animation lifecycle/background suspension.
- Add retry/error logging helpers.
- Add config/constants registry and wire to map container.

## Validation
- bun run check
- bun run build
- run focused unit tests for new modules
