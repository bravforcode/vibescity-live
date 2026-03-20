# Desktop Responsive + Nationwide Giant Pin Production Audit

## Goal

Improve the desktop experience, make the right-side venue panel more usable, and add a zoom hierarchy where very low zoom collapses nationwide neon pins into one Thailand giant pin before progressively splitting into province, zone, and venue-level signs.

## Scope

- Improve desktop map/panel proportions and right-rail readability
- Optimize desktop venue cards for denser scanning
- Wire a real zoom hierarchy into the active map pin refresh path
- Use server-backed province aggregate data for low-zoom map rendering
- Keep existing detail neon sign behavior at high zoom
- Audit production venue admin coverage across Thailand provinces and districts

## Zoom Behavior

- `zoom < country threshold`: render one Thailand giant pin
- `country threshold <= zoom < province threshold`: render province giant pins
- `province threshold <= zoom < detail threshold`: render zone/district aggregate pins
- `zoom >= detail threshold`: render normal neon venue signs

## Drill-down Behavior

- Click Thailand giant pin: zoom into province view
- Click province giant pin: zoom into zone view
- Click zone giant pin: zoom into detailed neon sign view

## Success Criteria

- Desktop layout feels balanced on large screens and wastes less side-panel space
- Venue list is denser and easier to scan on desktop
- Very low zoom never floods the map with individual signs
- Zoom transitions feel progressive instead of abrupt
- Aggregate pin clicks drill down instead of opening the normal venue flow
- Production audit clearly states whether Thailand-wide province and district coverage is complete

## Risks

- Province aggregates can be server-accurate while district normalization in the underlying venue data is still incomplete
- Existing map styles and overlay layers must continue to work with aggregate features
- The repo has many unrelated dirty files, so edits must stay tightly scoped
