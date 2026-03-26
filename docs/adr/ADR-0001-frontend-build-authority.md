# ADR-0001: Frontend Build Authority

**Date**: 2026-03-25  
**Status**: Proposed  
**Deciders**: VibeCity maintainers

## Context

The repository currently carries both Rsbuild and Vite-era build surfaces. Package scripts, CI, and current local development defaults already route the main frontend lane through Rsbuild, while `vite.config.js` still exists and can create ambiguous ownership for build behavior, plugin wiring, and future optimizations.

## Decision Drivers

- Reduce build-tool drift and duplicated configuration
- Keep CI and local development aligned
- Make performance and deployment work auditable

## Options Considered

### Option 1: Rsbuild as the canonical build tool
**Pros:**
- Matches current `package.json` scripts and active dev flow
- Minimizes immediate disruption
- Keeps one clear authority for frontend build behavior

**Cons:**
- Requires explicit deprecation work for the remaining Vite config

**Cost/Effort**: Low

### Option 2: Vite as the canonical build tool
**Pros:**
- Familiar ecosystem and broader community examples

**Cons:**
- Conflicts with current scripts and validation lane
- Requires migration work before it is truthful

**Cost/Effort**: Medium

### Option 3: Support both indefinitely
**Pros:**
- No immediate migration work

**Cons:**
- Preserves ambiguity and duplicated ownership
- Raises the chance of build regressions

**Cost/Effort**: High

## Decision

We will use **Rsbuild as the canonical frontend build authority** because it already matches the current development and CI path.

All future frontend build changes should land in the Rsbuild lane first. `vite.config.js` remains compatibility baggage until a dedicated removal or migration task resolves it explicitly.

## Consequences

**Positive:**
- One truthful build path for CI and release work
- Lower risk of plugin/config drift
- Cleaner ownership for performance tuning

**Negative / Risks:**
- Vite-era assumptions may still exist in docs or scripts
- Some contributors may keep editing the wrong config file

**Mitigation:**
- Keep this ADR linked from future cleanup work
- Add follow-up tasks that either remove or quarantine the remaining Vite-only surface

## References

- `package.json`
- `.github/workflows/ci.yml`
- `vite.config.js`
- `rsbuild.config.ts`
