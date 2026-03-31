# ADR-0002: Deployment Authority Split

**Date**: 2026-03-25  
**Status**: Proposed  
**Deciders**: VibeCity maintainers

## Context

The repository contains multiple deployment surfaces at once, including Vercel, Render, Fly.io, Docker, and Supabase Edge Functions. Without a documented authority split, operational fixes can land in the wrong platform and silently drift from the production path.

## Decision Drivers

- Make ownership of each deploy lane explicit
- Reduce accidental platform drift
- Keep long-running backend concerns separate from edge/static concerns

## Options Considered

### Option 1: Vercel for web edge and Render for backend API
**Pros:**
- Matches the current presence of `vercel.json`, `api/index.py`, and `render.yaml`
- Keeps long-running FastAPI concerns off the edge deployment lane
- Supports a clearer split between frontend/web-edge and backend/service runtime

**Cons:**
- Requires disciplined environment parity across platforms

**Cost/Effort**: Low

### Option 2: Consolidate everything on Vercel
**Pros:**
- One platform story

**Cons:**
- Long-running backend workloads and operational tooling become harder to reason about
- Would require explicit backend migration work

**Cost/Effort**: High

### Option 3: Keep all deployment targets equally active
**Pros:**
- No migration work

**Cons:**
- No single source of truth
- High regression risk during operational changes

**Cost/Effort**: High

## Decision

We will use **Vercel as the canonical web-edge deployment lane** and **Render as the canonical long-running backend API lane**. Fly.io remains legacy or experimental until a dedicated ADR says otherwise.

This keeps platform responsibilities explicit while preserving the repo's current operational shape.

## Consequences

**Positive:**
- Clearer incident ownership
- Cleaner deployment reviews
- Lower chance of shipping fixes to the wrong platform

**Negative / Risks:**
- Cross-platform environment drift remains a real risk
- Old Fly-oriented docs or scripts can still confuse contributors

**Mitigation:**
- Keep deployment changes tied to the authoritative platform files
- Add future cleanup work to retire or quarantine legacy deploy surfaces

## References

- `vercel.json`
- `api/index.py`
- `render.yaml`
- `fly.toml`
