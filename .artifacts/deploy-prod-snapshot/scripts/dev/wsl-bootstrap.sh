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

BUN_BIN=""
if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
elif [[ -x "${HOME}/.bun/bin/bun" ]]; then
  BUN_BIN="${HOME}/.bun/bin/bun"
else
  log "bun not found. Installing bun to ${HOME}/.bun ..."
  curl -fsSL https://bun.sh/install | bash
  BUN_BIN="${HOME}/.bun/bin/bun"
fi

if [[ ! -x "${BUN_BIN}" ]]; then
  log "bun binary is not executable: ${BUN_BIN}"
  exit 1
fi

# Keep bun cache on Linux FS for better performance in WSL.
export BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-${HOME}/.cache/bun-install}"
mkdir -p "${BUN_INSTALL_CACHE_DIR}"

cd "${REPO_ROOT}"

log "Using bun: ${BUN_BIN}"
if [[ "${WSL_BOOTSTRAP_SKIP_INSTALL:-0}" == "1" ]]; then
  log "Skipping bun install (WSL_BOOTSTRAP_SKIP_INSTALL=1)."
else
  log "Installing dependencies for Linux x64..."
  "${BUN_BIN}" install --os linux --cpu x64
fi

BIOME_DIR="${REPO_ROOT}/node_modules/@biomejs"
BIOME_META="${BIOME_DIR}/biome/package.json"

if [[ ! -f "${BIOME_META}" ]]; then
  log "Biome package metadata not found at ${BIOME_META}"
  exit 1
fi

BIOME_VERSION="$(grep -m1 '"version"' "${BIOME_META}" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
if [[ -z "${BIOME_VERSION}" ]]; then
  log "Could not detect @biomejs/biome version."
  exit 1
fi

install_biome_cli_pkg() {
  local pkg_name="$1"
  local version="$2"
  local target_dir="${BIOME_DIR}/${pkg_name}"
  local tmp

  tmp="$(mktemp -d)"
  curl -fsSL "https://registry.npmjs.org/@biomejs/${pkg_name}/-/${pkg_name}-${version}.tgz" -o "${tmp}/pkg.tgz"
  tar -xzf "${tmp}/pkg.tgz" -C "${tmp}"
  rm -rf "${target_dir}"
  mv "${tmp}/package" "${target_dir}"
  rm -rf "${tmp}"
}

if [[ ! -d "${BIOME_DIR}/cli-linux-x64" ]]; then
  log "Installing missing @biomejs/cli-linux-x64@${BIOME_VERSION} ..."
  install_biome_cli_pkg "cli-linux-x64" "${BIOME_VERSION}"
fi

if [[ ! -d "${BIOME_DIR}/cli-linux-x64-musl" ]]; then
  log "Installing missing @biomejs/cli-linux-x64-musl@${BIOME_VERSION} ..."
  install_biome_cli_pkg "cli-linux-x64-musl" "${BIOME_VERSION}"
fi

log "Verifying Biome availability..."
if "${BUN_BIN}" run lint -- --help >/dev/null 2>&1; then
  log "Done. bun + biome are ready in WSL."
  log "Next: bun run dev"
else
  log "Biome check failed. See docs/wsl-biome-troubleshooting.md"
  exit 1
fi
