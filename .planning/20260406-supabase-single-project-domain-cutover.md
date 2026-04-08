## Goal
Switch VibeCity to a single Supabase project configuration and cut production over to the purchased `vibecity.live` domain on Vercel.

## Scope
- in: normalize tracked env files, update active docs/scripts/tests that still reference the retired Supabase project, update Vercel env variables, deploy production, attach the custom domain
- out: schema changes, auth/RLS policy changes, DNS registrar changes outside Vercel

## Agent(s)
devops/config work across repo and Vercel because this spans environment configuration, deployment, and operational documentation.

## Steps
1. Update tracked env files and active repo references from the retired Supabase project to `rukyitpjfmzhqjlfmbie`.
2. Update Vercel environment variables for production, preview, and development to the same Supabase project.
3. Deploy a fresh production build and attach the current production deployment to `vibecity.live`.
4. Verify production on Vercel aliases and inspect domain verification/DNS status.
5. Record the change in operating memory.

## Success criteria
- [ ] No active runtime/test/doc/script references remain to the retired Supabase project in the main repo paths.
- [ ] Vercel environment variables for active environments point to the same Supabase project.
- [ ] Production deployment is ready and aliased to `vibecity.live`.
- [ ] Validation and smoke checks pass on the production deployment or blockers are documented.

## Risks
- External DNS for `vibecity.live` may still point elsewhere: attach the domain in Vercel and document the exact record still required.
- Secret drift between local env files and Vercel envs: pull production env after updates and verify the Supabase-related keys.

## Rollback
Restore previous env values from Vercel history/local files, remove the custom alias from the new deployment, and redeploy the last known-good production build.
