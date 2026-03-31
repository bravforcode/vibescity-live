---
name: tech-research
description: >
  Fast technical research and architecture decision skill. ALWAYS use this skill when the
  user asks to: compare technologies, choose between frameworks/tools, write an ADR
  (Architecture Decision Record), evaluate a tech stack, research best practices for a
  specific problem, benchmark approaches, or decide on a technical direction. Also triggers
  for: "should I use X or Y", "what's the best way to do Z", "compare options for W",
  "write an ADR for", "pros and cons of", "what tech should I use for", "is X a good choice
  for Y", or any architecture or system design question. Produces structured, evidence-based
  analysis with concrete recommendations, not vague "it depends" answers. Always ends with
  a clear recommendation and rationale tailored to the user's specific context.
---

# Tech Research Skill

## Research Methodology

When comparing/evaluating technologies:

1. **Clarify context first** (if not obvious):
   - Team size and experience level
   - Scale requirements (requests/day, data volume)
   - Timeline constraints
   - Existing stack/ecosystem
   - Budget (open source vs paid)

2. **Structure the analysis**:
   - What problem is being solved
   - Options in contention
   - Evaluation criteria (weighted by context)
   - Side-by-side comparison
   - **Clear recommendation with rationale**

3. **Give a verdict** — never end with "it depends" alone; always state what YOU would pick and why

---

## ADR (Architecture Decision Record) Template

Use this format for any technical decision worth documenting:

```markdown
# ADR-{NUMBER}: {Short Title}

**Date**: {YYYY-MM-DD}  
**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-{N}  
**Deciders**: {team/person}

## Context

{What is the situation that requires a decision? Include constraints, requirements, 
and the forces at play. Be concrete — include scale, team, timeline.}

## Decision Drivers
- {Most important driver}
- {Second driver}
- {Third driver}

## Options Considered

### Option 1: {Name}
**Pros:**
- {specific advantage}

**Cons:**
- {specific disadvantage}

**Cost/Effort**: {Low/Medium/High}

### Option 2: {Name}
...

### Option 3: {Name}
...

## Decision

We will use **{Option N}** because {primary reason}.

{2-3 sentences of rationale connecting decision to context and drivers.}

## Consequences

**Positive:**
- {expected benefit}

**Negative / Risks:**
- {known tradeoff or risk}
- {migration/learning curve}

**Mitigation:**
- {how to address the main risk}

## References
- {Link to docs, benchmark, article}
```

---

## Common Technology Comparisons

### State Management (React)
| | Zustand | Redux Toolkit | Jotai | TanStack Query |
|---|---|---|---|---|
| Bundle size | 1KB | 47KB | 3KB | 13KB |
| Learning curve | Low | Medium | Low | Medium |
| DevTools | Basic | Excellent | Good | Excellent |
| Best for | Simple global state | Complex state + time-travel | Atomic state | Server state |
| **Verdict** | Default choice for most apps | Large apps with complex flows | Atomic/derived state | API data (use with above) |

### ORM (Node.js + PostgreSQL)
| | Prisma | Drizzle | TypeORM | Knex |
|---|---|---|---|---|
| Type safety | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Performance | Good | Excellent | Good | Excellent |
| Migrations | Auto-generated | Manual (explicit) | Auto | Manual |
| Bundle size | Large (query engine) | Small | Medium | Small |
| Learning curve | Low | Medium | Medium | Low |
| **Verdict** | Fastest start, great DX | Best performance, more control | Legacy, avoid new projects | Raw SQL power |

### Container Orchestration
| | Docker Compose | ECS Fargate | Kubernetes | Cloud Run |
|---|---|---|---|---|
| Complexity | Low | Medium | High | Low |
| Cost | Free (VPS) | Medium | High | Low-pay-per-use |
| Scaling | Manual | Auto | Auto | Auto |
| Operations | Self-managed | AWS-managed | Self or managed | Google-managed |
| **Best for** | Local dev, small apps | AWS shops, medium scale | Complex, multi-team | Serverless containers |

### Message Queue
| | Redis (BullMQ) | RabbitMQ | Kafka | SQS |
|---|---|---|---|---|
| Throughput | High | High | Very High | High |
| Ordering | Per-queue | Per-queue | Per-partition | Per-group |
| Retention | In-memory (+ AOF) | In-memory | Disk (days/weeks) | 14 days |
| Ops burden | Low | Medium | High | None (managed) |
| **Verdict** | Job queues, small-medium | Complex routing | High-throughput streams | AWS ecosystem |

---

## System Design Quick Reference

### When to use what:

**Caching strategy**:
- Read-heavy, rarely changes → Cache-aside (Redis, read from cache first)
- Write-heavy, must be fresh → Write-through + short TTL
- Session data → Redis with TTL

**Database choice**:
- Structured + ACID + complex queries → PostgreSQL ✅ (default)
- Document/variable schema → MongoDB
- Time series → InfluxDB / TimescaleDB
- Graph relationships → Neo4j
- Search → Elasticsearch / OpenSearch

**When to split into microservices**:
- Rule of thumb: start monolith, split when team > 8 or when one service needs independent scaling
- Clear bounded context with different scaling needs
- Different release cycles required

**CDN usage**:
- Static assets: always use CDN (CloudFront, Cloudflare)
- API responses: only if cacheable and not user-specific
- Images: use image CDN with transforms (Cloudinary, imgix)

---

## Performance Benchmarking Template

When evaluating performance claims:

```markdown
## Benchmark: {What is being compared}

**Environment**:
- Hardware: {CPU, RAM}
- OS: {OS version}
- Test tool: {k6/wrk/ab/autocannon}
- Test date: {date}

**Test scenarios**:
1. {Scenario 1}: {N} concurrent users, {duration}
2. {Scenario 2}: ...

**Results**:
| | Option A | Option B |
|---|---|---|
| Throughput (req/s) | | |
| P50 latency | | |
| P99 latency | | |
| Memory usage | | |
| CPU usage | | |

**Analysis**: {What the numbers mean in real terms}
**Recommendation**: {Which to pick and at what scale threshold}
```
