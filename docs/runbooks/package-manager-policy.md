# Package Manager Policy

Canonical date: March 7, 2026

## Source of Truth

- Package manager: `npm`
- Required version pin: `npm@10.8.2`
- Canonical lockfile: `package-lock.json`

## Disallowed

- `bun.lock`
- `bun.lockb`
- `oven-sh/setup-bun`
- `bun install`
- `bun run`
- `bunx`

## Why

- Vercel deploys on Linux and previously failed when the repo drifted into mixed `bun` and `npm` resolution.
- CI, local reproduction, and preview deploys must resolve dependencies from one lockfile only.
- Branch protection is only meaningful when the install graph is deterministic across runners.

## Enforcement

- `package.json` must declare `"packageManager": "npm@10.8.2"`.
- `vercel.json` must keep:
  - `"installCommand": "npm ci"`
  - `"buildCommand": "npm run build"`
- CI policy check:
  - `npm run ci:package-manager-policy`
  - implementation: `scripts/ci/check-package-manager-policy.mjs`

## Operational Rule

- If dependencies change, commit the updated `package-lock.json`.
- Do not regenerate or commit any Bun lockfile.
- If a workflow needs Node tooling, use `actions/setup-node` with npm cache keyed by `package-lock.json`.
