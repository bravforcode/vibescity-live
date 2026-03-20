# Admin Dashboard + Fallback Cache Persistence + Phase 12 Map Optimization

## Goal
Run `GET /admin/dashboard` validation first, add durable fallback cache persistence for Redis outages, and finish high-impact Phase 12 map optimization hardening.

## Tasks
- [ ] Add/verify backend test coverage for `GET /api/v1/admin/dashboard` (admin-authenticated path first)
- [ ] Add fallback cache persistence test coverage (TTL + restart-safe disk restore behavior)
- [ ] Implement persistent fallback cache in `backend/app/services/cache/redis_client.py`
- [ ] Fix Phase 12 verification script correctness issues in `scripts/verification/phase12-verification.mjs`
- [ ] Run targeted test commands and report outcomes

## Done When
- [ ] `GET /admin/dashboard` behavior is tested and passing
- [ ] Fallback cache survives process restart via disk persistence and respects expiration
- [ ] Phase 12 verification script runs without obvious runtime reference/path bugs
- [ ] Targeted tests pass in local run
