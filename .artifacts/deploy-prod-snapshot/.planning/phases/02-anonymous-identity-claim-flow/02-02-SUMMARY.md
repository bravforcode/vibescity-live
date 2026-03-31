---
phase: 02-anonymous-identity-claim-flow
plan: "02"
subsystem: database, api
tags: [postgres, supabase, rls, rpc, fastapi, slowapi, rate-limit, gamification, pydantic]

requires: []

provides:
  - "visitor_gamification table (TEXT PK, balance, total_earned) in Supabase"
  - "venue_claims table with UNIQUE(visitor_id, venue_id, claim_date) + date index"
  - "claim_vibe RPC — atomic idempotent coin award via ON CONFLICT DO NOTHING"
  - "get_my_claims RPC — returns today's claimed venue IDs + balance for MAP-02"
  - "POST /v1/gamification/claim — 20/hour IP rate-limited FastAPI endpoint (SAFE-01)"
  - "GET /v1/gamification/my-claims — 30/minute, returns today's claimed venues + balance"

affects:
  - 02-anonymous-identity-claim-flow
  - 03-lucky-wheel-venue-detail-discovery-ux
  - frontend-claim-flow
  - map-marker-glow

tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER RPCs for all visitor data access (no direct anon table access)"
    - "ON CONFLICT DO NOTHING + GET DIAGNOSTICS ROW_COUNT for atomic idempotency (reliable across Postgres versions)"
    - "IP extraction via x-forwarded-for/x-real-ip with SHA-256 hash before logging"
    - "Pydantic Field max_length for all user-supplied string inputs"

key-files:
  created:
    - backend/db/migrations/002_visitor_gamification.sql
    - backend/app/api/routers/gamification.py
  modified:
    - backend/app/main.py

key-decisions:
  - "Rate limit set to 20/hour (not 5/hour) for NAT/shared-IP in hotels and cafes — per research pitfall #6"
  - "GET DIAGNOSTICS ROW_COUNT used instead of NOT FOUND after INSERT ON CONFLICT — more reliable across Postgres versions"
  - "SECURITY DEFINER on RPCs — visitor data accessed only via service_role, anon clients never touch tables directly"
  - "RLS enabled on both tables with service_role full-access policy — tables locked down, RPCs are the only entry point"

patterns-established:
  - "Gamification endpoints: follow payments.py pattern for IP extraction + hash"
  - "All visitor coin operations go through claim_vibe / get_my_claims RPCs, never direct table writes"

duration: 2min
completed: 2026-03-22
---

# Phase 2 Plan 02: Backend Gamification Infrastructure Summary

**Supabase visitor_gamification + venue_claims tables, atomic claim_vibe RPC with ON CONFLICT idempotency, and FastAPI /v1/gamification endpoints with 20/hour IP rate limiting**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T08:28:43Z
- **Completed:** 2026-03-22T08:30:19Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- SQL migration ready to run in Supabase SQL Editor: two tables, two RPCs, RLS policies, and an index
- claim_vibe RPC atomically awards 10 coins using UNIQUE constraint + ON CONFLICT DO NOTHING (GAME-01, GAME-02 satisfied)
- FastAPI gamification router with POST /claim (SAFE-01: 20/hour per IP) and GET /my-claims for MAP-02 glow ring sync

## Task Commits

Each task was committed atomically:

1. **Task 1: Supabase migration — visitor_gamification + venue_claims + RPCs** - `47568a6` (feat)
2. **Task 2: FastAPI gamification router + main.py registration** - `84bee2f` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `backend/db/migrations/002_visitor_gamification.sql` — Full migration: tables, index, RLS, claim_vibe and get_my_claims RPCs
- `backend/app/api/routers/gamification.py` — Rate-limited gamification router (POST /claim 20/hr, GET /my-claims 30/min)
- `backend/app/main.py` — Added gamification import and include_router at /v1/gamification

## Decisions Made

- **Rate limit 20/hour (not 5/hour):** Research pitfall #6 flags shared NAT in hotels/cafes. 5/hour would lock out entire hotel guests sharing one IP. 20/hour still protects against abuse while staying UX-friendly.
- **GET DIAGNOSTICS ROW_COUNT over NOT FOUND:** PostgreSQL documentation notes that NOT FOUND is unreliable after INSERT ON CONFLICT DO NOTHING in some versions. ROW_COUNT = 0 is the canonical check.
- **SECURITY DEFINER RPCs:** Anonymous clients never read/write gamification tables directly. All paths go through SECURITY DEFINER functions called via service_role from FastAPI. This enforces business logic at the database layer.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. One pre-existing warning about `backend/.env.slowapi` config file not found appears on import — this is expected (the file is used by slowapi's Config, not required for the limiter to function). The limiter imported and operated correctly.

## User Setup Required

**Supabase migration must be manually executed.** To activate the gamification tables and RPCs:

1. Open Supabase Dashboard > SQL Editor > New Query
2. Paste and run: `backend/db/migrations/002_visitor_gamification.sql`
3. Verify in Table Editor that `visitor_gamification` and `venue_claims` tables appear
4. Verify in Database > Functions that `claim_vibe` and `get_my_claims` appear

No new environment variables required — the router uses the existing `SUPABASE_SERVICE_ROLE_KEY` via `supabase_admin`.

## Next Phase Readiness

- Backend claim infrastructure is complete (GAME-01, GAME-02, SAFE-01, MAP-02 backend side)
- Plan 02-01 (consent/identity frontend) provides the `visitor_id` that this backend consumes
- Plan 02-03 (frontend claim flow) can now wire `useClaimVibe` composable against POST /v1/gamification/claim
- Plan 02-04 (MAP-02 glow ring) can call GET /v1/gamification/my-claims on page load

---
*Phase: 02-anonymous-identity-claim-flow*
*Completed: 2026-03-22*

## Self-Check: PASSED

- FOUND: backend/db/migrations/002_visitor_gamification.sql
- FOUND: backend/app/api/routers/gamification.py
- FOUND: backend/app/main.py
- FOUND: .planning/phases/02-anonymous-identity-claim-flow/02-02-SUMMARY.md
- FOUND commit: 47568a6 (feat(02-02): add visitor gamification + venue claims SQL migration)
- FOUND commit: 84bee2f (feat(02-02): add gamification router with rate-limited claim endpoint)
