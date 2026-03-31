# Scoring Rubric

## Table Of Contents

1. Scoring Process
2. Score Bands
3. Cap Rules
4. File Profiles
5. Required Evidence
6. Remediation Quality Bar

## Scoring Process

1. Choose the profile that matches the file.
2. Score each dimension from `0` to `5`.
3. Convert the dimension score to the weighted result with:

```text
weighted_points = (dimension_score / 5) * weight
final_score = round(sum(weighted_points))
```

4. Apply cap rules after weighting.
5. Write one sentence for `manual_reason` and one concrete next step for `remediation`.

## Score Bands

| Score | Meaning | Interpretation |
| --- | --- | --- |
| `95-100` | Excellent | Strong implementation with no meaningful weakness |
| `85-94` | Healthy | Good file with only minor cleanup opportunities |
| `70-84` | Usable | Works, but notable debt or missing safeguards exist |
| `50-69` | Risky | Important weaknesses need active remediation |
| `0-49` | Failing | Broken, unsafe, misleading, or incomplete |

## Cap Rules

- Cap at `39` if the file has merge conflict markers, is empty by accident, is syntactically broken, or contains an obvious secret/private key.
- Cap at `49` if a critical payment, auth, RLS, migration, deployment, or security defect is present without a guardrail.
- Cap at `69` if the file drives risky behavior but has no meaningful tests or validation path.
- Keep confidence lower for `sampled-reviewed` or `metadata-reviewed` files even if the score is high.

## File Profiles

### Application Source

Use for frontend, backend, edge functions, libraries, stores, and most scripts with business logic.

| Dimension | Weight |
| --- | --- |
| Correctness | 25 |
| Maintainability | 20 |
| Reliability | 15 |
| Security | 15 |
| Testability | 10 |
| Performance | 10 |
| Operability | 5 |

### Tests

Use for unit, integration, visual, and end-to-end tests.

| Dimension | Weight |
| --- | --- |
| Coverage Value | 25 |
| Determinism | 25 |
| Correctness | 20 |
| Maintainability | 15 |
| Speed And Isolation | 10 |
| Observability | 5 |

### Config And CI

Use for JSON, YAML, TOML, env examples, package manifests, workflow files, and deploy config.

| Dimension | Weight |
| --- | --- |
| Safety | 25 |
| Correctness | 20 |
| Reproducibility | 20 |
| Security | 15 |
| Observability | 10 |
| Maintainability | 10 |

### SQL And Migrations

Use for schema, data migrations, policies, RPCs, and raw SQL automation.

| Dimension | Weight |
| --- | --- |
| Safety | 30 |
| Correctness | 25 |
| Rollback And Idempotence | 20 |
| Performance | 15 |
| Observability | 10 |

### Documentation

Use for Markdown, runbooks, ADRs, and operational notes.

| Dimension | Weight |
| --- | --- |
| Accuracy | 40 |
| Completeness | 25 |
| Actionability | 20 |
| Freshness | 15 |

### Assets And Binaries

Use for images, snapshots, fonts, archives, media, and generated artifacts reviewed by metadata.

| Dimension | Weight |
| --- | --- |
| Relevance | 30 |
| Optimization | 25 |
| Provenance | 20 |
| Accessibility | 15 |
| Governance | 10 |

### Skills And Automation

Use for skill folders, agent descriptors, and reusable automation bundles.

| Dimension | Weight |
| --- | --- |
| Trigger Quality | 20 |
| Workflow Quality | 20 |
| Reliability | 20 |
| Reusability | 15 |
| Maintainability | 15 |
| Packaging And Validation | 10 |

## Required Evidence

Every scored file should have:

- the path
- the chosen profile
- the score
- one reason sentence grounded in file evidence
- at least one concrete remediation step if score is below `85`

For files under `70`, also capture the top failure mode:

- broken behavior
- security exposure
- missing guardrail
- missing test
- excessive complexity
- stale or misleading documentation
- asset governance problem

## Remediation Quality Bar

Good remediation is specific and bounded:

- Name the exact change target.
- Name the mechanism: add validation, split function, remove secret, add rollback note, add test, tighten CSP, add timeout, and so on.
- Prefer next actions that can be implemented in one follow-up task.

Weak remediation to avoid:

- "improve code quality"
- "refactor this"
- "make it better"
