# File Playbooks

## Table Of Contents

1. Frontend Source
2. Backend Source
3. SQL And Migrations
4. Tests
5. Config, CI, And Deploy
6. Scripts And Automation
7. Documentation
8. Assets And Snapshots
9. Skills And Agents

## Frontend Source

Check for:

- component sprawl, mixed responsibilities, or oversized files
- direct side effects in setup/bootstrap paths
- weak loading, empty, and error states
- hardcoded strings instead of i18n
- accessibility gaps in focus, keyboard flow, semantic controls, and reduced motion
- expensive rendering patterns, duplicate network work, or unnecessary reactivity churn
- unsafe HTML, direct DOM mutation, or debug logging left in user-facing paths

Good fixes:

- split orchestration from rendering
- move API calls into services/composables with clear contracts
- add loading and failure fallbacks
- add focused unit or interaction tests

## Backend Source

Check for:

- missing schemas or weak validation
- broad exception handling
- hidden side effects inside route handlers
- missing timeouts, retries, or circuit boundaries for outbound calls
- inconsistent error envelopes
- poor authz separation between public and privileged routes
- missing structured logging and request correlation

Good fixes:

- add explicit request and response models
- move heavy work to workers or background tasks
- replace broad `except` blocks with targeted exceptions
- add deterministic contract tests

## SQL And Migrations

Check for:

- destructive or non-idempotent statements
- missing rollback notes
- risky locks and unbounded backfills
- missing indexes for new access paths
- RLS changes without explicit verification
- mixed concerns in one migration
- comments that do not explain operational risk

Good fixes:

- split schema, backfill, and validation steps
- add `IF NOT EXISTS`, guards, and verification queries
- document rollback and post-deploy checks

## Tests

Check for:

- assertions that are too shallow
- flaky timing, sleeps, or environment dependence
- weak coverage around risky logic
- snapshot noise without intent
- duplicated test setup that hides the real scenario
- tests that only assert implementation details

Good fixes:

- assert user-visible or contract-visible behavior
- remove random timing and stabilize fixtures
- add one focused regression test per important failure mode

## Config, CI, And Deploy

Check for:

- conflicting toolchains or duplicate authorities
- dangerous defaults in production config
- secrets or privileged toggles exposed publicly
- workflows that can drift across hosts
- missing required checks, concurrency, or rollback guidance
- invalid examples in `.env.example` and setup docs

Good fixes:

- choose a single authority per concern
- tighten allowlists, CSP, auth, and workflow gates
- document environment scope and deployment ownership

## Scripts And Automation

Check for:

- destructive behavior without explicit confirmation
- missing logging and exit codes
- brittle path assumptions
- no dry-run mode for high-impact scripts
- generated output mixed with authored source

Good fixes:

- add deterministic output paths
- add dry-run or validate-only modes
- emit machine-readable summaries

## Documentation

Check for:

- commands that no longer match the repo
- hidden prerequisites
- missing rollback or verification steps
- stale architecture claims
- hand-wavy language instead of operator instructions

Good fixes:

- replace slogans with exact commands
- name the owner, trigger, and expected result
- link docs to real files and scripts

## Assets And Snapshots

Check for:

- oversized media and unoptimized snapshots
- unclear provenance or purpose
- generated files committed without policy
- missing alt-text or accessibility support where relevant

Good fixes:

- compress or relocate artifacts
- keep only review-critical snapshots
- document why the asset is in version control

## Skills And Agents

Check for:

- weak trigger descriptions
- missing workflow steps
- scripts that are not validated
- references that are too vague or too large
- packaging that fails or is undocumented

Good fixes:

- sharpen trigger phrases
- keep the main skill concise and move detail into references
- validate the bundled automation before shipping
