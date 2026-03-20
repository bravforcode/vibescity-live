# Owner Dashboard And Map Regressions

## Analysis

- `useMapImagePrefetch` returns `prefetchCriticalPins` without importing it, which crashes `MapboxContainer` during `setup()`.
- Owner dashboard API and Supabase fallback still select legacy `venues."Image_URL1"` even though the March 9 migration dropped that column in favor of `image_urls[1]`.
- Dashboard fallback only activates for `404` and network-like errors, so plain backend `5xx` responses can still surface as hard failures.

## Planned Fix

1. Import and re-export `prefetchCriticalPins` correctly in `src/composables/map/useMapImagePrefetch.js`.
2. Update frontend owner fallback queries to use the canonical venue columns and accept backend `5xx` as fallback-eligible.
3. Update `backend/app/api/routers/owner.py` to stop selecting or reading the dropped legacy image column.
4. Run targeted validation for the touched frontend and backend files.
