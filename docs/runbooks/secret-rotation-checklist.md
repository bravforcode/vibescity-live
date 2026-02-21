# Secret Rotation Runbook (Checklist + Owner + Time)

Last updated: 2026-02-11  
Scope: VibeCity FE/BE/Supabase/CI

## Trigger
- Secret leaked in chat, logs, screenshot, commit, or public CI artifact
- Access token shared to non-approved users
- Team member offboarding or role change

## Severity
- `P1`: `service_role`, payment keys, deploy tokens, DB admin keys
- `P2`: public tokens, non-prod keys, analytics keys

## Response SLA
- `P1`: rotate within 15 minutes, complete verification within 60 minutes
- `P2`: rotate within 24 hours

## Roles
- Incident Commander (IC): On-call backend lead
- Security Owner: Platform/SRE lead
- System Owners:
- FE/Vercel owner
- BE/Fly owner
- Supabase owner
- GitHub Actions owner
- Payments owner

## Execution Checklist
Use UTC+7 time for all entries.

| Step | Owner | Due (UTC+7) | Status | Evidence |
|---|---|---|---|---|
| Declare incident channel and assign IC | IC | T+0m | [ ] | Link channel |
| Identify leaked secrets and blast radius | Security Owner | T+5m | [ ] | Incident note |
| Freeze risky operations (optional: deploy/payment ops) | IC | T+10m | [ ] | Decision log |
| Rotate Supabase `service_role` / JWT secrets | Supabase owner | T+15m | [ ] | Dashboard screenshot + timestamp |
| Rotate Fly deploy token (`FLY_API_TOKEN`) | BE/Fly owner | T+15m | [ ] | `fly auth token` rotated |
| Rotate Stripe restricted/secret keys (if exposed) | Payments owner | T+20m | [ ] | Stripe key history |
| Rotate Google service account key(s) | GCP owner | T+20m | [ ] | Key ID diff |
| Update GitHub Secrets (new keys only) | GitHub owner | T+25m | [ ] | Workflow secret list |
| Update Vercel/Fly/Supabase env vars | FE/BE/Supabase owners | T+30m | [ ] | Env diff log |
| Invalidate/revoke old tokens/keys | System owner | T+30m | [ ] | Revocation proof |
| Re-deploy affected services | FE + BE owners | T+40m | [ ] | Deployment links |
| Run smoke checks (`/health`, login, admin, payments) | QA/IC | T+50m | [ ] | Test output |
| Confirm no unauthorized activity since leak | Security Owner | T+60m | [ ] | Audit report |
| Publish incident closure + action items | IC | T+75m | [ ] | Postmortem link |

## Verification Commands
- Frontend smoke: `npm run test:e2e:smoke`
- Unit tests: `npm run test:unit -- --run`
- Lint: `npm run lint`
- Backend health: `GET /health` and `GET /healthz` after deploy

## Audit and Retention
- Save incident timeline in `docs/runbooks/` with date prefix
- Keep rotation evidence for at least 90 days
- Record who accessed PII/admin dashboards during incident window

## Prevention Checklist
| Control | Owner | Frequency | Status |
|---|---|---|---|
| Secret scan in CI (`npm run ci:secret-scan`) | GitHub owner | Every PR | [ ] |
| Rotate `service_role` and deploy tokens | Platform owner | Every 90 days | [ ] |
| Remove plaintext secrets from `.env` sharing flow | Team lead | Immediate | [ ] |
| Enforce least-privilege access for admins | Supabase owner | Monthly | [ ] |
| Validate no secrets in screenshots/docs/chats | All owners | Every release | [ ] |

