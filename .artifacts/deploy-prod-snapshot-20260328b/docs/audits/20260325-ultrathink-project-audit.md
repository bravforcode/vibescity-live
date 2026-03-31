# VibeCity Ultrathink Project Audit

Date: 2026-03-25

Scope: repo health, architecture, frontend, backend, data, security, observability, performance, testing, CI/CD, documentation, and imported skills integration.

This audit is grounded in the current repo state, including:

- `git status --short` reporting `5699` lines
- `24` unmerged paths in the active worktree
- `94` SQL files under `supabase/migrations`
- multiple deployment surfaces: Vercel, Render, Fly, Docker Compose, Supabase Edge Functions
- newly imported external skills under `skills/` and `.agents/skills/`

## Highest Priority

1. Resolve the `24` unmerged files before any feature work continues, because current branch state makes every validation result suspect.
2. Reduce the `5699` status lines to a controlled change set, or split the current work across worktrees and topic branches.
3. Fix the Vercel Python entrypoint at `api/index.py`, because the file currently contains only comments and does not expose an `app`.
4. Choose one authoritative deployment path for the API, because Vercel, Render, and Fly config all exist and can drift independently.
5. Choose one authoritative frontend build tool, because both `rsbuild.config.ts` and `vite.config.js` define overlapping build, PWA, and split-chunk behavior.
6. Audit every Supabase Edge Function with `verify_jwt = false` in `supabase/config.toml`, especially admin-related functions.
7. Remove `unsafe-eval` and plan removal of `unsafe-inline` from the CSP in `vercel.json`.
8. Reconcile `.gitignore` and `.vercelignore` with actual deploy behavior, because the current ignore rules can hide important source or ship stale assumptions.
9. Stop using a dirty workspace as the main release lane; use clean release worktrees for deployable changes.
10. Create a release freeze on schema/auth/payment changes until the merge-conflict state is cleared.

## Repo Health And Change Management

11. Add a hard CI gate that fails on unmerged files or conflict markers before any other job runs.
12. Add a `scripts/ci/check-merge-conflicts.*` check and wire it into `.github/workflows/ci.yml`.
13. Move one-off root diagnostics like `*_errors.txt`, `tmp_*.json`, and ad hoc SQL probes fully under `reports/` or `tmp/`.
14. Separate generated operational artifacts from authored code; the root currently mixes both heavily.
15. Stop treating the main worktree as a scratchpad and use named worktrees for spikes, deploy syncs, and experiments.
16. Add a `CODEOWNERS` file for `src/`, `backend/`, `supabase/`, `.github/workflows/`, and `docs/`.
17. Add PR labels and branch naming rules aligned with the imported `git-workflow` skill.
18. Add a required PR template file under `.github/pull_request_template.md`.
19. Standardize planning files; today `task.md`, `.planning/*`, and other ad hoc notes overlap.
20. Add a repo policy that generated dashboards, snapshots, and diagnostics are never committed without explicit reason.
21. Move the Antigravity Kit under `.agent/` into a dedicated vendor or toolkit directory if it is not part of product source.
22. Add a manifest that explains which directories are product code versus operator tooling.
23. Create a cleanup pass for stale root files before the next release branch is cut.
24. Enforce changelog and rollback notes for release-bound work, not only commit messages.
25. Add a formal “clean release worktree” runbook and make it part of deploy procedure.

## Frontend Architecture

26. Decide whether Rsbuild or Vite is the canonical frontend toolchain and retire the other or document it as secondary.
27. Remove PWA duplication; `rsbuild.config.ts` injects Workbox while `vite.config.js` also configures `VitePWA`.
28. Remove sitemap generation drift; if Rsbuild is canonical, the sitemap rules in `vite.config.js` are dead or misleading.
29. Remove bundle splitting drift; both configs define chunking strategies with different vendor buckets.
30. Replace broad JavaScript usage with gradual TypeScript conversion in high-risk areas such as map, API, and stores.
31. Turn `strict` on in `tsconfig.json` behind staged adoption, because `strict: false` hides real defects.
32. Turn `checkJs` on selectively for critical JS modules during migration.
33. Re-enable Biome rules for unused imports and unused variables, at least in changed files.
34. Narrow `biome.json` includes so linting does not accidentally scan generated or irrelevant files.
35. Document which config owns aliases for `@`, because alias behavior is currently duplicated across tools.
36. Split the map subsystem into a documented module boundary instead of many cross-calling composables and utilities.
37. Add architecture docs for `src/composables/map`, `src/components/map`, and `src/utils/map*` ownership.
38. Reduce top-level bootstrap weight in `src/main.js` by moving optional startup work behind route or feature boundaries.
39. Add route-level code splitting for admin and dashboard-heavy views if not already enforced.
40. Consolidate service worker sources; the repo contains `public/sw.js` and `src/sw.js`, which is easy to drift.
41. Add an explicit source-of-truth for runtime env flags instead of scattered `import.meta.env` reads.
42. Move feature-flag governance from code-only into a documented lifecycle with owners and sunset dates.
43. Audit public `VITE_*` variables for accidental frontend exposure of internal behavior toggles.
44. Add a central app-shell loading strategy so fallbacks, skeletons, and map preview mode behave consistently.
45. Expand Storybook or a similar catalog for the design-system primitives used across drawers, banners, cards, and dialogs.
46. Create an accessibility review for overlay components such as `FilterMenu.vue`, `SidebarDrawer.vue`, `VibeModal.vue`, and bottom sheets.
47. Add keyboard navigation and focus return tests for drawers, sheets, and modal flows.
48. Add a single routing/meta head strategy instead of mixing SEO rewrites, prerender scripts, and client routing assumptions.
49. Remove or rewrite generic “God Mode / Singularity” quickstart language in `QUICKSTART.md`, because it does not describe the current repo accurately.
50. Add a canonical frontend folder map to the README for new contributors.

## Map, UX, And Frontend Runtime

51. Freeze map feature expansion until the merge conflicts in `MapboxContainer.vue`, `useMapCore.js`, `useMapLayers.js`, and `useMapMarkers.js` are resolved.
52. Write an ADR for `preview` versus `webgl` local renderer mode so future contributors know why preview-first is the default.
53. Add a map-specific error budget and SLOs around boot success, time to interactive, and recovery from WebGL loss.
54. Introduce typed event contracts for map lifecycle telemetry instead of stringly-typed event names.
55. Add route guards that prevent heavy dashboard/map subsystems from loading when unsupported or not needed.
56. Validate that map-specific CSS is not split across duplicate files such as `src/assets/map-atmosphere.css` and `src/styles/map-atmosphere.css`.
57. Add screenshot baselines specifically for map preview mode and full WebGL mode.
58. Add a documented matrix for local dev lanes: frontend-only, backend-connected, map-required, and production-like.
59. Add a front-end `ErrorBoundary` usage audit so newly added fallback components are actually mounted in critical trees.
60. Review admin dashboard component sprawl and move low-value variants or old backups like `SmartHeader_old.vue` and `HomeView_old.vue` out of product paths.

## Backend And API

61. Fix `api/index.py` so Vercel can actually serve the FastAPI app if that path remains supported.
62. Document whether Vercel API is still active; if not, remove or archive the Vercel Python entrypoint entirely.
63. Reduce CORS sprawl in `backend/app/main.py`; local dev origins are always appended even for non-local deployments.
64. Replace `allow_headers=["*"]` with an explicit allowlist in production.
65. Split background worker behavior out of FastAPI lifespan if it should scale independently of the API process.
66. Move `triad_reconcile.run_forever()` to a dedicated worker lane or scheduler service if it is operationally important.
67. Add bounded timeouts for readiness checks so degraded dependencies do not hang health endpoints.
68. Add per-check timing and failure detail to health responses for easier diagnosis.
69. Standardize API error envelopes across all routers.
70. Add response models everywhere practical so OpenAPI output becomes trustworthy.
71. Generate frontend API types from a stable deployed OpenAPI contract in CI, not only from a local backend.
72. Replace static backend `VERSION = "0.1.0"` with build metadata from git tag or release version.
73. Add contract tests per router group: admin, analytics, owner, partner, payments, places, shops, visitor, and vibes.
74. Make request size limiting more robust than `Content-Length` alone; chunked uploads bypass that check.
75. Add rate-limit policy docs by endpoint category rather than a single global interpretation.
76. Add explicit authn/authz documentation for admin, owner, partner, and visitor lanes.
77. Add an internal/public API boundary so admin or backoffice contracts are not mixed with public mobile/web contracts.
78. Publish an API capability matrix showing which routes are frontend-only safe, authenticated, admin-only, or partner-only.
79. Add backend structured logging tests that assert `request_id`, `path`, and status fields are always present.
80. Add backend docs for failure domains: Supabase, Redis, Qdrant, analytics buffer, and long-running jobs.

## Data, Migrations, And Supabase

81. Re-baseline the migration story; `94` SQL files with many hotfix-style names indicate operational debt.
82. Create a migration catalog that groups files by feature area, risk level, and rollback path.
83. Add a “squash point” strategy after major stable releases so new environments do not replay dozens of hotfix migrations.
84. Require benchmark notes for migrations with names indicating performance tuning, timeout fixes, or index rewrites.
85. Add machine-readable metadata for each migration: destructive, idempotent, backfill, online-safe, requires lock, requires manual verify.
86. Consolidate similarly named map/feed/search hotfix migrations into documented historical bundles.
87. Add drift detection between local migrations and deployed Supabase schema as a CI job.
88. Add a schema snapshot artifact per release tag for fast diffing during incidents.
89. Create a rollback playbook for the recent commerce/authenticated select restore migration before it is promoted broadly.
90. Review all migrations touching payment or RLS under a dedicated security checklist.
91. Add automated EXPLAIN benchmarking for the heavy RPCs that power map and feed cards.
92. Separate analytics retention and TTL policies into clearly named migrations or scheduled jobs.
93. Add ownership on every Supabase function and migration path, not only app code.
94. Add preflight validation that every Edge Function with `verify_jwt = false` has an explicit reason documented.
95. Review whether admin dashboards truly need JWT-disabled functions or should use service-to-service auth with signed internal tokens.
96. Add contract tests for Supabase function auth behavior.
97. Create an environment matrix for Supabase branches, local DB, staging, and production.
98. Stop mixing schema optimization, feature rollout, and emergency hotfixes in the same migration wave.
99. Add a data dictionary for key tables used by frontend map, feed, ads, subscriptions, and gamification.
100. Document a safe replay plan for Thailand data curation/injection scripts that already exist in the repo.

## Security

101. Remove `unsafe-eval` from `vercel.json` CSP unless there is a documented, actively required dependency.
102. Plan nonce- or hash-based replacement for `unsafe-inline` in script handling.
103. Narrow `connect-src` in CSP so it matches only actual production origins and approved observability endpoints.
104. Reconcile security headers between Vercel, backend, and any proxy layer so policies do not diverge by host.
105. Review all `verify_jwt = false` entries in `supabase/config.toml`; admin functions are the biggest risk concentration.
106. Remove the hardcoded real-looking email default in `backend/app/core/config.py` for `ADMIN_EMAIL_ALLOWLIST`.
107. Fix `.env.example` because `REDIS_URL=\"redis://...\"/0\"` is malformed and can mislead setup or automation.
108. Remove `VITE_ADMIN_EMAIL_ALLOWLIST` from `.env.example`; admin allowlists should not be treated as public frontend config.
109. Review `VITE_PII_AUDIT_ENABLED` and similar public flags to ensure sensitive behavior is not discoverable or controllable from the client.
110. Add dependency review automation for JavaScript and Python ecosystems.
111. Generate an SBOM for release artifacts.
112. Add provenance or signed artifact verification for release builds where possible.
113. Promote gitleaks and other secret scans to required checks on all PRs.
114. Add secret-scope documentation showing which env vars are frontend-public, server-only, edge-only, or CI-only.
115. Add explicit CSRF or checkout-origin tests for payment-related flows.
116. Add SSRF-safe outbound URL allowlists for backend integrations if any user-controlled fetch paths exist.
117. Ensure metrics exposure is deny-by-default when `METRICS_AUTH_TOKEN` is missing in production.
118. Add security reviews for the YouTube and Google Places client keys currently supported in frontend config.
119. Add log/telemetry redaction tests so PII and secrets never land in analytics, traces, or logs.
120. Add a security change checklist to release PRs for auth, payment, headers, CSP, and edge-function auth modes.

## Observability And Monitoring

121. Turn the `observability/` directory from “available stack” into “verified, reproducible operator flow” with owner and runbooks.
122. Add real alert rules to source control, not only dashboards and configs.
123. Add SLOs for API availability, map boot success, feed response latency, and admin dashboard freshness.
124. Propagate request correlation from frontend to backend and then into logs, metrics, and traces.
125. Expose a trace or correlation header back to the browser so frontend bug reports can be stitched to backend logs.
126. Add deployment annotations into Grafana/Tempo/Loki so regressions can be traced to releases.
127. Add dashboards for map renderer mode, WebGL recovery count, and fallback usage.
128. Add business metrics for venue card impressions, interaction funnels, and payment funnel outcomes with clear privacy boundaries.
129. Add synthetic monitoring for public landing routes, API health, and critical partner/owner flows.
130. Add dead-man alerts for scheduled jobs such as sync or reconcile loops.
131. Add error-budget burn alerts rather than only static threshold alerts.
132. Validate OTEL exporter connectivity in CI or staging, not only at runtime.
133. Promote `frontendObservabilityService` from fire-and-forget best-effort events into a documented event contract.
134. Add log retention and cost controls for Loki/Promtail if the observability stack is meant to run long term.
135. Create incident runbooks for tracing, metrics, and logs that reference actual repo scripts and dashboards.

## Performance

136. Use the imported `performance-profiling` skill to establish a single baseline suite for frontend, backend, and database.
137. Define explicit performance budgets for LCP, INP, CLS, JS bundle size, API p95, and map boot time.
138. Make those budgets required CI checks rather than optional reporting.
139. Audit `vite.config.js` because `visualizer({ open: true })` is not suitable for unattended CI or production builds.
140. Validate that MapLibre and other large chunks are split consistently under the active bundler only.
141. Remove dead bundler plugins so the active build graph stays understandable.
142. Add memory profiling around map mount/unmount loops to catch retained listeners and WebGL resources.
143. Benchmark admin dashboard bundle cost separately from public home experience.
144. Add image/media performance rules for venue video and gallery assets.
145. Add a service-worker cache audit so dynamic data, videos, and map assets follow intentional policies.
146. Add backend p95 and p99 latency breakdowns by route template.
147. Benchmark readiness checks so health endpoints remain cheap.
148. Add a map-specific device matrix benchmark for low-memory Android and iOS Safari paths.
149. Add server-side cache hit metrics for Redis-backed flows if Redis is required in production.
150. Publish before/after performance reports for every map/feed optimization wave instead of only code diffs.

## Testing And Quality

151. Expand frontend unit tests beyond the current small set in `tests/unit/`.
152. Add unit tests for runtime config, feature flags, offline queueing, and critical stores.
153. Add API contract tests between frontend clients and backend OpenAPI responses.
154. Add a merge-conflict detection test to CI before lint, build, or e2e.
155. Add snapshot or golden tests for critical locale files once merge conflicts are resolved.
156. Add auth and edge-function integration tests for disabled-JWT admin paths.
157. Add migration smoke tests per PR for the subset of changed SQL files.
158. Add a deterministic smoke suite for the Vercel entrypoint path if Vercel remains supported.
159. Add a required “prod-ready gate” job instead of only keeping the script in `scripts/ci/prod-ready-gate.mjs`.
160. Add accessibility checks into the regular CI lane for critical views.
161. Add a dashboard visual regression suite to complement existing map and card screenshots.
162. Add property-based tests or fuzz cases for URL, locale, and analytics payload sanitizers.
163. Add load-test baselines to PRs for routes that have recent performance migrations.
164. Standardize package manager usage in test jobs; CI uses `npm install` while local docs and scripts center around Bun.
165. Add cross-environment smoke tests for frontend-only dev, full-stack dev, preview, and production URLs.

## CI, Delivery, And Deployment

166. Choose one package manager for CI and local workflows; `bun.lock` and `package-lock.json` together create drift.
167. If Bun is primary, switch CI installs to Bun and cache Bun dependencies explicitly.
168. If npm is primary, stop asking contributors to rely on Bun-first commands in docs and scripts.
169. Add workflow concurrency cancellation so superseded PR runs are automatically aborted.
170. Add required-status policy for the most important jobs rather than letting the workflow list grow without hierarchy.
171. Group workflows into core CI, scheduled audits, and deployment workflows with consistent naming.
172. Remove or archive stale workflows that no longer match the chosen hosting strategy.
173. Add a deploy matrix doc mapping which workflow publishes to which environment and host.
174. Reconcile `.vercelignore` with current Vercel deployment assumptions; ignoring `backend/`, `docs/`, `scripts/`, and `supabase/` can mask real deploy needs.
175. Add CI validation that `vercel.json`, `render.yaml`, and `fly.toml` do not contradict each other on ports, health paths, and entrypoints.
176. Add preview environment smoke tests for PRs, not only push-to-main flows.
177. Automate changelog generation using the imported `git-workflow` skill guidance.
178. Add release tags and release notes as first-class outputs of deploy workflows.
179. Add rollback automation or at least rollback command snippets per platform.
180. Add environment contract tests so required secrets are validated before deploy jobs start.

## Documentation, DX, And Skills

181. Expand `README.md` beyond the current minimal intro into architecture, deploy topology, and dev-lane docs.
182. Rewrite `QUICKSTART.md` so it describes this repo’s actual workflows instead of generic AI-agent language.
183. Document the difference between `.agent/` and `.agents/` so contributors understand which system is active where.
184. Add a “repo topology” doc for frontend, backend, Supabase, observability, and workflows.
185. Document local environment variables by owner, exposure level, and default host.
186. Add a supported-platforms doc covering Windows PowerShell, WSL, and CI Linux.
187. Add a `docs/skills/` index, which now exists for imported external skills and should be extended for existing repo skills later.
188. Add validation for imported skills so missing `SKILL.md` or broken references are caught in CI.
189. Decide whether imported external skills should eventually be promoted into `.agent/skills/` under non-colliding names.
190. Add ADRs for bundler choice, deployment host choice, Edge Function auth policy, and observability stack choice.
191. Add a generated-files policy covering reports, snapshots, dashboards, and downloaded assets.
192. Add a contributor guide for safe work in dirty or multi-worktree repositories.
193. Add a script inventory doc so operators know which `scripts/ci/*.mjs` are authoritative versus legacy.
194. Add a dev command matrix that maps `bun run ...`, `npm run ...`, backend commands, and Supabase commands in one place.
195. Keep `scripts/import_external_skills.ps1` documented and parameterize it later so it no longer depends on a specific Downloads path.

## Suggested Execution Order

196. First stabilize repo state: resolve conflicts, reduce the dirty tree, and repair entrypoints.
197. Then rationalize deployment and build ownership: one frontend build path and one primary hosting path per surface.
198. Next close security gaps: Edge Function auth review, CSP tightening, env hygiene, and admin exposure cleanup.
199. Then make observability and performance measurable with budgets, SLOs, and dashboards tied to the active deploy path.
200. Finally improve long-tail DX: docs, skills promotion, migration cataloging, and workflow automation.
