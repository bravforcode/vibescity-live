# 2026-03-28 Locate Me Camera Remediation

## Goal

- make the locate-me button move the map smoothly toward the real user position
- remove camera ghosting caused by overlapping geolocation and auto-center flows
- keep the scope limited to locate-me camera logic only

## Plan

1. Add a dedicated locate-me camera path that uses smooth `easeTo` instead of the generic map focus flight.
2. Prevent startup auto-center logic from fighting the manual locate-me action.
3. Refresh real location in a staged way: use cached real location immediately when available, then refine once if the browser returns a meaningfully better position.
4. Validate with unit coverage for the new focus behavior plus `biome` and `build`.
