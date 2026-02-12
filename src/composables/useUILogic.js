import { nextTick, onMounted, onUnmounted, ref } from "vue";

export function useUILogic() {
	// --- Layout Refs ---
	const bottomUiRef = ref(null);
	const bottomUiHeight = ref(0);
	const mobileCardScrollRef = ref(null); // Used by scroll sync

	// --- Responsive State ---
	const isMobileView = ref(false);
	const isLandscape = ref(false);

	const checkMobileView = () => {
		isMobileView.value = window.innerWidth < 768;
		console.log(
			`🔍 [useUILogic] checkMobileView: width=${window.innerWidth} -> isMobileView=${isMobileView.value}`,
		);
	};

	const checkOrientation = () => {
		isLandscape.value = window.innerWidth > window.innerHeight;
	};

	const measureBottomUi = () => {
		bottomUiHeight.value = bottomUiRef.value?.offsetHeight || 0;
	};

	// --- Lifecycle Hooks for Layout ---
	onMounted(() => {
		checkMobileView();
		checkOrientation();
		measureBottomUi();

		window.addEventListener("resize", checkMobileView);
		window.addEventListener("resize", checkOrientation);
		window.addEventListener("resize", measureBottomUi);

		// Initial measurement with tick
		nextTick(measureBottomUi);
	});

	onUnmounted(() => {
		window.removeEventListener("resize", checkMobileView);
		window.removeEventListener("resize", checkOrientation);
		window.removeEventListener("resize", measureBottomUi);
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
		isMobileView,
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
