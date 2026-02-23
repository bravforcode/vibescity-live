# SQL Editor Hardening (Safe & Production-Ready)

This is a SQL Editor-first checklist for production hardening. All scripts are
non-destructive (audit/verify) unless explicitly marked as "fix".

## Important Rules
- SQL Editor runs SQL only (tables/functions/policies/migrations).
- Terminal runs CLI only (supabase login/db push/secrets set).
- Do not run schema dumps that include WARNING headers.

## Phase A: Audit (Read-Only)
Run in Supabase SQL Editor:
```
scripts/sql-editor-hardening/phase-a-audit.sql
```

## Phase B: Safe Fixes (Idempotent)
Run only the relevant parts based on Phase A results:
```
scripts/sql-editor-hardening/phase-b-fixes.sql
```

## Phase C: Optional Analytics Partitioning (High Volume)
If analytics event volume is large, run:
```
supabase/migrations/20260206100010_analytics_partition_retention.sql
```

## Phase D: Verify
Run in SQL Editor:
```
scripts/sql-editor-hardening/phase-d-verify.sql
```

## Expected Outcomes
- No SQL errors from CLI commands.
- RLS enabled on critical tables.
- Duplicate checks return 0 rows.
- `public.venues_public` returns rows successfully.
