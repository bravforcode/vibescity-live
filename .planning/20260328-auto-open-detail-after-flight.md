# 2026-03-28 Auto Open Detail After Flight

## Goal

- auto-open the venue detail modal once when a card-driven map flight finishes
- remember which venues already auto-opened so each venue opens automatically only once
- keep the scope limited to the card flight -> modal handoff only

## Plan

1. Emit a completion signal from the map only after a preview selection flight has fully settled.
2. Gate auto-open in app logic so it only runs for card/startup preview flights and only once per venue.
3. Persist the once-opened venue ids for the current tab session.
4. Validate with focused unit coverage, `biome`, and `build`.
