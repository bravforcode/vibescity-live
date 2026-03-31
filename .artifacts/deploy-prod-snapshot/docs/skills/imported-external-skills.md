# Imported External Skills

This repo now contains 10 imported external skill archives.

## Canonical Source

The canonical extracted source lives in:

- `skills/git-workflow`
- `skills/monitoring-observability`
- `skills/performance-profiling`
- `skills/security-hardening`
- `skills/api-design`
- `skills/database-ops`
- `skills/devops-pipeline`
- `skills/fullstack-scaffold`
- `skills/infra-as-code`
- `skills/tech-research`

## Codex Mirror

To make these skills discoverable by the Codex repo-local skill system in future sessions, they are also mirrored into:

- `.agents/skills/git-workflow`
- `.agents/skills/monitoring-observability`
- `.agents/skills/performance-profiling`
- `.agents/skills/security-hardening`
- `.agents/skills/api-design`
- `.agents/skills/database-ops`
- `.agents/skills/devops-pipeline`
- `.agents/skills/fullstack-scaffold`
- `.agents/skills/infra-as-code`
- `.agents/skills/tech-research`

## Why They Were Not Mirrored Into `.agent/skills`

The repo already contains an Antigravity Kit under `.agent/skills/` with overlapping capability names such as `performance-profiling`, `api-patterns`, `database-design`, and `deployment-procedures`.

To avoid overwriting or silently changing the existing `.agent` behavior in a dirty/conflicted worktree, the imported external skills were added as:

- canonical source under `skills/`
- Codex mirror under `.agents/skills/`

If the team wants these external skills promoted into `.agent/skills/`, do it in a dedicated follow-up task after the current merge/conflict state is cleaned up.

## Re-Import Command

Run this whenever the original `.skill` archives are updated:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/import_external_skills.ps1
```

## Imported Skill Intent

### `git-workflow`

- Focus: branching strategy, commit standards, PR templates, release process, hooks
- Good trigger phrases:
  - `design our git workflow`
  - `write a PR template`
  - `set up conventional commits`
  - `how should we do releases`

### `monitoring-observability`

- Focus: OpenTelemetry, Prometheus, Grafana, logs, traces, alerts, SLOs
- Good trigger phrases:
  - `instrument observability`
  - `add tracing`
  - `what should we monitor`
  - `build dashboards and alerts`

### `performance-profiling`

- Focus: baseline measurement, load testing, CPU and memory profiling, web vitals
- Good trigger phrases:
  - `why is this slow`
  - `profile this route`
  - `optimize bundle size`
  - `run a performance audit`

### `security-hardening`

- Focus: OWASP hardening, headers, validation, secrets, CI security gates
- Good trigger phrases:
  - `security review`
  - `harden this app`
  - `secure JWT and CORS`
  - `add security headers`

### `api-design`

- Focus: REST, GraphQL, OpenAPI, pagination, versioning, response contracts
- Good trigger phrases:
  - `design this API`
  - `write an OpenAPI spec`
  - `what should this endpoint look like`
  - `review our API contract`

### `database-ops`

- Focus: schema design, migrations, indexing, query optimization, ORM patterns
- Good trigger phrases:
  - `design the database`
  - `optimize this query`
  - `what indexes should we add`
  - `write a migration`

### `devops-pipeline`

- Focus: Docker, CI/CD, Kubernetes, production deployment pipelines
- Good trigger phrases:
  - `set up CI/CD`
  - `write a Dockerfile`
  - `create a deployment pipeline`
  - `containerize this service`

### `fullstack-scaffold`

- Focus: rapid project bootstrapping with real file content
- Good trigger phrases:
  - `scaffold a new app`
  - `bootstrap a starter`
  - `set up a monorepo`
  - `create a fullstack template`

### `infra-as-code`

- Focus: Terraform, Pulumi, cloud resources, VPC/IAM/service layout
- Good trigger phrases:
  - `write Terraform`
  - `provision cloud infra`
  - `set up VPC and RDS`
  - `create IaC for this deployment`

### `tech-research`

- Focus: option comparison, ADRs, stack evaluation, evidence-based recommendations
- Good trigger phrases:
  - `compare X vs Y`
  - `write an ADR`
  - `evaluate this stack`
  - `what should we choose`

## Notes

- The imported skills were used in this session as the lens for the project audit.
- The import script expects the source archives to remain in the current `Downloads` paths.
- If the team wants a portable setup, move the source archives into the repo or replace the script with a parameterized importer.
