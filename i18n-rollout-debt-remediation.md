## Summary

Remove the remaining 10 source-i18n warnings so wider rollout does not carry hardcoded UI copy debt.

## Scope

- `src/views/PartnerDashboard.vue`
- `src/components/ui/SidebarDrawer.vue`
- `src/services/payoutRealtimeService.js`
- Locale updates in `src/locales/en.json` and `src/locales/th.json`

## Findings

- 6 template literals and 1 confirm message remain in `PartnerDashboard.vue`
- 2 logout strings remain in `SidebarDrawer.vue`
- 1 hardcoded error message remains in `payoutRealtimeService.js`

## Plan

1. Inspect each warning in context and map it to stable translation keys
2. Add English and Thai locale entries
3. Replace hardcoded strings with `t(...)` or service-level translation access
4. Re-run `bun run check`, `bun run build`, and `checklist.py`

## Success Criteria

- `source-i18n` reports 0 violations
- No new runtime or build errors
- Existing UX copy remains unchanged for end users
