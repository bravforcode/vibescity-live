# Secret Management Policy

## Requirements

1. All production secrets must be stored in a managed secret store (Vault/Doppler/Infisical or CI secret manager).
2. `.env` files are local development only and must never be committed with real secrets.
3. Keys/tokens/secrets must rotate on schedule and on any exposure suspicion.

## Frontend (`VITE_*`) Rules

- `VITE_*` values are public by design and bundled into client code.
- Never place secrets in any `VITE_*` variable.
- CI gate must fail when suspicious patterns are found in `VITE_*` names or values.

## Rotation Policy

- Payment/webhook signing secrets: every 90 days
- API keys with financial impact: every 60 days
- Non-critical service keys: every 180 days
- Emergency rotation: immediate on incident

## CI Enforcement

- Dependency vulnerability gate (high/critical)
- License policy gate
- SBOM generation per build
- VITE public secret misuse gate (`scripts/ci/check-vite-public-secrets.mjs`)

## Incident Response

1. Revoke exposed secret.
2. Rotate dependent integrations.
3. Review audit logs and suspicious access window.
4. Document incident and preventive actions.
