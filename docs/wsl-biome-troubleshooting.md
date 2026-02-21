# WSL Biome Troubleshooting

Use this guide when `bun run lint` fails in WSL with errors like:

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
2. Uses `bun` from PATH or `~/.bun/bin/bun`.
3. Runs:

```bash
bun install --os linux --cpu x64
```

4. Ensures Linux Biome binaries exist in `node_modules/@biomejs`:
- `@biomejs/cli-linux-x64`
- `@biomejs/cli-linux-x64-musl`

5. Verifies with:

```bash
bun run lint -- --help
```

## Manual fallback

If you do not want to run the script, execute:

```bash
bun install --os linux --cpu x64
bun run lint -- --help
```

If lint still fails, remove and reinstall dependencies:

```bash
rm -rf node_modules
bun install --os linux --cpu x64
bun run lint -- --help
```
