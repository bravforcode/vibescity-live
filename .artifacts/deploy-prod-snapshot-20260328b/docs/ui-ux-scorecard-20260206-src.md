# Codebase Audit & Quality Rating Matrix
## UI/UX & Accessibility Review Scorecard (src only)

### Findings (Web Interface Guidelines format)
## src/App.vue
src/App.vue:62 - transition: all → ระบุ property เฉพาะ
## src/plugins/queryClient.js
✓ pass
## src/main.js
✓ pass
## src/stories/SwipeCard.stories.js
✓ pass
## src/stories/Page.vue
✓ pass
## src/stories/Page.stories.js
✓ pass
## src/stories/page.css
✓ pass
## src/stories/Header.vue
✓ pass
## src/stories/Header.stories.js
✓ pass
## src/stories/header.css
✓ pass
## src/stories/Configure.mdx
✓ pass
## src/stories/Button.vue
✓ pass
## src/stories/Button.stories.js
✓ pass
## src/stories/button.css
✓ pass
## src/assets/vue.svg
✓ pass
## src/assets/vibe-animations.css
src/assets/vibe-animations.css:12 - animation ไม่มี prefers-reduced-motion
## src/assets/map-atmosphere.css
src/assets/map-atmosphere.css:19 - animation ไม่มี prefers-reduced-motion
## src/directives/vHaptic.js
✓ pass
## src/directives/testid.js
✓ pass
## src/composables/useVirtualList.js
✓ pass
## src/schemas/index.js
✓ pass
## src/composables/useVibeEffects.js
✓ pass
## src/composables/useUILogic.js
✓ pass
## src/composables/useTransportLogic.js
✓ pass
## src/composables/useTimeTheme.js
✓ pass
## src/composables/useStripe.js
✓ pass
## src/composables/useSmartVideo.js
✓ pass
## src/composables/useShopFilters.js
✓ pass
## src/composables/useScrollSync.js
✓ pass
## src/composables/usePerformance.js
✓ pass
## src/composables/useNotifications.js
✓ pass
## src/composables/useMapLogic.js
✓ pass
## src/composables/useLocation.js
✓ pass
## src/composables/useIdle.js
✓ pass
## src/composables/useHomeBase.js
✓ pass
## src/composables/useHaptics.js
✓ pass
## src/composables/useGestures.js
✓ pass
## src/composables/useEventLogic.js
✓ pass
## src/composables/useDragScroll.js
✓ pass
## src/composables/useBodyScrollLock.js
✓ pass
## src/composables/useAudioSystem.js
✓ pass
## src/composables/useAppLogic.js
✓ pass
## src/composables/useAnalytics.js
✓ pass
## src/views/HomeView.vue
src/views/HomeView.vue:343 - transition: all → ระบุ property เฉพาะ
## src/views/AdminView.vue
src/views/AdminView.vue:9 - “Loading...” → “Loading…”
src/views/AdminView.vue:114 - input ไม่มี label/aria-label + autocomplete
## src/store/userStore.js
✓ pass
## src/store/userPreferencesStore.js
✓ pass
## src/store/shopStore.js
✓ pass
## src/store/roomStore.js
✓ pass
## src/store/locationStore.js
✓ pass
## src/store/index.js
src/store/index.js:93 - “...” → “…”
## src/store/favoritesStore.js
✓ pass
## src/store/coinStore.js
✓ pass
## src/sw.js
✓ pass
## src/style.css
✓ pass
## src/lib/supabase.js
✓ pass
## src/services/socketService.js
✓ pass
## src/lib/runtimeConfig.js
✓ pass
## src/i18n.js
src/i18n.js:6 - “...” → “…”
src/i18n.js:43 - “...” → “…”
src/i18n.js:121 - “...” → “…”
src/i18n.js:130 - “...” → “…”
src/i18n.js:173 - “...” → “…”
src/i18n.js:251 - “...” → “…”
## src/services/shopService.js
✓ pass
## src/services/sheetsService.js
✓ pass
## src/services/redemptionService.js
src/services/redemptionService.js:23 - “...” → “…”
## src/services/realTimeDataService.js
✓ pass
## src/services/placesService.js
✓ pass
## src/services/paymentService.js
src/services/paymentService.js:37 - “...” → “…”
## src/services/geoService.js
✓ pass
## src/services/gamificationService.js
✓ pass
## src/services/eventService.js
src/services/eventService.js:344 - “...” → “…”
src/services/eventService.js:384 - “...” → “…”
src/services/eventService.js:434 - “...” → “…”
## src/services/emergencyService.js
✓ pass
## src/services/DeepLinkService.js
✓ pass
## src/services/analyticsService.js
✓ pass
## src/services/adminService.js
✓ pass
## src/constants/zIndex.js
✓ pass
## src/constants/filterCategories.js
✓ pass
## src/design-system/tailwind.preset.js
✓ pass
## src/i18n/index.js
✓ pass
## src/locales/en.json
src/locales/en.json:3 - “...” → “…”
src/locales/en.json:4 - “...” → “…”
src/locales/en.json:43 - “...” → “…”
## src/locales/th.json
src/locales/th.json:3 - “...” → “…”
src/locales/th.json:4 - “...” → “…”
src/locales/th.json:43 - “...” → “…”
## src/router/index.js
✓ pass
## src/utils/mapRenderer.js
src/utils/mapRenderer.js:108 - “...” → “…”
src/utils/mapRenderer.js:123 - img ไม่มี alt
src/utils/mapRenderer.js:133 - ปุ่มไอคอนไม่มี aria-label
src/utils/mapRenderer.js:161 - transition: all → ระบุ property เฉพาะ
src/utils/mapRenderer.js:165 - transition: all → ระบุ property เฉพาะ
src/utils/mapRenderer.js:221 - img ไม่มี alt
src/utils/mapRenderer.js:300 - img ไม่มี alt
## src/utils/linkHelper.js
✓ pass
## src/utils/browserUtils.js
✓ pass
## src/utils/shopUtils.js
✓ pass
## src/utils/osmRoads.js
src/utils/osmRoads.js:47 - “...” → “…”
## src/utils/storageHelper.js
✓ pass
## src/assets/animations/coin.json
✓ pass
## src/stories/assets/docs.png
✓ pass
## src/stories/assets/discord.svg
✓ pass
## src/stories/assets/context.png
✓ pass
## src/stories/assets/avif-test-image.avif
✓ pass
## src/stories/assets/assets.png
✓ pass
## src/stories/assets/addon-library.png
✓ pass
## src/stories/assets/accessibility.svg
✓ pass
## src/stories/assets/accessibility.png
✓ pass
## src/stories/assets/styling.png
✓ pass
## src/stories/assets/share.png
✓ pass
## src/stories/assets/github.svg
✓ pass
## src/stories/assets/figma-plugin.png
✓ pass
## src/stories/assets/theming.png
✓ pass
## src/stories/assets/testing.png
✓ pass
## src/stories/assets/tutorials.svg
✓ pass
## src/stories/assets/youtube.svg
✓ pass
## src/components/ui/PhotoGallery.vue
src/components/ui/PhotoGallery.vue:93 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/PhotoGallery.vue:114 - ปุ่มไอคอนไม่มี aria-label
src/components/ui/PhotoGallery.vue:122 - ปุ่มไอคอนไม่มี aria-label
src/components/ui/PhotoGallery.vue:152 - transition: all → ระบุ property เฉพาะ
src/components/ui/PhotoGallery.vue:158 - img ไม่มี alt
src/components/ui/PhotoGallery.vue:201 - transition: all → ระบุ property เฉพาะ
## src/components/ui/OnboardingTour.vue
src/components/ui/OnboardingTour.vue:99 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/ui/OnboardingTour.vue:99 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/OnboardingTour.vue:109 - transition: all → ระบุ property เฉพาะ
src/components/ui/OnboardingTour.vue:150 - transition: all → ระบุ property เฉพาะ
src/components/ui/OnboardingTour.vue:162 - transition: all → ระบุ property เฉพาะ
src/components/ui/OnboardingTour.vue:173 - transition: all → ระบุ property เฉพาะ
## src/components/ui/LuckyWheel.vue
src/components/ui/LuckyWheel.vue:127 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/ui/LuckyWheel.vue:127 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/LuckyWheel.vue:186 - “...” → “…”
src/components/ui/LuckyWheel.vue:225 - transition: all → ระบุ property เฉพาะ
src/components/ui/LuckyWheel.vue:331 - transition: all → ระบุ property เฉพาะ
## src/components/ui/LottieCoin.vue
✓ pass
## src/components/ui/Leaderboard.vue
✓ pass
## src/components/ui/LanguageToggle.vue
src/components/ui/LanguageToggle.vue:22 - transition: all → ระบุ property เฉพาะ
## src/components/ui/HeartPop.vue
✓ pass
## src/components/ui/FilterMenu.vue
src/components/ui/FilterMenu.vue:231 - transition: all → ระบุ property เฉพาะ
src/components/ui/FilterMenu.vue:250 - transition: all → ระบุ property เฉพาะ
src/components/ui/FilterMenu.vue:261 - transition: all → ระบุ property เฉพาะ
src/components/ui/FilterMenu.vue:294 - transition: all → ระบุ property เฉพาะ
src/components/ui/FilterMenu.vue:303 - transition: all → ระบุ property เฉพาะ
src/components/ui/FilterMenu.vue:388 - transition: all → ระบุ property เฉพาะ
src/components/ui/FilterMenu.vue:409 - transition: all → ระบุ property เฉพาะ
src/components/ui/FilterMenu.vue:417 - transition: all → ระบุ property เฉพาะ
src/components/ui/FilterMenu.vue:449 - transition: all → ระบุ property เฉพาะ
## src/components/ui/DailyCheckin.vue
src/components/ui/DailyCheckin.vue:129 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/ui/DailyCheckin.vue:129 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/DailyCheckin.vue:160 - transition: all → ระบุ property เฉพาะ
src/components/ui/DailyCheckin.vue:181 - transition: all → ระบุ property เฉพาะ
src/components/ui/DailyCheckin.vue:191 - “...” → “…”
src/components/ui/DailyCheckin.vue:191 - “Loading...” → “Loading…”
src/components/ui/DailyCheckin.vue:252 - transition: all → ระบุ property เฉพาะ
## src/components/ui/CouponModal.vue
src/components/ui/CouponModal.vue:2 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/CouponModal.vue:26 - “...” → “…”
src/components/ui/CouponModal.vue:26 - “Claiming...” → “Claiming…”
## src/components/ui/ConsentBanner.vue
src/components/ui/ConsentBanner.vue:3 - แบนเนอร์ขาด role="dialog"/aria-describedby
src/components/ui/ConsentBanner.vue:66 - transition: all → ระบุ property เฉพาะ
## src/components/ui/ConfettiEffect.vue
✓ pass
## src/components/ui/BottomNav.vue
src/components/ui/BottomNav.vue:51 - tab ต้องมี role="tablist" + aria-selected
src/components/ui/BottomNav.vue:67 - transition: all → ระบุ property เฉพาะ
## src/components/ui/AchievementBadges.vue
src/components/ui/AchievementBadges.vue:184 - transition: all → ระบุ property เฉพาะ
## src/components/ui/SkeletonCard.vue
✓ pass
## src/components/ui/SidebarDrawer.vue
src/components/ui/SidebarDrawer.vue:137 - drawer ขาด role="dialog"/aria-modal
src/components/ui/SidebarDrawer.vue:170 - ปุ่มไอคอนไม่มี aria-label
src/components/ui/SidebarDrawer.vue:172 - transition: all → ระบุ property เฉพาะ
src/components/ui/SidebarDrawer.vue:191 - transition: all → ระบุ property เฉพาะ
src/components/ui/SidebarDrawer.vue:222 - transition: all → ระบุ property เฉพาะ
src/components/ui/SidebarDrawer.vue:255 - transition: all → ระบุ property เฉพาะ
src/components/ui/SidebarDrawer.vue:267 - transition: all → ระบุ property เฉพาะ
src/components/ui/SidebarDrawer.vue:288 - transition: all → ระบุ property เฉพาะ
src/components/ui/SidebarDrawer.vue:309 - transition: all → ระบุ property เฉพาะ
## src/components/ui/SettingsPanel.vue
src/components/ui/SettingsPanel.vue:87 - transition: all → ระบุ property เฉพาะ
src/components/ui/SettingsPanel.vue:98 - transition: all → ระบุ property เฉพาะ
src/components/ui/SettingsPanel.vue:109 - transition: all → ระบุ property เฉพาะ
src/components/ui/SettingsPanel.vue:137 - transition: all → ระบุ property เฉพาะ
src/components/ui/SettingsPanel.vue:148 - transition: all → ระบุ property เฉพาะ
src/components/ui/SettingsPanel.vue:159 - transition: all → ระบุ property เฉพาะ
## src/components/ui/SafetyPanel.vue
src/components/ui/SafetyPanel.vue:91 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/SafetyPanel.vue:238 - transition: all → ระบุ property เฉพาะ
## src/components/ui/ReviewSystem.vue
src/components/ui/ReviewSystem.vue:136 - transition: all → ระบุ property เฉพาะ
src/components/ui/ReviewSystem.vue:144 - ปุ่มดาวไม่มี aria-label/aria-pressed
src/components/ui/ReviewSystem.vue:148 - transition: all → ระบุ property เฉพาะ
src/components/ui/ReviewSystem.vue:148 - outline-none ไม่มี focus-visible
src/components/ui/ReviewSystem.vue:163 - transition: all → ระบุ property เฉพาะ
src/components/ui/ReviewSystem.vue:178 - “...” → “…”
src/components/ui/ReviewSystem.vue:178 - “Share the vibe...” → “Share the vibe…”
src/components/ui/ReviewSystem.vue:187 - transition: all → ระบุ property เฉพาะ
src/components/ui/ReviewSystem.vue:286 - transition: all → ระบุ property เฉพาะ
src/components/ui/ReviewSystem.vue:299 - transition: all → ระบุ property เฉพาะ
## src/components/ui/RelatedShopsDrawer.vue
src/components/ui/RelatedShopsDrawer.vue:39 - drawer ขาด role="dialog"/aria-modal
src/components/ui/RelatedShopsDrawer.vue:55 - ปุ่มไอคอนไม่มี aria-label
src/components/ui/RelatedShopsDrawer.vue:65 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
src/components/ui/RelatedShopsDrawer.vue:72 - transition: all → ระบุ property เฉพาะ
## src/components/ui/ReferralShare.vue
src/components/ui/ReferralShare.vue:129 - transition: all → ระบุ property เฉพาะ
## src/components/ui/PullToRefresh.vue
src/components/ui/PullToRefresh.vue:117 - transition: all → ระบุ property เฉพาะ
## src/components/ui/TiltCard.vue
✓ pass
## src/components/ui/SwipeCard.vue
src/components/ui/SwipeCard.vue:322 - transition: all → ระบุ property เฉพาะ
src/components/ui/SwipeCard.vue:404 - transition: all → ระบุ property เฉพาะ
src/components/ui/SwipeCard.vue:437 - transition: all → ระบุ property เฉพาะ
src/components/ui/SwipeCard.vue:449 - transition: all → ระบุ property เฉพาะ
src/components/ui/SwipeCard.vue:515 - transition: all → ระบุ property เฉพาะ
## src/components/ui/SplashScreen.vue
✓ pass
## src/components/ui/SOSPanel.vue
src/components/ui/SOSPanel.vue:32 - transition: all → ระบุ property เฉพาะ
src/components/ui/SOSPanel.vue:35 - transition: all → ระบุ property เฉพาะ
src/components/ui/SOSPanel.vue:52 - transition: all → ระบุ property เฉพาะ
src/components/ui/SOSPanel.vue:71 - transition: all → ระบุ property เฉพาะ
## src/components/ui/VibeNotification.vue
src/components/ui/VibeNotification.vue:65 - transition: all → ระบุ property เฉพาะ
src/components/ui/VibeNotification.vue:66 - transition: all → ระบุ property เฉพาะ
## src/components/ui/VibeError.vue
src/components/ui/VibeError.vue:45 - transition: all → ระบุ property เฉพาะ
## src/components/ui/VibeSkeleton.vue
✓ pass
## src/components/ui/VisitorCount.vue
✓ pass
## src/components/modal/FavoritesModal.vue
src/components/modal/FavoritesModal.vue:51 - โมดัลขาด role="dialog"/aria-modal
src/components/modal/FavoritesModal.vue:158 - transition: all → ระบุ property เฉพาะ
## src/components/modal/EditVenueModal.vue
src/components/modal/EditVenueModal.vue:50 - โมดัลขาด role="dialog"/aria-modal
src/components/modal/EditVenueModal.vue:63 - ปุ่มไอคอนไม่มี aria-label
src/components/modal/EditVenueModal.vue:113 - transition: all → ระบุ property เฉพาะ
src/components/modal/EditVenueModal.vue:117 - “...” → “…”
src/components/modal/EditVenueModal.vue:117 - “Saving...” → “Saving…”
## src/components/modal/VibeModal.vue
src/components/modal/VibeModal.vue:716 - โมดัลขาด role="dialog"/aria-modal
src/components/modal/VibeModal.vue:746 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:758 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1034 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
src/components/modal/VibeModal.vue:1059 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1081 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1090 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1166 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1178 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1190 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1228 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1241 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1257 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1312 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1320 - “...” → “…”
src/components/modal/VibeModal.vue:1330 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1338 - “...” → “…”
src/components/modal/VibeModal.vue:1348 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1356 - “...” → “…”
src/components/modal/VibeModal.vue:1420 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1441 - transition: all → ระบุ property เฉพาะ
src/components/modal/VibeModal.vue:1533 - transition: all → ระบุ property เฉพาะ
## src/components/modal/ProfileDrawer.vue
src/components/modal/ProfileDrawer.vue:155 - drawer ขาด role="dialog"/aria-modal
src/components/modal/ProfileDrawer.vue:180 - transition: all → ระบุ property เฉพาะ
src/components/modal/ProfileDrawer.vue:276 - “Loading...” → “Loading…”
src/components/modal/ProfileDrawer.vue:369 - transition: all → ระบุ property เฉพาะ
src/components/modal/ProfileDrawer.vue:373 - transition: all → ระบุ property เฉพาะ
src/components/modal/ProfileDrawer.vue:405 - transition: all → ระบุ property เฉพาะ
src/components/modal/ProfileDrawer.vue:431 - transition: all → ระบุ property เฉพาะ
## src/components/modal/MallDrawer.vue
src/components/modal/MallDrawer.vue:269 - โมดัลขาด role="dialog"/aria-modal
src/components/modal/MallDrawer.vue:278 - img ไม่มี alt
src/components/modal/MallDrawer.vue:292 - ปุ่มไอคอนไม่มี aria-label
src/components/modal/MallDrawer.vue:294 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:327 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:356 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:407 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:422 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:436 - input ไม่มี label/aria-label
src/components/modal/MallDrawer.vue:441 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:486 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:520 - img ไม่มี alt
src/components/modal/MallDrawer.vue:556 - img ไม่มี alt
src/components/modal/MallDrawer.vue:570 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:577 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:599 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
src/components/modal/MallDrawer.vue:608 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:622 - img ไม่มี alt
src/components/modal/MallDrawer.vue:676 - transition: all → ระบุ property เฉพาะ
src/components/modal/MallDrawer.vue:693 - transition: all → ระบุ property เฉพาะ
## src/composables/map/useMapLayers.js
✓ pass
## src/composables/map/useMapCore.js
✓ pass
## src/composables/map/useMapMarkers.js
src/composables/map/useMapMarkers.js:64 - transition: all → ระบุ property เฉพาะ
## src/composables/map/useMapNavigation.js
✓ pass
## src/assets/css/main.postcss
src/assets/css/main.postcss:140 - transition: all → ระบุ property เฉพาะ
src/assets/css/main.postcss:437 - transition: all → ระบุ property เฉพาะ
## src/components/feed/BottomFeed.vue
src/components/feed/BottomFeed.vue:345 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:395 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:495 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/feed/BottomFeed.vue:498 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:544 - ปุ่มไอคอนไม่มี aria-label
src/components/feed/BottomFeed.vue:645 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/feed/BottomFeed.vue:646 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:699 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/feed/BottomFeed.vue:700 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:813 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/feed/BottomFeed.vue:814 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:836 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:864 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:920 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:974 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:988 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:994 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:1000 - transition: all → ระบุ property เฉพาะ
src/components/feed/BottomFeed.vue:1290 - transition: all → ระบุ property เฉพาะ
## src/components/feed/ImmersiveFeed.vue
src/components/feed/ImmersiveFeed.vue:100 - overlay/โมดัลขาด role="dialog"/aria-modal
src/components/feed/ImmersiveFeed.vue:106 - img ไม่มี alt
src/components/feed/ImmersiveFeed.vue:130 - ปุ่มไอคอนไม่มี aria-label
src/components/feed/ImmersiveFeed.vue:145 - transition: all → ระบุ property เฉพาะ
src/components/feed/ImmersiveFeed.vue:148 - transition: all → ระบุ property เฉพาะ
src/components/feed/ImmersiveFeed.vue:166 - transition: all → ระบุ property เฉพาะ
src/components/feed/ImmersiveFeed.vue:179 - transition: all → ระบุ property เฉพาะ
## src/components/ugc/AddShopModal.vue
src/components/ugc/AddShopModal.vue:2 - โมดัลขาด role="dialog"/aria-modal
src/components/ugc/AddShopModal.vue:17 - ปุ่มไอคอนไม่มี aria-label
src/components/ugc/AddShopModal.vue:110 - input URL ควรใช้ type="url" + autocomplete
src/components/ugc/AddShopModal.vue:113 - “...” → “…”
## src/components/ugc/EditShopModal.vue
src/components/ugc/EditShopModal.vue:2 - โมดัลขาด role="dialog"/aria-modal
src/components/ugc/EditShopModal.vue:17 - ปุ่มไอคอนไม่มี aria-label
src/components/ugc/EditShopModal.vue:105 - input URL ควรใช้ type="url" + autocomplete
## src/components/panel/MerchantStats.vue
src/components/panel/MerchantStats.vue:71 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantStats.vue:89 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantStats.vue:107 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantStats.vue:122 - transition: all → ระบุ property เฉพาะ
## src/components/panel/MerchantRegister.vue
src/components/panel/MerchantRegister.vue:3 - โมดัลขาด role="dialog"/aria-modal
src/components/panel/MerchantRegister.vue:21 - ปุ่มไอคอนไม่มี aria-label
src/components/panel/MerchantRegister.vue:34 - input ไม่มี label/aria-label + autocomplete
src/components/panel/MerchantRegister.vue:92 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:104 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:121 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:155 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:177 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:186 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:240 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:258 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:262 - “Uploading...” → “Uploading…”
src/components/panel/MerchantRegister.vue:271 - transition: all → ระบุ property เฉพาะ
src/components/panel/MerchantRegister.vue:273 - “...” → “…”
src/components/panel/MerchantRegister.vue:273 - “Submitting...” → “Submitting…”
## src/components/panel/ShopCard.vue
src/components/panel/ShopCard.vue:124 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/panel/ShopCard.vue:127 - transition: all → ระบุ property เฉพาะ
src/components/panel/ShopCard.vue:244 - transition: all → ระบุ property เฉพาะ
src/components/panel/ShopCard.vue:261 - transition: all → ระบุ property เฉพาะ
src/components/panel/ShopCard.vue:325 - transition: all → ระบุ property เฉพาะ
src/components/panel/ShopCard.vue:333 - transition: all → ระบุ property เฉพาะ
src/components/panel/ShopCard.vue:339 - transition: all → ระบุ property เฉพาะ
## src/components/panel/VideoPanel.vue
src/components/panel/VideoPanel.vue:186 - transition: all → ระบุ property เฉพาะ
## src/components/map/LiveActivityChips.vue
✓ pass
## src/components/map/MapboxContainer.vue
src/components/map/MapboxContainer.vue:1952 - “...” → “…”
src/components/map/MapboxContainer.vue:2575 - transition: all → ระบุ property เฉพาะ
src/components/map/MapboxContainer.vue:2581 - transition: all → ระบุ property เฉพาะ
src/components/map/MapboxContainer.vue:2589 - transition: all → ระบุ property เฉพาะ
src/components/map/MapboxContainer.vue:2675 - transition: all → ระบุ property เฉพาะ
src/components/map/MapboxContainer.vue:2756 - transition: all → ระบุ property เฉพาะ
## src/components/pwa/ReloadPrompt.vue
✓ pass
## src/components/dashboard/OwnerDashboard.vue
src/components/dashboard/OwnerDashboard.vue:148 - “Loading...” → “Loading…”
## src/components/dashboard/BuyPinsPanel.vue
src/components/dashboard/BuyPinsPanel.vue:20 - transition: all → ระบุ property เฉพาะ
src/components/dashboard/BuyPinsPanel.vue:31 - transition: all → ระบุ property เฉพาะ
src/components/dashboard/BuyPinsPanel.vue:51 - transition: all → ระบุ property เฉพาะ
src/components/dashboard/BuyPinsPanel.vue:140 - ปุ่มไอคอนไม่มี aria-label
src/components/dashboard/BuyPinsPanel.vue:172 - input ไม่มี label/aria-label + autocomplete/type
src/components/dashboard/BuyPinsPanel.vue:347 - transition: all → ระบุ property เฉพาะ
src/components/dashboard/BuyPinsPanel.vue:361 - transition: all → ระบุ property เฉพาะ
src/components/dashboard/BuyPinsPanel.vue:364 - “...” → “…”
## src/components/dashboard/SubscriptionManager.vue
src/components/dashboard/SubscriptionManager.vue:71 - “Loading...” → “Loading…”
## src/components/transport/RideComparisonModal.vue
src/components/transport/RideComparisonModal.vue:45 - โมดัลขาด role="dialog"/aria-modal
src/components/transport/RideComparisonModal.vue:69 - ปุ่มไอคอนไม่มี aria-label
src/components/transport/RideComparisonModal.vue:88 - “Finding drivers...” → “Finding drivers…”
src/components/transport/RideComparisonModal.vue:104 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
src/components/transport/RideComparisonModal.vue:107 - transition: all → ระบุ property เฉพาะ
## src/components/system/AppModals.vue
src/components/system/AppModals.vue:161 - loading overlay ขาด role="status"/aria-live
src/components/system/AppModals.vue:184 - “Synchronizing Vibe Engine...” → “Synchronizing Vibe Engine…”
src/components/system/AppModals.vue:214 - ปุ่มไอคอนไม่มี aria-label
src/components/system/AppModals.vue:264 - transition: all → ระบุ property เฉพาะ
src/components/system/AppModals.vue:267 - transition: all → ระบุ property เฉพาะ
## src/components/system/PortalLayer.vue
✓ pass
## src/components/layout/SideBar.vue
src/components/layout/SideBar.vue:235 - transition: all → ระบุ property เฉพาะ
src/components/layout/SideBar.vue:264 - transition: all → ระบุ property เฉพาะ
src/components/layout/SideBar.vue:283 - transition: all → ระบุ property เฉพาะ
src/components/layout/SideBar.vue:335 - transition: all → ระบุ property เฉพาะ
src/components/layout/SideBar.vue:381 - transition: all → ระบุ property เฉพาะ
src/components/layout/SideBar.vue:428 - transition: all → ระบุ property เฉพาะ
src/components/layout/SideBar.vue:556 - transition: all → ระบุ property เฉพาะ
src/components/layout/SideBar.vue:601 - transition: all → ระบุ property เฉพาะ
## src/components/layout/SmartHeader.vue
src/components/layout/SmartHeader.vue:137 - “...” → “…”
src/components/layout/SmartHeader.vue:500 - “...” → “…”
src/components/layout/SmartHeader.vue:1192 - transition: all → ระบุ property เฉพาะ
src/components/layout/SmartHeader.vue:1196 - transition: all → ระบุ property เฉพาะ
src/components/layout/SmartHeader.vue:1207 - transition: all → ระบุ property เฉพาะ
src/components/layout/SmartHeader.vue:1211 - transition: all → ระบุ property เฉพาะ
src/components/layout/SmartHeader.vue:1243 - transition: all → ระบุ property เฉพาะ
## src/components/design-system/compositions/BottomSheet.vue
✓ pass
## src/components/design-system/compositions/PlaceCard.vue
src/components/design-system/compositions/PlaceCard.vue:5 - transition: all → ระบุ property เฉพาะ
src/components/design-system/compositions/PlaceCard.vue:24 - transition: all → ระบุ property เฉพาะ
src/components/design-system/compositions/PlaceCard.vue:56 - ปุ่มไอคอนไม่มี aria-label
src/components/design-system/compositions/PlaceCard.vue:58 - transition: all → ระบุ property เฉพาะ
src/components/design-system/compositions/PlaceCard.vue:114 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/design-system/compositions/PlaceCard.vue:114 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
## src/components/design-system/primitives/ActionBtn.vue
src/components/design-system/primitives/ActionBtn.vue:3 - transition: all → ระบุ property เฉพาะ
## src/components/design-system/primitives/GlassCard.vue
src/components/design-system/primitives/GlassCard.vue:3 - transition: all → ระบุ property เฉพาะ

### Rating Matrix (src)
| File | Rating | Recommendations |
| --- | --- | --- |
| `src/App.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/plugins/queryClient.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/main.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/SwipeCard.stories.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/Page.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/Page.stories.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/page.css` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/Header.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/Header.stories.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/header.css` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/Configure.mdx` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/Button.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/Button.stories.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/button.css` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/assets/vue.svg` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/assets/vibe-animations.css` | A | เพิ่ม `prefers-reduced-motion` เพื่อปิดแอนิเมชันเมื่อผู้ใช้ร้องขอ |
| `src/assets/map-atmosphere.css` | A | เพิ่ม `prefers-reduced-motion` เพื่อปิดแอนิเมชันเมื่อผู้ใช้ร้องขอ |
| `src/directives/vHaptic.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/directives/testid.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useVirtualList.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/schemas/index.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useVibeEffects.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useUILogic.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useTransportLogic.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useTimeTheme.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useStripe.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useSmartVideo.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useShopFilters.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useScrollSync.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/usePerformance.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useNotifications.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useMapLogic.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useLocation.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useIdle.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useHomeBase.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useHaptics.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useGestures.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useEventLogic.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useDragScroll.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useBodyScrollLock.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useAudioSystem.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useAppLogic.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/useAnalytics.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/views/HomeView.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/views/AdminView.vue` | B | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `label` หรือ `aria-label` + `autocomplete/type` ให้ input |
| `src/store/userStore.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/store/userPreferencesStore.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/store/shopStore.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/store/roomStore.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/store/locationStore.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/store/index.js` | A | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/store/favoritesStore.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/store/coinStore.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/sw.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/style.css` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/lib/supabase.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/socketService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/lib/runtimeConfig.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/i18n.js` | C | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/services/shopService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/sheetsService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/redemptionService.js` | A | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/services/realTimeDataService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/placesService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/paymentService.js` | A | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/services/geoService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/gamificationService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/eventService.js` | B | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/services/emergencyService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/DeepLinkService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/analyticsService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/services/adminService.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/constants/zIndex.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/constants/filterCategories.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/design-system/tailwind.preset.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/i18n/index.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/locales/en.json` | B | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/locales/th.json` | B | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/router/index.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/utils/mapRenderer.js` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` | เพิ่ม `alt` ที่สื่อความหมาย/ปล่อยว่างเมื่อเป็นตกแต่ง | เพิ่ม `aria-label` ให้ปุ่มไอคอน |
| `src/utils/linkHelper.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/utils/browserUtils.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/utils/shopUtils.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/utils/osmRoads.js` | A | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/utils/storageHelper.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/assets/animations/coin.json` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/docs.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/discord.svg` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/context.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/avif-test-image.avif` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/assets.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/addon-library.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/accessibility.svg` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/accessibility.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/styling.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/share.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/github.svg` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/figma-plugin.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/theming.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/testing.png` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/tutorials.svg` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/stories/assets/youtube.svg` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/PhotoGallery.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `alt` ที่สื่อความหมาย/ปล่อยว่างเมื่อเป็นตกแต่ง | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/OnboardingTour.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/LuckyWheel.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/LottieCoin.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/Leaderboard.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/LanguageToggle.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/HeartPop.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/FilterMenu.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/DailyCheckin.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/CouponModal.vue` | B | ปรับข้อความสถานะจาก `...` เป็น `…` | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/ConsentBanner.vue` | B | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/ConfettiEffect.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/BottomNav.vue` | B | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/AchievementBadges.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/SkeletonCard.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/SidebarDrawer.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/SettingsPanel.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/SafetyPanel.vue` | B | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/ReviewSystem.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` | เพิ่ม `aria-label` ให้ปุ่มไอคอน |
| `src/components/ui/RelatedShopsDrawer.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ui/ReferralShare.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/PullToRefresh.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/TiltCard.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/SwipeCard.vue` | B | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/SplashScreen.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/SOSPanel.vue` | B | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/VibeNotification.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/VibeError.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/ui/VibeSkeleton.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/ui/VisitorCount.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/modal/FavoritesModal.vue` | B | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/modal/EditVenueModal.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/modal/VibeModal.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/modal/ProfileDrawer.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/modal/MallDrawer.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `alt` ที่สื่อความหมาย/ปล่อยว่างเมื่อเป็นตกแต่ง | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `label` หรือ `aria-label` + `autocomplete/type` ให้ input | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/composables/map/useMapLayers.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/map/useMapCore.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/composables/map/useMapMarkers.js` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/composables/map/useMapNavigation.js` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/assets/css/main.postcss` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/feed/BottomFeed.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `aria-label` ให้ปุ่มไอคอน |
| `src/components/feed/ImmersiveFeed.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `alt` ที่สื่อความหมาย/ปล่อยว่างเมื่อเป็นตกแต่ง | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ugc/AddShopModal.vue` | C | ปรับข้อความสถานะจาก `...` เป็น `…` | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/ugc/EditShopModal.vue` | C | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/panel/MerchantStats.vue` | B | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/panel/MerchantRegister.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `label` หรือ `aria-label` + `autocomplete/type` ให้ input | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/panel/ShopCard.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด |
| `src/components/panel/VideoPanel.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/map/LiveActivityChips.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/map/MapboxContainer.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/components/pwa/ReloadPrompt.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/dashboard/OwnerDashboard.vue` | A | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/dashboard/BuyPinsPanel.vue` | D | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `label` หรือ `aria-label` + `autocomplete/type` ให้ input |
| `src/components/dashboard/SubscriptionManager.vue` | A | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/transport/RideComparisonModal.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `aria-label` ให้ปุ่มไอคอน | เพิ่ม `role="dialog"`, `aria-modal`, `aria-labelledby` ให้โมดัล/ดรอว์เออร์ |
| `src/components/system/AppModals.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เพิ่ม `aria-label` ให้ปุ่มไอคอน |
| `src/components/system/PortalLayer.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/layout/SideBar.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/layout/SmartHeader.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | ปรับข้อความสถานะจาก `...` เป็น `…` |
| `src/components/design-system/compositions/BottomSheet.vue` | S | ไม่พบประเด็นตามเกณฑ์ UI/UX & Accessibility |
| `src/components/design-system/compositions/PlaceCard.vue` | C | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ | เปลี่ยนเป็น `button`/`a` และรองรับคีย์บอร์ด | เพิ่ม `aria-label` ให้ปุ่มไอคอน |
| `src/components/design-system/primitives/ActionBtn.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
| `src/components/design-system/primitives/GlassCard.vue` | A | แทน `transition-all/transition: all` ด้วยรายการ property เฉพาะ |
