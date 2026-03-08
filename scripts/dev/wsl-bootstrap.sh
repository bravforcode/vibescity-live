#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log() {
  printf '[wsl-bootstrap] %s\n' "$*"
}

is_wsl() {
  if grep -qiE '(microsoft|wsl)' /proc/sys/kernel/osrelease 2>/dev/null; then
    return 0
  fi
  if grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null; then
    return 0
  fi
  return 1
}

if [[ "$(uname -s)" != "Linux" ]]; then
  log "This script is for Linux/WSL only."
  exit 1
fi

if ! is_wsl; then
  log "Warning: WSL was not detected. Continuing because Linux setup is still valid."
fi

if ! command -v npm >/dev/null 2>&1; then
  log "npm is required but was not found on PATH."
  exit 1
fi

cd "${REPO_ROOT}"

log "Using npm: $(npm --version)"
if [[ "${WSL_BOOTSTRAP_SKIP_INSTALL:-0}" == "1" ]]; then
  log "Skipping npm ci (WSL_BOOTSTRAP_SKIP_INSTALL=1)."
else
  log "Installing dependencies from package-lock.json..."
  npm ci
fi

log "Verifying Biome availability..."
if npm run lint -- --help >/dev/null 2>&1; then
  log "Done. npm + biome are ready in WSL."
  log "Next: npm run dev"
else
  log "Biome check failed. See docs/wsl-biome-troubleshooting.md"
  exit 1
fi
