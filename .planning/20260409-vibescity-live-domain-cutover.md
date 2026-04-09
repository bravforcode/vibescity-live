## Goal
Deploy the current latest VibeCity build to the production domain `vibescity.live` and make the app metadata/runtime defaults point to that root domain.

## Scope
- in: frontend/public domain references, production build verification, Vercel production deploy
- out: payment/Stripe redirects, auth/RLS, schema/migrations, registrar-level DNS outside current Vercel-controlled records

## Agent(s)
devops/front-end deployment flow

## Steps
1. Update safe frontend/public references from `https://vibecity.live` to `https://vibescity.live`.
2. Build and validate the changed files.
3. Deploy production to the Vercel project that currently owns `vibescity.live`.
4. Verify HTTP headers/meta/redirect behavior on `https://vibescity.live` and `https://www.vibescity.live`.

## Success criteria
- [ ] root metadata/canonical/share links use `https://vibescity.live`
- [ ] production build succeeds
- [ ] production deployment is ready on the live Vercel project
- [ ] `www.vibescity.live` resolves/redirects to `https://vibescity.live`

## Risks
- Existing payment/backend references still use `vibecity.live`: left untouched because payment is out of scope and hard-stop sensitive.
- Vercel project/domain ownership may differ from historical memory: verify live target before and after deploy.

## Rollback
Revert the frontend/public domain-reference patch and redeploy the previous production build.