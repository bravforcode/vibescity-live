# WSL Biome Troubleshooting

Use this guide when `npm run lint` fails in WSL with errors like:

```text
Cannot find module '@biomejs/cli-linux-x64/biome'
```

## One-command fix (recommended)

From the repo root:

```bash
bash scripts/dev/wsl-bootstrap.sh
```

## What the bootstrap script does

1. Verifies Linux/WSL environment.
2. Uses `npm` from PATH.
3. Runs:

```bash
npm ci
```

4. Ensures Linux Biome binaries exist in `node_modules/@biomejs`:
- `@biomejs/cli-linux-x64`
- `@biomejs/cli-linux-x64-musl`

5. Verifies with:

```bash
npm run lint -- --help
```

## Manual fallback

If you do not want to run the script, execute:

```bash
npm ci
npm run lint -- --help
```

If lint still fails, remove and reinstall dependencies:

```bash
rm -rf node_modules
npm ci
npm run lint -- --help
```
