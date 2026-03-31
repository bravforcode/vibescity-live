# Nationwide Data And Locale Rewrites

## Goal

Ship Thailand-wide buildings, events, and emergency POI datasets from repo-owned sources, and make locale paths `/en` and `/th` resolve cleanly in dev and production.

## In Scope

- Generate nationwide public datasets from `scripts/seed-thailand-master.sql`
- Preserve existing rich building metadata while extending building coverage nationwide
- Replace emergency POI fallback-only behavior with real nationwide POI lookup
- Keep frontend and backend emergency behavior aligned to the same nationwide dataset intent
- Make Rsbuild dev server resolve locale paths directly
- Make production locale rewrites explicit in Vercel config

## Out Of Scope

- Payment, auth, RLS, schema, or new migrations
- Replacing the venue feed with a new nationwide source
- Editing old SQL seed sources beyond consuming them

## Planned Changes

1. Add a sync script that exports nationwide buildings, events, and emergency POIs into `public/data`.
2. Preserve curated building-floor detail data and merge it with nationwide building coverage.
3. Update emergency lookup to use the nationwide dataset with graceful fallback.
4. Align backend emergency endpoints with seeded emergency data instead of live Overpass-only queries.
5. Add locale history fallback to Rsbuild and explicit locale rewrites to Vercel.

## Validation

- `npx biome check <changed files>`
- `npm run build`
- Browser verification on direct paths:
  - `http://localhost:5173/en`
  - `http://localhost:5173/th`
  - `http://localhost:4174/en`
  - `http://localhost:4174/th`
