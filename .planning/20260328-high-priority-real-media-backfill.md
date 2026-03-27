## Task

Backfill authoritative media for the current `high` priority missing-shop group using only verified venue-owned or authority-backed sources, and keep ambiguous venues hidden.

## Goals

1. Apply real media to the subset of `high` venues that can be verified safely today.
2. Record a production policy for `high` venues that remain source-ambiguous.
3. Keep school/fuel/hospital tails hidden until product explicitly needs them.
4. Leave a reusable curated backfill path in the repo instead of one-off console writes.

## Production Rules

1. No Google Places, Pexels, YouTube search, or any generated/fallback media.
2. Only apply media when the venue has at least one of:
   - verified owned website/social page
   - authority-backed listing page with venue-specific media
3. Do not inject social video URLs unless the frontend can render them safely.
4. If verification is weak or the venue identity is ambiguous, keep the venue hidden.

## High Group Decision

### Apply now

- `02363acb-cf7f-489c-a81e-cfc9badb5108` `Dusita coffee & bakery`
- `01e3a560-6867-41a1-949f-30ebfd43fc0e` `Cool Camping`
- `014e5b26-29ea-4b81-ae62-7df61cbba732` `ชมดาวรีสอร์ท`

### Keep hidden

- `0252d260-e7bb-4072-8653-7448f221fe02` `ผาแดงสปอร์ตคลับ`
- `011690e8-62c4-47ec-9271-91ec64f7a1d5` `Cobra Stone Viewpoint`
- `00853ca7-7d14-49e1-8466-c5b15780977a` `Abacus`
- `00ec1a4f-dbc4-4eb4-a7ce-444ffe5879a6` `Krua Than Khun`

## Deliverables

- `scripts/apply-curated-venue-media.mjs`
- `scripts/manifests/20260328-high-priority-real-media.manifest.json`
- updated follow-up docs and memory

## Validation

1. Dry-run curated script.
2. Apply curated backfill.
3. Verify media index count delta and venue-level payloads.
4. Run repo validation gate before close-out.
