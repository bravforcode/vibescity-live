# PLAN: Database Scaling & Missing Features

## Context
**Goal:** Maximize database stability, speed, and completeness. Focus on Indexing, Push Notifications, Report/Moderation systems, and long-term scalability planning.
**Mode:** PLANNING ONLY (no code)

---

## 🧠 Brainstorming Options (Database Architect & DevOps)

### Option A: Standard MVP Integration
- **Notifications:** Simple `user_devices` & `notifications` tables.
- **Moderation:** Basic `reports` & `user_blocks` tables.
- **Indexing:** B-Tree on FKs, GiST on spatial, GIN on jsonb.
- **Pros:** Fast to execute, easy to manage.
- **Cons:** Will slow down when notification records reach tens of millions.

### Option B: Scalable & Partitioned Architecture (✨ Recommended)
- **Notifications:** `user_devices` + `notifications` (Using PostgreSQL Table Partitioning by Month to handle massive volume).
- **Moderation:** polymorphic `reports` with specific FKs, `moderation_logs` for audit trails, and `user_blocks`.
- **Indexing:** Targeted partial indexes (e.g., `WHERE status = 'pending'`), GiST for maps, GIN for metadata, plus `pg_cron` for auto-cleanup.
- **Pros:** Enterprise-grade scalability, always fast query times.
- **Cons:** Slightly more complex setup.

### Option C: Event-Sourced approach
- **Architecture:** Offload notifications to Redis/NoSQL or third-party (Firebase completely), append-only logs for moderation inside Postgres.
- **Pros:** Ultimate read/write separation.
- **Cons:** Too complex, introduces new infrastructure outside of Postgres.

---

## 🤔 Phase 0: Socratic Gate (Need User Answers)
1. **Push Provider:** Are you using Firebase (FCM), OneSignal, or custom APNs/WebPush for Push Notifications?
2. **Moderation Rules:** Should a Venue or Review be auto-hidden if it receives X number of reports? What entities can be reported (Venues, Users, Reviews, Photos)?
3. **Data Retention:** Keep notifications/logs forever, or auto-delete messages older than 30-60 days to save database space?
4. **Current Infra:** Are you using Supabase, Neon, or raw bare-metal Postgres?

---

## 📋 Task Breakdown (Pending Approval)

### Phase 1: Comprehensive Indexing (Stability & Speed)
- [ ] Add B-Tree Indexes on all Foreign Keys (e.g., `user_id`, `venue_id`).
- [ ] Add GiST Indexes for Spatial columns (`local_ads.location`, `venues.location`).
- [ ] Add GIN Indexes for JSONB metadata.
- [ ] Add Partial Indexes for high-traffic queries.

### Phase 2: Push Notification System
- [ ] Create `user_devices` table.
- [ ] Create `notifications` table (Partitioned strategy).

### Phase 3: Moderation & Trust System
- [ ] Create `reports` table.
- [ ] Create `moderation_logs` table.
- [ ] Create `user_blocks` table.

### Phase 4: Long-term Scalability & Security
- [ ] Apply RLS (Row Level Security) if using Supabase/Neon.
- [ ] Implement query optimization and archiving jobs (`pg_cron`).
