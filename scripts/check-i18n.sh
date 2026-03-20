#!/bin/bash
# Quick i18n hardcoded string checker with options
# Usage:
#   ./scripts/check-i18n.sh           # Show violations
#   ./scripts/check-i18n.sh report    # Generate JSON report
#   ./scripts/check-i18n.sh strict    # Fail if violations > 0
#   ./scripts/check-i18n.sh verbose   # Show detailed scan progress
#   ./scripts/check-i18n.sh hook      # Install pre-commit hook

set -e

MODE="${1:-default}"

case "$MODE" in
  report)
    echo "🔍 Generating JSON report..."
    I18N_JSON_OUTPUT=i18n-violations.json I18N_VERBOSE=true node scripts/ci/check-source-i18n-hardcoded.mjs
    echo "📊 Report saved to: i18n-violations.json"
    echo ""
    echo "To view violations:"
    echo "  cat i18n-violations.json | jq '.details[].template[0]'"
    ;;

  strict)
    echo "🚨 Running in STRICT mode (fail if violations)..."
    I18N_STRICT=true I18N_HARDCODED_MAX=0 node scripts/ci/check-source-i18n-hardcoded.mjs
    ;;

  verbose)
    echo "🔎 Running with verbose output..."
    I18N_VERBOSE=true node scripts/ci/check-source-i18n-hardcoded.mjs
    ;;

  hook)
    echo "🪝 Installing pre-commit hook..."
    node scripts/setup-i18n-hook.mjs
    ;;

  *)
    echo "🔍 Running i18n hardcoded string detector..."
    node scripts/ci/check-source-i18n-hardcoded.mjs
    ;;
esac
