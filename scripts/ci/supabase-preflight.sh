#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-rukyitpjfmzhqjlfmbie}"
SUPABASE_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
SUPABASE_PASSWORD="${SUPABASE_DB_PASSWORD:-}"

error() {
  echo "::error::$1" >&2
}

is_permission_error() {
  local file="$1"
  grep -Eqi "(403|forbidden|not authorized|unauthorized|insufficient|permission|access denied)" "$file"
}

require_env() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    error "Missing secret: ${name}"
    exit 1
  fi
}

run_and_check() {
  local label="$1"
  shift

  local out_file
  local err_file
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  if "$@" >"$out_file" 2>"$err_file"; then
    cat "$out_file"
    rm -f "$out_file" "$err_file"
    return 0
  fi

  cat "$out_file" >&2 || true
  cat "$err_file" >&2 || true

  if is_permission_error "$out_file" || is_permission_error "$err_file"; then
    error "${label} failed due to access permissions for project ${PROJECT_REF}."
    error "Use a fresh PAT from an account that has org/project access, then update SUPABASE_ACCESS_TOKEN."
  else
    error "${label} failed. Check command output above."
  fi

  rm -f "$out_file" "$err_file"
  exit 1
}

if ! command -v supabase >/dev/null 2>&1; then
  error "supabase CLI is missing in PATH."
  exit 1
fi

require_env "SUPABASE_ACCESS_TOKEN" "$SUPABASE_TOKEN"
require_env "SUPABASE_DB_PASSWORD" "$SUPABASE_PASSWORD"

run_and_check "supabase login" supabase login --token "$SUPABASE_TOKEN"

projects_out="$(mktemp)"
projects_err="$(mktemp)"

if ! supabase projects list >"$projects_out" 2>"$projects_err"; then
  cat "$projects_out" >&2 || true
  cat "$projects_err" >&2 || true
  if is_permission_error "$projects_out" || is_permission_error "$projects_err"; then
    error "Token is valid but does not have permission to list projects in this org."
    error "Re-create PAT from the correct Supabase account/org and update SUPABASE_ACCESS_TOKEN."
  else
    error "supabase projects list failed."
  fi
  rm -f "$projects_out" "$projects_err"
  exit 1
fi

if ! grep -Fqi "$PROJECT_REF" "$projects_out"; then
  error "Token authenticated but cannot access project ref: ${PROJECT_REF}."
  error "Set SUPABASE_PROJECT_REF correctly and use token from an account that can access this project."
  rm -f "$projects_out" "$projects_err"
  exit 1
fi

rm -f "$projects_out" "$projects_err"

run_and_check "supabase link" supabase link --project-ref "$PROJECT_REF" --password "$SUPABASE_PASSWORD"

echo "Supabase preflight passed for project: ${PROJECT_REF}"
