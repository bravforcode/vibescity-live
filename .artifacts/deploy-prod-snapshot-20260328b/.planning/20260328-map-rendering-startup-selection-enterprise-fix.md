# 2026-03-28 Map Rendering + Startup Selection Enterprise Fix

## Root Cause
- Localhost map bootstrap forced `vibecity-localhost.json`, which is a background-only style and cannot render the production basemap.
- Startup centered-card selection reused the explicit detail path, which opened the modal, mutated the route, and applied detail camera offsets too early.
- Camera and popup ownership were split across app logic and `MapLibreContainer`, so popup layout was measured before the final camera state settled.

## Contract
- Localhost default map style mode is `prod`, with `quiet` as an explicit env override.
- Startup and carousel settle use passive preview selection: `card + popup + pin`, no modal, no `/venue/*` route mutation.
- Explicit detail and deeplink use detail selection: modal + route sync + post-camera popup.
- Map layer owns camera flight and popup sequencing for every selection request.

## Acceptance
- `/en` loads a real basemap on localhost default mode and issues basemap resource requests beyond the style JSON.
- Initial centered card keeps the list route, does not open `VibeModal`, and renders an in-viewport popup above the selected pin/sign.
- Repeated carousel or marker selections do not create duplicate popup DOM or concurrent camera fights.
- Deeplink detail keeps modal behavior intact and popup remains inside the safe viewport.

## Validation
- `bun run check`
- `bun run build`
- `bun run test:e2e:map-preflight`
- `bun run test:e2e:smoke-map-lite`
- `bun run test:e2e:mobile-contracts -- --grep \"startup centered\"`
