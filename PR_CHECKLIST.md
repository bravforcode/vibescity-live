# PR Checklist (VibeCity)

## Scope
- [ ] This PR matches its assigned lane (Qodo / Antigravity)
- [ ] No out-of-scope changes

## Quality Gates
- [ ] `npm run lint` passes (0 errors)
- [ ] No vendor snippets modified
- [ ] No console errors in dev

## Behavior Safety
- [ ] No change to emits/props names
- [ ] No change to existing UX unless explicitly intended
- [ ] No gesture regressions

## Mobile UX Regression Checks (Manual)
- [ ] Horizontal card swipe still smooth
- [ ] Vertical pull-up opens modal correctly
- [ ] Map pan/zoom does NOT open drawer
- [ ] Deep link `?shop=` works and clears on deselect
- [ ] Refresh does not double-trigger
- [ ] Landscape layout not broken

## Performance
- [ ] No new long tasks (>200ms) during scroll
- [ ] Scroll remains smooth on mid-tier iPhone

## Security
- [ ] All `_blank` links use `noopener noreferrer`
- [ ] No secrets added to client

## Cleanup
- [ ] Intervals / observers / listeners cleaned up
- [ ] No unused refs or watchers left behind

## Acceptance
- [ ] Matches SS roadmap item(s)
- [ ] Verified on real mobile or mobile emulator
