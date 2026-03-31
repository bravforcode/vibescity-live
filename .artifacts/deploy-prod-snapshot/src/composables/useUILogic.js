import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const MOBILE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1279;

export function useUILogic() {
	// --- Layout Refs ---
	const bottomUiRef = ref(null);
	const bottomUiHeight = ref(0);
	const mobileCardScrollRef = ref(null); // Used by scroll sync

	// --- Responsive State ---
	const viewportWidth = ref(0);
	const viewportHeight = ref(0);
	const isMobileView = ref(false);
	const isLandscape = ref(false);
	const isTabletView = computed(
		() =>
			viewportWidth.value > MOBILE_MAX_WIDTH &&
			viewportWidth.value <= TABLET_MAX_WIDTH,
	);
	const isDesktopView = computed(() => viewportWidth.value > TABLET_MAX_WIDTH);

	const updateViewportState = () => {
		if (typeof window === "undefined") return;
		const vv = window.visualViewport;
		const nextWidth = Math.round(
			vv?.width ||
				window.innerWidth ||
				document.documentElement?.clientWidth ||
				0,
		);
		const nextHeight = Math.round(
			vv?.height ||
				window.innerHeight ||
				document.documentElement?.clientHeight ||
				0,
		);
		viewportWidth.value = nextWidth;
		viewportHeight.value = nextHeight;
		isMobileView.value = nextWidth <= MOBILE_MAX_WIDTH;
		isLandscape.value = nextWidth > nextHeight;
	};

	const checkMobileView = () => updateViewportState();
	const checkOrientation = () => updateViewportState();

	const measureBottomUi = () => {
		bottomUiHeight.value = bottomUiRef.value?.offsetHeight || 0;
	};
	let bottomUiObserver = null;
	let viewportRaf = 0;

	const attachBottomUiObserver = () => {
		if (bottomUiObserver) {
			bottomUiObserver.disconnect();
			bottomUiObserver = null;
		}
		if (!bottomUiRef.value || typeof ResizeObserver === "undefined") return;
		bottomUiObserver = new ResizeObserver(() => {
			measureBottomUi();
		});
		bottomUiObserver.observe(bottomUiRef.value);
	};

	const scheduleViewportUpdate = () => {
		if (typeof window === "undefined") return;
		if (viewportRaf) return;
		viewportRaf = window.requestAnimationFrame(() => {
			viewportRaf = 0;
			updateViewportState();
			measureBottomUi();
		});
	};

	// --- Lifecycle Hooks for Layout ---
	onMounted(() => {
		updateViewportState();
		measureBottomUi();

		window.addEventListener("resize", scheduleViewportUpdate, {
			passive: true,
		});
		window.addEventListener("orientationchange", scheduleViewportUpdate, {
			passive: true,
		});
		window.visualViewport?.addEventListener("resize", scheduleViewportUpdate, {
			passive: true,
		});
		window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate, {
			passive: true,
		});

		// Initial measurement with tick
		nextTick(() => {
			measureBottomUi();
			attachBottomUiObserver();
		});
	});

	watch(bottomUiRef, () => {
		nextTick(() => {
			measureBottomUi();
			attachBottomUiObserver();
		});
	});

	onUnmounted(() => {
		window.removeEventListener("resize", scheduleViewportUpdate);
		window.removeEventListener("orientationchange", scheduleViewportUpdate);
		window.visualViewport?.removeEventListener(
			"resize",
			scheduleViewportUpdate,
		);
		window.visualViewport?.removeEventListener(
			"scroll",
			scheduleViewportUpdate,
		);
		if (viewportRaf) {
			cancelAnimationFrame(viewportRaf);
			viewportRaf = 0;
		}
		if (bottomUiObserver) {
			bottomUiObserver.disconnect();
			bottomUiObserver = null;
		}
	});

	// --- Drawers & View States ---
	const showSidebar = ref(false);
	const showProfileDrawer = ref(false); // Legacy/Compat
	const showMallDrawer = ref(false);
	const showCategoryDropdown = ref(false);
	const showFloorSelector = ref(false);
	const showSearchResults = ref(false);
	const activePopup = ref(null);

	// Mobile Specific
	const isVibeNowCollapsed = ref(false);
	const toggleVibeNow = () => {
		isVibeNowCollapsed.value = !isVibeNowCollapsed.value;
		nextTick(measureBottomUi); // Remeasure after toggle
	};
	const isImmersive = ref(false);
	const toggleImmersive = () => {
		isImmersive.value = !isImmersive.value;
	};

	// Modals/Overlays
	const activeTab = ref("map");
	const rideModalShop = ref(null);
	const isPanelOpen = ref(true); // Desktop panel
	const isGalleryOpen = ref(false);

	// Feedback
	const errorMessage = ref(null);
	const showConfetti = ref(false);

	return {
		// Refs
		bottomUiRef,
		bottomUiHeight,
		mobileCardScrollRef,

		// State
		viewportWidth,
		viewportHeight,
		isMobileView,
		isTabletView,
		isDesktopView,
		isLandscape,
		showSidebar,
		showProfileDrawer,
		showMallDrawer,
		showCategoryDropdown,
		showFloorSelector,
		showSearchResults,
		activePopup,
		isVibeNowCollapsed,
		isImmersive,
		activeTab,
		rideModalShop,
		isPanelOpen,
		isGalleryOpen,
		errorMessage,
		showConfetti,

		// Methods
		toggleVibeNow,
		toggleImmersive,
		checkMobileView,
		measureBottomUi,
	};
}
