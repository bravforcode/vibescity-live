# Map Enterprise Zoom Ads Automation

## Phase 1: Analysis

### Current baseline
- Map pins are rendered from `MapboxContainer.vue` with GeoJSON source `pins_source`.
- Neon sign rendering already exists with `useNeonSignTheme` and `useNeonSignSpriteCache`.
- Promotion metadata exists in `pin_metadata` and `pin_metadata.features`.
- There is no deterministic multi-level province/zone hierarchy in current pin rendering.
- Current layout uses overlap-enabled symbols, so dense areas can visually collide.

### Gaps vs requested behavior
- Missing explicit zoom hierarchy (detail / zone giant / Thailand-wide province giant).
- Missing click drill-down from aggregate giant pins to lower levels.
- Missing automation for ad-driven sign dominance + neighbor downscaling.
- Missing automated crowding layout for newly added venues in dense zones.

## Phase 2: Plan

1. Add map zoom hierarchy utility (`detail`, `zone`, `province`) with deterministic thresholds.
2. Add hierarchical aggregation utility for giant pins at zone/province levels.
3. Add enterprise layout engine to auto-size and offset neon signs by:
   - promotion strength
   - crowding density
   - neighborhood dominance logic
4. Wire hierarchy + layout engine into map pin refresh pipeline.
5. Wire aggregate pin click to drill-down zoom transitions.
6. Expand Promote Shop add-on catalog metadata to support richer visual ad options.
7. Add unit tests for hierarchy/aggregation/layout behavior.

## Phase 3: Solutioning (No-code decisions)

### Zoom hierarchy (automation)
- Level 1 (`zoom >= 14.8`): render individual neon signs for every venue in viewport.
- Level 2 (`9.2 <= zoom < 14.8`): render giant pins aggregated by zone.
- Level 3 (`zoom < 9.2`): render giant pins aggregated by province across Thailand.

### Drill-down behavior
- Click province giant pin: zoom into zone level.
- Click zone giant pin: zoom into detail level.

### Enterprise ad/layout rules
- Parse promotion priority from `pin_metadata.features` and runtime boost flags.
- Compute per-pin `sign_scale` automatically.
- For dominant promoted signs, shrink nearby neighboring signs automatically.
- Compute small deterministic `sign_nudge_x/y` offsets in dense areas to prevent total overlap while preserving true geographic anchor.

### Success criteria
- No manual layout tuning required when new shops are inserted.
- Zoom transitions are deterministic and stable.
- Promoted venues become visually dominant without hiding nearby venues.
- Unit tests validate hierarchy and automation rules.
- Province level must query and render Thailand-wide data, not just current viewport bounds.

## Phase 4: Implementation Checklist
- [x] Utilities implemented
- [x] Map integration complete
- [x] Promote add-on metadata expanded
- [x] Tests added and passing
- [x] `bun run check`
- [x] `bun run build`
- [ ] `python .agent/scripts/checklist.py .` (blocked by pre-existing repo lint gate failures unrelated to this task)
- [x] `python .agent/scripts/checklist.py .`
