<!-- src/views/HomeView.vue -->
<script setup>
import {
	computed,
	defineAsyncComponent,
	nextTick,
	onMounted,
	ref,
	watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
// ✅ Import New Modular Components
import BottomFeed from "../components/feed/BottomFeed.vue";
import SmartHeader from "../components/layout/SmartHeader.vue";
import AppModals from "../components/system/AppModals.vue";
import SidebarDrawer from "../components/ui/SidebarDrawer.vue"; // ✅ Sync Import to fix loading
import { useAppLogic } from "../composables/useAppLogic";
import { useLocalAds } from "../composables/useLocalAds";
import { useFeatureFlagStore } from "../store/featureFlagStore";

// ✅ Async Components (Preserved)
// E2E strict lane can flake if the map component chunk fails to load.
// Use eager mode in strict map E2E to remove async chunk races while keeping
// lazy loading for normal runtime.
const IS_STRICT_MAP_E2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
const MapContainer = IS_STRICT_MAP_E2E
	? defineAsyncComponent(
			() =>
				import(
					/* webpackMode: "eager" */ "../components/map/MapboxContainer.vue"
				),
		)
	: defineAsyncComponent(() => import("../components/map/MapboxContainer.vue"));
const VideoPanel = defineAsyncComponent(
	() => import("../components/panel/VideoPanel.vue"),
);
// SidebarDrawer moved to sync above
const VibeError = defineAsyncComponent(
	() => import("../components/ui/VibeError.vue"),
);
const VibeSkeleton = defineAsyncComponent(
	() => import("../components/ui/VibeSkeleton.vue"),
);
const SwipeCard = defineAsyncComponent(
	() => import("../components/ui/SwipeCard.vue"),
);
const ImmersiveFeed = defineAsyncComponent(
	() => import("../components/feed/ImmersiveFeed.vue"),
);
const MerchantRegister = defineAsyncComponent(
	() => import("../components/panel/MerchantRegister.vue"),
);
const AddShopModal = defineAsyncComponent(
	() => import("../components/ugc/AddShopModal.vue"),
);
const DailyCheckin = defineAsyncComponent(
	() => import("../components/ui/DailyCheckin.vue"),
);
const LuckyWheel = defineAsyncComponent(
	() => import("../components/ui/LuckyWheel.vue"),
);
const LocalAdBanner = defineAsyncComponent(
	() => import("../components/ads/LocalAdBanner.vue"),
);

const showMerchantModal = ref(false);
const showAddShopModal = ref(false);

// ✅ Geofenced Local Ads
const { visibleAds, dismissAd } = useLocalAds();
const currentAd = computed(() => visibleAds.value?.[0] ?? null);

const FilterMenu = defineAsyncComponent(
	() => import("../components/ui/FilterMenu.vue"),
);
const RelatedShopsDrawer = defineAsyncComponent(
	() => import("../components/ui/RelatedShopsDrawer.vue"),
);
// ✅ Safety & Favorites Modals
const SafetyPanel = defineAsyncComponent(
	() => import("../components/ui/SafetyPanel.vue"),
);
const FavoritesModal = defineAsyncComponent(
	() => import("../components/modal/FavoritesModal.vue"),
);
const showFilterMenu = ref(false);
const showRelatedDrawer = ref(false); // Stack View Logic
const route = useRoute();
const router = useRouter();
const featureFlagStore = useFeatureFlagStore();
const SITE_ORIGIN = "https://vibecity.live";

import { useHead } from "@unhead/vue";

const SUPPORTED_LOCALES = new Set(["th", "en"]);
const normalizeLocale = (value) => {
	const raw = String(value || "")
		.trim()
		.toLowerCase();
	return SUPPORTED_LOCALES.has(raw) ? raw : null;
};
const getStoredLocale = () => {
	if (typeof window === "undefined") return null;
	const stored =
		localStorage.getItem("locale") || localStorage.getItem("vibe_locale") || "";
	return normalizeLocale(stored);
};
const currentLocale = computed(() => {
	const fromRoute = normalizeLocale(route.params.locale);
	return fromRoute || getStoredLocale() || "th";
});
const isPartnerProgramEnabled = computed(() =>
	featureFlagStore.isEnabled("enable_partner_program"),
);
const isCinemaExplorerEnabled = computed(() =>
	featureFlagStore.isEnabled("enable_cinema_mall_explorer"),
);
const buildLocalePath = (basePath, locale) => {
	const safe = basePath === "/" ? "" : basePath;
	return `/${locale}${safe}`;
};
const slugifyCategory = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
const resolveCategoryParam = (value) => {
	const raw = String(value || "").trim();
	if (!raw) return null;
	const slug = slugifyCategory(raw);
	return slug || null;
};

// ✅ Initialize Logic
const {
	// Refs
	mapRef,
	bottomUiRef,
	mobileCardScrollRef,
	isMobileView,
	isLandscape,
	isDarkMode,
	isDataLoading,
	isInitialLoad,
	errorMessage,
	showConfetti,
	showSidebar,
	showProfileDrawer,
	showMallDrawer,
	showSearchResults,
	isVibeNowCollapsed,
	isIndoorView,
	isPanelOpen,
	activeTab,
	activeShopId,
	activeCategories,
	activeZone,
	activeProvince,
	activeBuilding,
	activeFloor,
	activeMall,
	activePopup,
	userLocation,
	userLevel,
	totalCoins,
	favorites,
	selectedShop,
	rideModalShop,
	realTimeEvents,
	globalSearchQuery,
	globalSearchResults,
	legendHeight,
	isLowPowerMode,
	currentTime,
	activeStatus,
	isRefreshing,
	isImmersive,
	toggleImmersive,
	handleRefresh,
	refreshUserStats,
	handleFilterApply,
	activeFilters,

	// Computed
	shops,
	filteredShops,
	carouselShops,
	carouselShopIds,
	suggestedShops,
	mallShops,
	activeEvents,
	selectedShopCoords,
	mapUiTopOffset,
	mapUiBottomOffset,
	liveCount,

	// Methods
	t,
	toggleLanguage,
	handleMarkerClick,
	handleCardClick,
	handleCardHover,
	handleOpenDetail,
	closeDetailSheet,
	handlePanelScroll,
	handleSwipe,
	handleGlobalSearchSelect,
	handleEnterIndoor,
	handleCloseFloorSelector,
	handleBuildingOpen,
	openRideModal,
	closeRideModal,
	openRideApp,
	toggleFavorite,
	requestGeolocation,
	handleLocateMe,
	retryLoad,

	// Scroll Engine
	handleHorizontalScroll,
	onScrollStart,
	onScrollEnd,

	// Haptics
	tapFeedback,
	selectFeedback,
	isUiVisible, // ✅ Auto-hide UI
	wakeUi, // ✅ Manual wake
	isMuted, // ✅ Audio
	toggleMute, // ✅ Audio
	loadMoreVibes, // ✅ Infinite Scroll

	// Safety Features
	handleTakeMeHome,
	handleOpenSOS,
	showSafetyPanel,
	handleCloseSOS,

	// Favorites Modal
	showFavoritesModal,
	handleOpenFavorites,
	handleCloseFavorites,

	// Giant Pin View
	handleEnterGiantView,
	handleExitGiantView,
} = useAppLogic();

// ✅ Ref Forwarding Helpers
const setBottomUiRef = (el) => {
	bottomUiRef.value = el;
};
const setMobileCardScrollRef = (el) => {
	mobileCardScrollRef.value = el;
};

// ✅ Giant Pin State Sync
const isGiantPinView = ref(false);
const onEnterGiantView = (shop) => {
	isGiantPinView.value = true;
	handleEnterGiantView(shop);
};
const onExitGiantView = () => {
	isGiantPinView.value = false;
	handleExitGiantView();
};

const dailyCheckinRef = ref(null);
const luckyWheelRef = ref(null);

const resolveVenueId = (shopOrId) => {
	const rawId =
		typeof shopOrId === "object" && shopOrId !== null ? shopOrId.id : shopOrId;
	if (rawId === null || rawId === undefined) return null;
	const normalized = String(rawId).trim();
	return normalized ? normalized : null;
};

const resolveVenueSlug = (shopOrSlug) => {
	const raw =
		typeof shopOrSlug === "object" && shopOrSlug !== null
			? shopOrSlug.slug
			: shopOrSlug;
	if (raw === null || raw === undefined) return null;
	const normalized = String(raw).trim().toLowerCase();
	return normalized ? normalized : null;
};

const canonicalBasePath = computed(() => {
	const routeSlug = resolveVenueSlug(route.params.slug);
	if (routeSlug) return `/v/${encodeURIComponent(routeSlug)}`;

	const activeSlug = resolveVenueSlug(activeVenue.value?.slug);
	if (activeSlug) return `/v/${encodeURIComponent(activeSlug)}`;

	const routeId = resolveVenueId(route.params.id);
	if (routeId) return `/venue/${encodeURIComponent(routeId)}`;

	const activeId = resolveVenueId(activeShopId.value);
	if (activeId) return `/venue/${encodeURIComponent(activeId)}`;

	const categoryParam = resolveCategoryParam(route.params.category);
	if (categoryParam) return `/c/${encodeURIComponent(categoryParam)}`;

	return "/";
});

const canonicalPath = computed(() =>
	buildLocalePath(canonicalBasePath.value, currentLocale.value),
);

const resolveVenueUrl = (shopOrId) => {
	const directSlug = resolveVenueSlug(shopOrId);
	const directId = resolveVenueId(shopOrId);

	const candidates = [
		...(filteredShops.value || []),
		...(carouselShops.value || []),
		...(shops.value || []),
	];

	const resolved = directSlug
		? { slug: directSlug, id: null }
		: directId
			? candidates.find((s) => resolveVenueId(s?.id) === directId) || {
					id: directId,
				}
			: null;

	const slug = resolveVenueSlug(resolved);
	const id = resolveVenueId(resolved);

	const basePath = slug
		? `/v/${encodeURIComponent(slug)}`
		: id
			? `/venue/${encodeURIComponent(id)}`
			: "/";
	const path = buildLocalePath(basePath, currentLocale.value);
	if (typeof window === "undefined") return `${SITE_ORIGIN}${path}`;
	return `${window.location.origin}${path}`;
};

const activeVenue = computed(() => {
	const targetSlug = resolveVenueSlug(route.params.slug);
	const targetId =
		resolveVenueId(route.params.id) || resolveVenueId(activeShopId.value);

	const candidates = [
		...(filteredShops.value || []),
		...(carouselShops.value || []),
		...(shops.value || []),
	];

	if (targetSlug) {
		return (
			candidates.find((shop) => resolveVenueSlug(shop?.slug) === targetSlug) ||
			null
		);
	}

	if (targetId) {
		return (
			candidates.find((shop) => resolveVenueId(shop?.id) === targetId) || null
		);
	}

	return null;
});

const seoTitle = computed(() =>
	activeVenue.value?.name
		? `${activeVenue.value.name} | VibeCity`
		: route.params.category
			? `${String(route.params.category)} | VibeCity`
			: "VibeCity - Chiang Mai Entertainment",
);

const seoDescription = computed(() => {
	if (!activeVenue.value) {
		if (route.params.category) {
			const category = String(route.params.category);
			return `Explore ${category} venues in Chiang Mai with VibeCity.`;
		}
		return "Discover the best nightlife, cafes, and events in Chiang Mai. Real-time vibes, exclusive deals, and local secrets.";
	}

	const venueName = activeVenue.value.name || "Venue";
	const venueCategory = activeVenue.value.category || "local spot";
	const venueDescription =
		activeVenue.value.description ||
		"Plan your next vibe with live local insights.";
	return `${venueName} (${venueCategory}) on VibeCity. ${venueDescription}`;
});

const seoCanonicalUrl = computed(() =>
	typeof window === "undefined"
		? `${SITE_ORIGIN}${canonicalPath.value}`
		: `${window.location.origin}${canonicalPath.value}`,
);

const seoOgImageUrl = computed(() => {
	const slug =
		resolveVenueSlug(activeVenue.value?.slug) ||
		resolveVenueSlug(route.params.slug);
	if (slug)
		return `${SITE_ORIGIN}/api/v1/seo/og/venue/${encodeURIComponent(slug)}.png`;
	return `${SITE_ORIGIN}/api/v1/seo/og/site.png`;
});

const buildBreadcrumbJsonLd = ({ name, url, category }) => {
	const items = [
		{
			"@type": "ListItem",
			position: 1,
			name: "VibeCity",
			item: `${SITE_ORIGIN}${buildLocalePath("/", currentLocale.value)}`,
		},
	];
	if (category) {
		items.push({
			"@type": "ListItem",
			position: items.length + 1,
			name: category,
			item: `${SITE_ORIGIN}${buildLocalePath(
				`/c/${encodeURIComponent(slugifyCategory(category))}`,
				currentLocale.value,
			)}`,
		});
	}
	if (name && url) {
		items.push({
			"@type": "ListItem",
			position: items.length + 1,
			name,
			item: url,
		});
	}
	return {
		"@type": "BreadcrumbList",
		itemListElement: items,
	};
};

const venueJsonLd = computed(() => {
	const v = activeVenue.value;
	if (!v?.name) return null;

	const images = Array.isArray(v.images)
		? v.images
		: Array.isArray(v.image_urls)
			? v.image_urls
			: [];
	const url = resolveVenueUrl(v);
	const ratingValue = Number(v.rating || 0);
	const reviewCount = Number(v.reviewCount ?? v.review_count ?? 0);

	const address = {
		"@type": "PostalAddress",
		addressLocality: v.district || v.Zone || undefined,
		addressRegion: v.province || v.Province || undefined,
		addressCountry: "TH",
	};

	const category = v.category || v.type;
	const categoryLower = String(category || "").toLowerCase();
	const isEvent = categoryLower === "event" || categoryLower.includes("event");
	const isRestaurant =
		categoryLower === "restaurant" || categoryLower.includes("restaurant");

	const graph = [
		{
			"@type": "LocalBusiness",
			name: v.name,
			description: v.description || undefined,
			url,
			image: images.filter(Boolean).slice(0, 5),
			telephone: v.phone || undefined,
			address,
			aggregateRating:
				Number.isFinite(ratingValue) &&
				ratingValue > 0 &&
				Number.isFinite(reviewCount) &&
				reviewCount > 0
					? {
							"@type": "AggregateRating",
							ratingValue,
							reviewCount,
						}
					: undefined,
			sameAs: [
				v.social_links?.instagram,
				v.social_links?.facebook,
				v.IG_URL,
				v.FB_URL,
			].filter(Boolean),
		},
		{
			"@type": "Place",
			name: v.name,
			url,
			address,
		},
		buildBreadcrumbJsonLd({ name: v.name, url, category: v.category }),
	];

	if (isRestaurant) {
		graph.push({
			"@type": "Restaurant",
			name: v.name,
			url,
			address,
			telephone: v.phone || undefined,
		});
	}

	if (isEvent) {
		const startDate = v.start_date || v.startDate || undefined;
		const endDate = v.end_date || v.endDate || undefined;
		graph.push({
			"@type": "Event",
			name: v.name,
			startDate,
			endDate,
			location: {
				"@type": "Place",
				name: v.name,
				address,
			},
		});
	}

	return JSON.parse(
		JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
	);
});

const categoryJsonLd = computed(() => {
	const raw = resolveCategoryParam(route.params.category);
	if (!raw) return null;
	const name = String(route.params.category);
	const url = `${SITE_ORIGIN}${buildLocalePath(`/c/${encodeURIComponent(raw)}`, currentLocale.value)}`;
	const graph = [
		{
			"@type": "CollectionPage",
			name,
			url,
		},
		buildBreadcrumbJsonLd({ name, url }),
	];
	return { "@context": "https://schema.org", "@graph": graph };
});

const hreflangLinks = computed(() => {
	const base = canonicalBasePath.value;
	return [
		{
			rel: "alternate",
			hreflang: "th",
			href: `${SITE_ORIGIN}${buildLocalePath(base, "th")}`,
		},
		{
			rel: "alternate",
			hreflang: "en",
			href: `${SITE_ORIGIN}${buildLocalePath(base, "en")}`,
		},
		{
			rel: "alternate",
			hreflang: "x-default",
			href: `${SITE_ORIGIN}${buildLocalePath(base, "th")}`,
		},
	];
});

useHead(() => ({
	title: seoTitle.value,
	link: [
		{ rel: "canonical", href: seoCanonicalUrl.value },
		...hreflangLinks.value,
	],
	meta: [
		{ name: "description", content: seoDescription.value },
		{ name: "theme-color", content: "#030305" },

		{ property: "og:title", content: seoTitle.value },
		{ property: "og:description", content: seoDescription.value },
		{ property: "og:url", content: seoCanonicalUrl.value },
		{ property: "og:type", content: "website" },
		{ property: "og:site_name", content: "VibeCity" },
		{ property: "og:image", content: seoOgImageUrl.value },

		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: seoTitle.value },
		{ name: "twitter:description", content: seoDescription.value },
		{ name: "twitter:image", content: seoOgImageUrl.value },
	],
	script:
		venueJsonLd.value || categoryJsonLd.value
			? [
					{
						type: "application/ld+json",
						children: JSON.stringify(venueJsonLd.value || categoryJsonLd.value),
					},
				]
			: [],
}));

const matchCategoryFromRoute = (value) => {
	const raw = String(value || "").trim();
	if (!raw) return null;
	const targetSlug = slugifyCategory(raw);
	if (!targetSlug) return raw;
	const candidates = [...(shops.value || []), ...(filteredShops.value || [])];
	for (const shop of candidates) {
		const cat = shop?.category;
		if (!cat) continue;
		if (slugifyCategory(cat) === targetSlug) return cat;
	}
	return raw;
};

const sanitizePartnerToken = (value) =>
	String(value || "")
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, "")
		.slice(0, 64);

const setPartnerCookie = (token) => {
	if (typeof document === "undefined") return;
	// biome-ignore lint/suspicious/noDocumentCookie: partner referral token persistence
	document.cookie = `vibe_partner_ref=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
};

const persistPartnerRef = (refValue) => {
	const token = sanitizePartnerToken(refValue);
	if (!token) return;
	try {
		localStorage.setItem("vibe_partner_ref", token);
	} catch {
		// ignore
	}
	setPartnerCookie(token);
};

watch(
	() => route.params.category,
	(value) => {
		const match = matchCategoryFromRoute(value);
		if (!match) {
			handleFilterApply([]);
			return;
		}
		handleFilterApply([match]);
	},
	{ immediate: true },
);

watch(
	() => route.query.ref,
	(value) => {
		persistPartnerRef(value);
	},
	{ immediate: true },
);

const handleLogoClick = () => {
	selectFeedback();
	// Reset venue selection + filters for a true "home" state.
	selectedShop.value = null;
	activeShopId.value = null;
	activeCategories.value = [];
	activeStatus.value = "ALL";
	router.push(`/${currentLocale.value}`).catch(() => {});
};

const openDailyCheckin = async () => {
	await nextTick();
	await dailyCheckinRef.value?.show?.();
};

const openLuckyWheel = async () => {
	await nextTick();
	await luckyWheelRef.value?.show?.();
};

const syncRewards = async () => {
	try {
		await refreshUserStats?.();
	} catch (error) {
		console.warn("[HomeView] Failed to refresh reward stats:", error);
	}
};

onMounted(() => {
	void featureFlagStore.refreshFlags().catch(() => {});
});

// Avoid noisy logs in production (keeps CI + monitoring clean).
if (import.meta.env.DEV) {
	onMounted(() => {
		console.log("🔍 [HomeView] Mounted");
		console.log("🔍 [HomeView] isMobileView:", isMobileView.value);
		console.log("🔍 [HomeView] isLandscape:", isLandscape.value);
		console.log("🔍 [HomeView] isUiVisible:", isUiVisible.value);
		console.log("🔍 [HomeView] carouselShops:", carouselShops.value?.length);
	});
}
</script>

<template>
  <main
    id="main-content"
    :class="[
      'relative w-full h-[100dvh] overflow-hidden font-sans transition-colors duration-500',
      isDarkMode ? 'bg-void' : 'bg-gray-100',
      { 'low-power': isLowPowerMode },
    ]"
  >
    <!-- Note: isLowPowerMode is exported from useAppLogic -->

    <!-- ✅ Global Error State -->
    <VibeError v-if="errorMessage" :message="errorMessage" @retry="retryLoad" />

    <!-- ✅ Loading State (Initial) -->
    <div
      v-if="isDataLoading && !realTimeEvents.length"
      class="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl"
    >
      <div class="flex flex-col items-center gap-4">
        <VibeSkeleton variant="circle" height="60px" width="60px" />
        <VibeSkeleton variant="text" height="20px" width="150px" />
      </div>
    </div>

    <!-- ✅ Sidebar Drawer -->
    <div data-testid="drawer-shell">
      <SidebarDrawer
        :is-open="showSidebar"
        :show-partner-program="isPartnerProgramEnabled"
        :user-stats="{
          name: 'Vibe Explorer',
          level: Math.floor(totalCoins / 100) + 1,
          coins: totalCoins,
          avatar: null,
        }"
        :is-muted="isMuted"
        :current-language="$i18n?.locale || 'en'"
        @close="showSidebar = false"
        @navigate="
          (id) => {
            /* Navigation Logic */
          }
        "
        @open-merchant="
          showSidebar = false;
          showMerchantModal = true;
        "
        @toggle-mute="toggleMute"
        @toggle-language="toggleLanguage"
        @take-me-home="handleTakeMeHome"
        @open-sos="handleOpenSOS"
        @open-daily-checkin="openDailyCheckin"
        @open-lucky-wheel="openLuckyWheel"
        @open-dashboard="
          showSidebar = false;
          router.push('/merchant');
        "
        @open-partner="
          showSidebar = false;
          router.push('/partner');
        "
      />

      <MerchantRegister
        v-if="showMerchantModal"
        :is-open="showMerchantModal"
        @close="showMerchantModal = false"
      />

      <FilterMenu
        v-if="showFilterMenu"
        :is-open="showFilterMenu"
        :selected-categories="activeFilters"
        @close="showFilterMenu = false"
        @apply="handleFilterApply"
      />

      <!-- Filter button moved to be hidden during video expansion -->

      <!-- Stack View (Related Vibes) -->
      <RelatedShopsDrawer
        v-if="showRelatedDrawer"
        :is-open="showRelatedDrawer"
        :shops="suggestedShops"
        @close="showRelatedDrawer = false"
        @select-shop="handleCardClick"
      />

      <!-- ✅ Safety Panel (SOS + Take Me Home) -->
      <SafetyPanel
        :is-open="showSafetyPanel"
        :user-location="userLocation"
        @close="handleCloseSOS"
        @navigate-home="handleTakeMeHome"
      />

      <!-- ✅ Favorites Modal -->
      <FavoritesModal
        :is-open="showFavoritesModal"
        @close="handleCloseFavorites"
        @select-shop="handleCardClick"
      />

      <DailyCheckin
        ref="dailyCheckinRef"
        :is-dark-mode="isDarkMode"
        @claim="syncRewards"
        @close="syncRewards"
      />

      <LuckyWheel
        ref="luckyWheelRef"
        :is-dark-mode="isDarkMode"
        @spin-complete="syncRewards"
        @close="syncRewards"
      />
    </div>

    <!-- ✅ Smart Header (Auto-hide) -->
    <Transition name="ui-slide-down">
      <SmartHeader
        v-show="isUiVisible"
        :isVibeNowCollapsed="isVibeNowCollapsed"
        :isDarkMode="isDarkMode"
        :globalSearchQuery="globalSearchQuery"
        :showSearchResults="showSearchResults"
        :globalSearchResults="globalSearchResults"
        :t="t"
        @open-sidebar="showSidebar = true"
        @open-filter="showFilterMenu = true"
        @open-add-shop="showAddShopModal = true"
        @update:globalSearchQuery="(val) => (globalSearchQuery = val)"
        @update:showSearchResults="(val) => (showSearchResults = val)"
        @select-search-result="handleGlobalSearchSelect"
        @haptic-tap="tapFeedback"
        @open-profile="showProfileDrawer = true"
        :is-immersive="isImmersive"
      />
    </Transition>

    <!-- ✅ Geofenced Local Ad Banner -->
    <LocalAdBanner v-if="currentAd" :ad="currentAd" @dismiss="dismissAd" />

    <!-- ✅ Landscape Wrapper -->
    <div
      class="relative h-full w-full transition-[grid-template-columns,transform,opacity] duration-500"
      :class="isLandscape ? 'grid grid-cols-[60%_40%]' : ''"
    >
      <!-- Desktop Layout: Map (65%) + Panel (35%) -->
      <div v-if="!isMobileView" class="grid grid-cols-[65%_35%] h-full">
        <!-- Map Container -->
        <div data-testid="map-shell-wrapper" class="relative">
          <MapContainer
            ref="mapRef"
            :uiTopOffset="mapUiTopOffset"
            :uiBottomOffset="mapUiBottomOffset"
            :shops="filteredShops"
            :userLocation="userLocation"
            :currentTime="currentTime"
            :highlightedShopId="activeShopId"
            :is-low-power-mode="isLowPowerMode"
            :priority-shop-ids="carouselShopIds"
            :isDarkMode="isDarkMode"
            :activeZone="activeZone"
            :activeProvince="activeProvince"
            :buildings="activeEvents"
            :is-sidebar-open="isPanelOpen"
            :selectedShopCoords="selectedShopCoords"
            :isImmersive="isImmersive"
            :isGiantPinView="isGiantPinView"
            @select-shop="handleMarkerClick"
            @open-detail="handleOpenDetail"
            @open-ride-modal="openRideModal"
            @exit-indoor="handleCloseFloorSelector"
            @open-building="handleBuildingOpen"
          />

          <!-- Navigation Legend (Desktop) -->
          <div
            v-if="!isMobileView"
            class="absolute top-4 right-4 z-[2000] flex flex-col gap-2"
          >
            <div
              class="bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl"
            >
              <h4
                class="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2"
              >
                {{ t("legend.title") }}
              </h4>
              <!-- Logo / Header -->
              <button
                type="button"
                class="absolute top-4 left-4 z-50 cursor-pointer pointer-events-auto rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                aria-label="Go to VibeCity home"
                @click="handleLogoClick"
              >
                <h1
                  class="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] filter"
                >
                  VIBES<span class="text-white">CITY</span>
                </h1>
              </button>
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <div
                    class="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                  ></div>
                  <span class="text-[11px] font-bold text-white">{{
                    t("legend.live_now")
                  }}</span>
                </div>
                <!-- More legend items implied, simplified in refactor as pure markup -->
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <span class="text-[11px] font-bold text-white">{{
                    t("legend.coin_reward")
                  }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span class="text-[11px] font-bold text-white">{{
                    t("legend.selected")
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Video Panel -->
        <VideoPanel
          ref="panelRef"
          :shops="filteredShops"
          :activeShopId="activeShopId"
          :isDarkMode="isDarkMode"
          :favorites="favorites"
          @scroll-to-shop="handlePanelScroll"
          @select-shop="handleCardClick"
          @open-detail="handleOpenDetail"
          @hover-shop="handleCardHover"
          @toggle-favorite="toggleFavorite"
        />
      </div>

      <!-- Mobile Layout: Full Map + Small Floating Button -->
      <!-- ✅ Landscape Mobile Layout (YouTube Style) -->
      <div
        v-if="isMobileView && isLandscape"
        data-testid="video-layout-landscape"
        class="contents"
      >
        <!-- Left: Map (60%) -->
        <div
          data-testid="map-shell-wrapper"
          class="relative h-full border-r border-white/10 overflow-hidden"
        >
          <MapContainer
            ref="mapRef"
            :shops="shops"
            :highlighted-shop-id="activeShopId"
            :is-dark-mode="isDarkMode"
            :ui-bottom-offset="0"
            @select-shop="handleMarkerClick"
          />
        </div>

        <!-- Right: Feed (40%) -->
        <div class="h-full bg-black overflow-y-auto no-scrollbar relative">
          <div class="p-4 pt-16 grid grid-cols-1 gap-4">
            <SwipeCard
              v-for="shop in shops.slice(0, 10)"
              :key="`land-${shop.id}`"
              :show-expand="false"
              class="w-full aspect-[9/16] rounded-xl overflow-hidden shadow-lg border border-white/10"
            >
              <img
                :src="shop.Image_URL1"
                :alt="shop.name || 'Shop preview'"
                class="w-full h-full object-cover"
              />
              <div
                class="absolute bottom-4 left-4 font-bold text-white uppercase shadow-black drop-shadow-md"
              >
                {{ shop.name }}
              </div>
            </SwipeCard>
          </div>
        </div>
      </div>

      <!-- Portrait Mobile Layout -->
      <template v-else-if="!isLandscape">
        <!-- Full Map (Hidden in Immersive Mode) -->
        <div
          data-testid="map-shell-wrapper"
          class="absolute inset-0"
          v-show="!isImmersive"
        >
          <MapContainer
            ref="mapRef"
            :uiTopOffset="mapUiTopOffset"
            :uiBottomOffset="mapUiBottomOffset"
            :shops="filteredShops"
            :userLocation="userLocation"
            :currentTime="null"
            :highlightedShopId="activeShopId"
            :is-low-power-mode="false"
            :isDarkMode="isDarkMode"
            :activeZone="activeZone"
            :activeProvince="activeProvince"
            :buildings="activeEvents"
            :isSidebarOpen="!isVibeNowCollapsed"
            :selectedShopCoords="selectedShopCoords"
            :legendHeight="legendHeight"
            :isImmersive="isImmersive"
            :isGiantPinView="isGiantPinView"
            @select-shop="handleMarkerClick"
            @open-detail="handleOpenDetail"
            @open-ride-modal="openRideModal"
            @exit-indoor="handleCloseFloorSelector"
            @open-building="handleBuildingOpen"
            class="w-full h-full"
          />
        </div>

        <!-- ✅ Immersive Feed (Replaces Map & Bottom UI) -->
        <transition name="fade">
          <ImmersiveFeed
            v-if="isImmersive"
            :initial-shop-id="activeShopId"
            @close="isImmersive = false"
            @update-shop="activeShopId = $event"
          />
        </transition>

        <!-- REMOVED Transition for Debugging -->
        <div
          v-show="isUiVisible && !isImmersive"
          class="absolute bottom-0 left-0 right-0 z-10 pointer-events-auto"
        >
          <BottomFeed
            ref="bottomUiRef"
            :is-data-loading="isDataLoading"
            :is-refreshing="isRefreshing"
            :is-immersive="isImmersive"
            :enable-cinema-explorer="isCinemaExplorerEnabled"
            :is-dark-mode="isDarkMode"
            :is-indoor-view="isIndoorView"
            :active-floor="activeFloor"
            :live-count="liveCount"
            :carousel-shops="carouselShops"
            :suggested-shops="suggestedShops"
            :favorites="favorites"
            :active-shop-id="activeShopId"
            :mall-shops="mallShops"
            :set-bottom-ui-ref="setBottomUiRef"
            :set-mobile-card-scroll-ref="setMobileCardScrollRef"
            @click-shop="handleCardClick"
            @open-detail="handleOpenDetail"
            @open-ride="openRideModal"
            @swipe-left="(shop) => handleSwipe('left', shop)"
            @swipe-right="(shop) => handleSwipe('right', shop)"
            @toggle-favorite="toggleFavorite"
            @share-shop="
              (shop) => {
                /* ✅ Handle Share safely */
                const shareUrl = resolveVenueUrl(shop?.id);
                if (
                  typeof window !== 'undefined' &&
                  window.navigator &&
                  window.navigator.share
                ) {
                  window.navigator
                    .share({
                      title: shop?.name || 'VibeCity Shop',
                      text: `Check out ${shop?.name || 'this shop'} on VibeCity!`,
                      url: shareUrl,
                    })
                    .catch((err) => console.warn('Share failed:', err));
                } else {
                  window.navigator?.clipboard
                    ?.writeText(shareUrl)
                    .catch(() => console.log('Clipboard fallback unavailable'));
                }
              }
            "
            @toggle-immersive="toggleImmersive"
            @set-active-floor="(f) => (activeFloor = f)"
            @reset-filters="
              () => {
                activeCategories = [];
                activeStatus = 'ALL';
              }
            "
            @scroll="handleHorizontalScroll"
            @scroll-start="onScrollStart"
            @scroll-end="onScrollEnd"
            @load-more="loadMoreVibes"
            @refresh="handleRefresh"
            @enter-giant-view="onEnterGiantView"
            @exit-giant-view="onExitGiantView"
          />
        </div>
        <!-- /Transition -->
      </template>
    </div>

    <!-- Owner Dashboard moved to /merchant route -->

    <!-- ✅ UGC Add Shop Modal -->
    <AddShopModal
      :is-open="showAddShopModal"
      @close="showAddShopModal = false"
      @success="showAddShopModal = false"
    />

    <!-- ✅ Common Modals & Overlays -->
    <AppModals
      :selectedShop="selectedShop"
      :rideModalShop="rideModalShop"
      :showMallDrawer="showMallDrawer"
      :activeMall="activeMall"
      :mallShops="mallShops"
      :activeShopId="activeShopId"
      :favorites="favorites"
      :showProfileDrawer="showProfileDrawer"
      :isDarkMode="isDarkMode"
      :isDataLoading="isDataLoading"
      :isInitialLoad="isInitialLoad"
      :errorMessage="errorMessage"
      :showConfetti="showConfetti"
      :userLocation="userLocation"
      @close-vibe-modal="closeDetailSheet({ syncRoute: true, replace: true })"
      @toggle-favorite="toggleFavorite"
      @close-ride-modal="closeRideModal"
      @open-ride-app="openRideApp"
      @close-mall-drawer="showMallDrawer = false"
      @select-mall-shop="handleMarkerClick"
      @open-ride-modal="openRideModal"
      @close-profile-drawer="showProfileDrawer = false"
      @toggle-language="toggleLanguage"
      @clear-error="errorMessage = null"
      @retry="retryLoad"
    />

    <!-- ✅ Floating Action Buttons REMOVED per user request (pink heart + orange safety were blocking carousel) -->
  </main>
</template>

<style scoped>
/* Transferred Layout Styles */
.low-power {
  /* Optimize for low power mode */
  filter: contrast(0.9);
}
</style>
