# 2026-03-27 Real Shop Media API

## Goal

Add API endpoints that expose real shop media for every shop using trusted venue data already present in the system, without introducing fake/generic fallback media.

## Approved Assumptions

- Scope is backend-first: FastAPI routes plus supporting service/tests.
- No schema or migration changes are allowed in this task.
- "Real media" means data tied to the actual venue:
  - `venues.image_urls`, `Image_URL1`, `Image_URL2`
  - `venues.video_url`, `Video_URL`, `cinematic_video_url`
  - approved `venue_photos`
  - direct social/video links already attached to the venue record
- Shops with missing media must still appear in the API response so coverage is complete for all shops.
- Optional Google Places photo lookup may be used only as a venue-tied fallback for a single shop when DB media is missing.

## Scope

- `backend/app/api/routers/shops.py`
- `backend/app/services/venue_media_service.py`
- `backend/app/core/config.py`
- `backend/tests/test_shop_media_api.py`
- `src/services/shopService.js`
- `docs/runbooks/agent-operating-memory.md`

## Implementation Plan

### 1. Create canonical media aggregation service

- Load venue rows from `venues` with safe fallback to `shops` if needed.
- Merge approved `venue_photos` by `venue_id`.
- Normalize media into a stable contract with `images`, `videos`, `media`, counts, and coverage flags.

### 2. Add API endpoints

- `GET /api/v1/shops/media`
  - Returns media coverage for all shops.
  - Supports lightweight pagination controls.
- `GET /api/v1/shops/{shop_id}/media`
  - Returns the normalized media payload for one shop.
  - Optionally hydrates a missing real image from Google Places when available.

### 3. Keep frontend compatibility

- Point the dormant real-media client helper at the new per-shop route.
- Preserve existing frontend media shape expectations.

### 4. Validation

- Add focused backend tests for normalization and endpoint behavior.
- Run targeted backend tests plus lightweight repo validation on changed files.

## Acceptance Criteria

- API returns every shop, including shops with missing media.
- Response distinguishes real images and videos without generic/fake filler.
- Single-shop endpoint returns normalized media suitable for current frontend consumers.
- Tests cover the main contract and pass locally.
