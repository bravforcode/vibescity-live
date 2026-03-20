#!/usr/bin/env bash
set -u

FAILURES=()
CHECKS_RUN=0

check() {
  local label="$1"
  local cmd="$2"
  CHECKS_RUN=$((CHECKS_RUN + 1))
  if eval "$cmd" >/dev/null 2>&1; then
    echo "✓ $label"
  else
    echo "✗ $label"
    FAILURES+=("$label")
  fi
}

echo "=== Console Stability Verification ==="

check "Auth prompt channel lifecycle contract" \
  "grep -q 'subscribeAuthPrompt' src/services/authPromptChannel.ts && grep -q 'return () =>' src/services/authPromptChannel.ts"

check "Favorites auth refresh queue is used" \
  "grep -q 'authRefreshQueue.ensureFreshToken' src/store/favoritesStore.js"

check "Favorites unauthorized path emits auth prompt" \
  "grep -q 'emitAuthRequired(\\\"favorites\\\")' src/store/favoritesStore.js"

check "Retry queue has schemaVersion + expiresAt" \
  "grep -q 'schemaVersion' src/services/offlineActionQueue.ts && grep -q 'expiresAt' src/services/offlineActionQueue.ts"

check "RUM probe re-entry guard present" \
  "grep -q 'probeInFlight' src/services/rumService.js"

check "Speculation rules no longer mutate existing script textContent" \
  "! grep -q 'textContent' src/services/speculationRulesService.js"

check "SW version-aware runtime cache naming present" \
  "grep -q 'SW_VERSION' public/sw.js && grep -q 'CACHE_NAME' public/sw.js"

check "SW stale runtime cache cleanup present" \
  "grep -q 'shouldDeleteRuntimeCache' public/sw.js && grep -q 'Deleting stale runtime cache' public/sw.js"

check "SW skip waiting message handler present" \
  "grep -q 'SKIP_WAITING' public/sw.js"

check "SW update prompt waits for controller change" \
  "grep -q 'waitForControllerChange' src/components/pwa/ReloadPrompt.vue && grep -q 'registration.waiting' src/components/pwa/ReloadPrompt.vue"

check "SW registration uses build-versioned script URL" \
  "grep -q 'sw.js?v=' src/main.js && grep -q 'sw.js?v=' src/App.vue"

check "Build version fallback chain configured" \
  "grep -q 'VITE_BUILD_VERSION' src/utils/buildVersion.ts && grep -q 'VITE_COMMIT_SHA' src/utils/buildVersion.ts"

check "CI injects build version" \
  "grep -q 'VITE_BUILD_VERSION' .github/workflows/ci.yml"

check "E2E console baseline spec exists" \
  "test -f tests/e2e/console-baseline.spec.ts"

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo
  echo "=== FAILED (${#FAILURES[@]} / ${CHECKS_RUN}) ==="
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi

echo
echo "=== All ${CHECKS_RUN} checks passed ==="
