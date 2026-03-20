# Site Stability Polish

## Goal

- Run a final browser-level stability sweep on the current map-heavy VibeCity build.
- Fix reproducible runtime bugs or console errors that remain after build/smoke validation.
- Keep changes surgical because the repo worktree is already heavily dirty.

## Plan

1. Create a local preview of the current build and inspect the real app in a browser.
2. Capture console errors, failed requests, and broken high-value flows.
3. Patch the highest-signal issues only where I can reproduce or defend the fix.
4. Re-run build, smoke, and checklist validation.
