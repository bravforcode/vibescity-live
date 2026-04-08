## Goal
Deploy the current web app to a live preview URL and hand the user a working link.

## Scope
- in: verify current Vercel deploy contract, patch deploy-blocking config, run a fresh preview deploy, capture the URL
- out: payment/auth/schema changes, production promotion, broad refactors

## Agent(s)
devops/deployment lane because the task is deployment-focused and should minimize product-code churn

## Steps
1. Audit the active Vercel contract and local build prerequisites in `package.json`, `vercel.json`, `.vercelignore`, and `api/index.py`
2. Patch only the files that block preview deployment from the current workspace
3. Run local validation gates relevant to deployment readiness
4. Create a fresh Vercel preview deployment and record the URL
5. Update session memory if the stable deploy baseline changes

## Success criteria
- [ ] local deploy-readiness checks pass or only leave documented warnings
- [ ] preview deployment reaches a ready state
- [ ] a live URL is returned to the user

## Risks
- backend files excluded from Vercel packaging: keep `.vercelignore` aligned with `api/index.py`
- missing environment variables on Vercel: use the already linked project and existing remote config where possible
- dirty worktree noise: keep edits narrowly scoped to deployment files only

## Rollback
Revert any deployment-config edits and redeploy the previous working Vercel build if the preview contract regresses
