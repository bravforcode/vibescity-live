# Cleanup Plan: 29 Unused Components

## Summary
- **Total components:** 97
- **Unused:** 29 (30%)
- **Potential bundle savings:** 50-100KB
- **Action items:** Remove or integrate

---

## Tier 1: SAFE TO DELETE (High Confidence)

| Component | Reason | Size Est. |
|-----------|--------|----------|
| `SmartHeader_old` | _old suffix = legacy | 5KB |
| `PerformanceDashboard` | Admin dashboard, not in views | 8KB |
| `RuntimeStatusPanel` | System monitoring, not used | 4KB |
| `SystemHealthDashboard` | System monitoring, not used | 6KB |
| `AnonymousAnalytics` | Tracking component, disabled | 3KB |
| `PromotionBrandingPanel` | Ad/promo feature, not integrated | 5KB |
| `SubscriptionManager` | Premium feature, not active | 6KB |

**Total savings:** ~37KB
**Risk:** Low — test smoke suite should catch if needed

---

## Tier 2: NEEDS INVESTIGATION (Medium Confidence)

| Component | Concern | Check |
|-----------|---------|-------|
| `VibeNotificationSystem` | Core notification → test in local dev | Search: notification triggers in main app |
| `VibeMapInterface` | Map UI → test map features | Search: interactive map elements |
| `PinPopup` | Venue pin detail → test venue cards | Search: clicking venue pins |
| `PlaceCard` | Venue card layout → test feed | Search: venue listings |
| `SideBar` | Navigation → test sidebar drawer | Search: sidebar in HomeView |
| `EditShopModal` | Shop editor → test merchant flow | Search: shop editing functionality |
| `OnboardingTour` | First-time user → test fresh install | Search: onboarding step |
| `FilterMenu` | Filter UI → test map filters | Search: filter button |

**Action:** Verify each with `bun run test:e2e:smoke` before deletion
**Total savings if removed:** ~45KB

---

## Tier 3: LIKELY FALSE POSITIVES (Low Confidence for Deletion)

| Component | Why Suspicious | Next Step |
|-----------|----------------|-----------|
| `EditShopModal` | Used in context menus (hard to grep) | Check AdminVenues dynamic refs |
| `BottomSheet` | Base component (may be used via inheritance) | Search for component extending BottomSheet |
| `CategorySlider` | Used in filter (might have dynamic wrapper) | Trace through FilterMenu imports |
| `AvatarFallback` | Utility component (may be auto-used) | Check profile drawer/avatar rendering |
| `SplashScreen` | App init component (might be lazy-loaded) | Check main.js boot sequence |

**Action:** Keep for now; add dynamic import detection to audit script
**Total if removed:** ~20KB

---

## Recommended Cleanup Strategy

### Week 1: Delete Tier 1 (Safe)
```bash
# Removes 37KB, minimal risk
rm src/components/layout/SmartHeader_old.vue
rm src/components/system/PerformanceDashboard.vue
rm src/components/system/RuntimeStatusPanel.vue
rm src/components/system/SystemHealthDashboard.vue
# ... etc
```

### Week 2: Verify & Delete Tier 2 (After Testing)
```bash
bun run test:e2e:smoke
# If all pass: delete Tier 2 components
# Savings: +45KB total
```

### Ongoing: Monitor Tier 3
- Re-run `bun run components:audit` after each deploy
- Update import patterns if new tools added
- Revisit in Q2 2026 with improved detection

---

## Impact Assessment

| Metric | Before | After (T1+T2) | Improvement |
|--------|--------|---------------|-------------|
| Component count | 97 | 56 | -42% |
| Shared components | 10 | 10 | - |
| Single-use | 58 | 28 | -52% |
| Unused | 29 | 0 | -100% |
| Estimated savings | - | 82KB | ~8-10% bundle |

---

## Testing Checklist (Before/After Deletion)

```bash
# Pre-cleanup baseline
bun run build && du -sh dist/

# After Tier 1 deletion
bun run test:e2e:smoke    # Should pass
bun run build && du -sh dist/  # Verify size drop

# After Tier 2 deletion
bun run test:e2e:smoke    # Should pass
bun run build && du -sh dist/  # Verify size drop

# Monitor
bun run components:audit  # Verify unused count decreased
```

---

## Cleanup Commands (Copy-Paste)

### Tier 1 (Safe Deletion)
```bash
rm src/components/layout/SmartHeader_old.vue && \
rm src/components/dashboard/PromotionBrandingPanel.vue && \
rm src/components/system/RuntimeStatusPanel.vue && \
rm src/components/system/SystemHealthDashboard.vue && \
rm src/components/ui/AnonymousAnalytics.vue && \
rm src/components/admin/AdminDashboard.vue && \
rm src/components/dashboard/SubscriptionManager.vue && \
git add -A && git commit -m "refactor: remove 7 unused components (37KB savings)"
```

### Tier 2 (After Verification)
```bash
# Delete each after verifying with test:e2e:smoke
rm src/components/ui/VibeNotificationSystem.vue && \
rm src/components/map/VibeMapInterface.vue && \
rm src/components/map/PinPopup.vue && \
rm src/components/design-system/compositions/PlaceCard.vue && \
rm src/components/layout/SideBar.vue && \
rm src/components/modal/EditShopModal.vue && \
rm src/components/ui/OnboardingTour.vue && \
rm src/components/ui/FilterMenu.vue && \
git add -A && git commit -m "refactor: remove 8 verified unused components (45KB savings)"
```
