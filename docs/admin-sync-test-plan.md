# Venue Status Sync Test Plan (Google Sheets → DB)

## 1. Prerequisites
- [x] `admin-sheet-sync` Supabase Edge Function is deployed.
- [x] Spreadsheet ID is correctly set in environment variables.
- [x] `pg_cron` is scheduled to run every 30 minutes.

## 2. Test Cases

| Case | Venue ID | Current Status (DB) | Target Status (Sheets) | Start Time | Sync End Time | Expected Outcome (DB) | Actual Result |
|------|----------|---------------------|-------------------------|------------|---------------|-----------------------|---------------|
| #1   | [TBD-1]  | `pending`           | `active`                |            |               | Status updated to `active` + `is_verified=true` + User rewarded |               |
| #2   | [TBD-2]  | `active`            | `archived`              |            |               | Status updated to `archived` |               |
| #3   | [TBD-3]  | `archived`          | `active`                |            |               | Status updated to `active` |               |

## 3. Verification Protocol
1.  Identify 3 venues in the database for testing.
2.  Update their statuses in the `Venues` worksheet of the Google Spreadsheet.
3.  Note the **Start Time**.
4.  Wait for the next sync cycle (up to 30 minutes).
5.  Run SQL query: `SELECT id, name, status, is_verified FROM public.venues WHERE id IN (...)` to verify DB updates.
6.  Check `sheet_sync_runs` table for successful execution: `SELECT * FROM public.sheet_sync_runs ORDER BY started_at DESC LIMIT 1`.

## 4. Pass Criteria
- [ ] All 3 cases show correct status updates in the database.
- [ ] Sync latency is <= 30 minutes.
- [ ] No errors reported in `sheet_sync_runs` for the successful cases.
