# One-Shot Production Release Runbook (Supabase + Vercel + Railway)

Date baseline: **2026-02-05**

## Scope
- Production rollout in one command with strict gates:
  - Supabase migrations + secrets + Edge Functions
  - Vercel staged deploy + smoke/canary + promote
  - Railway worker/clock deploy
- Safety constraints:
  - isolated worktree
  - backup before DB apply
  - halt on first failed gate
  - auto rollback path for app deploy

## Files introduced for release control
- `scripts/release/prod-one-shot.ps1`
- `scripts/release/config/function-allowlist.json`
- `scripts/release/config/migration-delta-allowlist.txt`
- `scripts/release/config/required-supabase-secrets.txt`
- `backend/constraints-production.txt`
- `supabase/migrations/20260207120000_prod_uuid_unification_delta.sql`

## Required prerequisites
1. Run with **PowerShell 7+** (`pwsh`), not Windows PowerShell 5.
2. Logged in:
   - `vercel login`
   - `railway login`
   - `npx supabase@2.75.4 login`
3. Local repository has the release artifacts listed above.
4. `.env.production.local` exists outside git and contains release secrets.
5. `CANARY_BASE_URL` is set in `.env.production.local` for pre-prod load gate (staged or pre-prod URL).

## Required script parameters
- `-SourceRepo`
- `-ReleaseWorktree`
- `-ProdEnvFile`
- `-SupabaseProjectRef`
- `-SupabaseCliVersion`
- `-VercelProject`
- `-VercelScope`
- `-BackendProvider` (`railway` | `fly` | `none`)
- `-RailwayProjectId` (required when BackendProvider=railway)
- `-RailwayEnvironment` (required when BackendProvider=railway)
- `-RailwayWorkerService` (required when BackendProvider=railway)
- `-RailwayClockService` (required when BackendProvider=railway)
- `-FlyApp` (required when BackendProvider=fly and not DryRunOnly)
- `-FlyConfigPath` (optional, defaults to `fly.toml`)
- `-CanaryVus`
- `-CanaryDuration`
- `-DryRunOnly` (optional)

## Example execution (Fly backend)
```powershell
pwsh -File scripts/release/prod-one-shot.ps1 \
  -SourceRepo "C:\vibecity.live" \
  -ReleaseWorktree "C:\vibecity.live.release\2026-02-05-prod" \
  -ProdEnvFile "C:\secure\.env.production.local" \
  -SupabaseProjectRef "nluuvnttweesnkrmgzsm" \
  -SupabaseCliVersion "2.75.4" \
  -VercelProject "bravforcode-vibescity-live" \
  -VercelScope "team_OZhFXLaozxmZHvJu3NWvyzg9" \
  -BackendProvider "fly" \
  -FlyApp "<fly-app-name>" \
  -FlyConfigPath "fly.toml" \
  -CanaryVus 5 \
  -CanaryDuration "30s" \
  -DryRunOnly
```

## Example execution (Railway backend)
```powershell
pwsh -File scripts/release/prod-one-shot.ps1 \
  -SourceRepo "C:\vibecity.live" \
  -ReleaseWorktree "C:\vibecity.live.release\2026-02-05-prod" \
  -ProdEnvFile "C:\secure\.env.production.local" \
  -SupabaseProjectRef "nluuvnttweesnkrmgzsm" \
  -SupabaseCliVersion "2.75.4" \
  -VercelProject "bravforcode-vibescity-live" \
  -VercelScope "team_OZhFXLaozxmZHvJu3NWvyzg9" \
  -BackendProvider "railway" \
  -RailwayProjectId "<railway-project-id>" \
  -RailwayEnvironment "production" \
  -RailwayWorkerService "worker" \
  -RailwayClockService "clock" \
  -CanaryVus 5 \
  -CanaryDuration "30s" \
  -DryRunOnly
```

## Gate behavior
- Any failed gate stops rollout immediately.
- Secret mismatch fails before migration/deploy.
- Dry-run migration must not include non-allowlisted deltas.
- Vercel promote only occurs after smoke + canary pass.

## Rollback behavior
- If failure occurs **before promote**, production alias is untouched.
- If failure occurs **after promote**, script attempts:
  - `vercel rollback <previous-deployment>`
- If Railway deploy fails, script attempts:
  - `railway down` for affected service(s)
- If Fly deploy fails, script attempts:
  - `flyctl releases rollback -a <fly-app>`
- DB failures are not blindly auto-restored; use backup restore procedure with verification.

## Artifacts generated
- `artifacts/release/<timestamp>/backup_schema.sql`
- `artifacts/release/<timestamp>/backup_data.sql`
- `artifacts/release/<timestamp>/migration_dry_run.log`
- `artifacts/release/<timestamp>/function_*.log`
- `artifacts/release/<timestamp>/vercel_staged_deploy.log`
- `artifacts/release/<timestamp>/release-summary.json`

## Validation checklist after success
- API responds from promoted Vercel deployment.
- Critical flows succeed:
  - checkout session
  - manual order
  - order status
  - admin slip dashboard/export
  - analytics ingest
- Railway worker + clock are healthy in target environment (if using Railway).
- Fly deploy is healthy and running (if using Fly).
