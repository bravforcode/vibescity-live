# Dashboard BFF Roadmap

## Objective

Reduce dashboard client fan-out and stabilize API contracts by aggregating multi-service data through a Backend-for-Frontend layer.

## Initial Endpoints

- `GET /api/v1/dashboard/owner-summary`
- `GET /api/v1/dashboard/partner-summary`

## BFF Responsibilities

- Aggregate owner/partner summary data across services.
- Enforce response envelope and contract stability.
- Apply short-lived caching for non-sensitive KPI data.
- Normalize partial failures into section-level error payloads.

## Future Expansion

1. Add payout panel aggregation with strict auth and masking.
2. Add venue table query orchestration (cursor pagination/search).
3. Add section-level stale-while-revalidate strategy.
4. Move dashboard authorization checks into BFF policy layer.

## Non-Goals

- Replacing service ownership boundaries.
- Storing long-term financial state in BFF.

## Rollout

- Stage 1: additive BFF endpoints used by canary only.
- Stage 2: default route uses BFF for summary panels.
- Stage 3: deprecate direct multi-call fan-out from frontend where safe.
