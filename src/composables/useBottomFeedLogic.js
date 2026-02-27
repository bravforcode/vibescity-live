import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { resolveVenueMedia } from "../domain/venue/viewModel";
import { useFeatureFlagStore } from "../store/featureFlagStore";

/**
 * Bottom Feed Logic Composable
 * Extracted from BottomFeed.vue for better separation of concerns
 */
export function useBottomFeedLogic(props, emit) {
	const featureFlagStore = useFeatureFlagStore();
	const useVirtualizedFeed = computed(() =>
		featureFlagStore.isEnabled("enable_feed_virtualization_v2"),
	);

	// ✅ Giant Pin View State (70/30 Split)
	const isGiantPinView = ref(false);
	const activeGiantPin = ref(null);
	const giantPinShops = ref([]);
	const selectedGiantShop = ref(null);
	const selectedGiantImageIndex = ref(0);
	let giantImageRotateTimer = null;

	// ✅ TikTok-style Video Expansion State
	const isVideoExpanded = ref(false);
	const expandedShop = ref(null);
	const videoRef = ref(null);
	const canAutoExpand = ref(true);

	// ✅ Scroll State
	let scrollFrame = null;
	let lastScrollTime = 0;
	const SCROLL_THROTTLE = 100;
	let autoOpenTimer = null; // Debounce timer for auto-opening modal
	const autoOpenedShops = new Set(); // Track shops already auto-opened this session

	// ✅ Utility Functions
	const normalizeId = (value) => {
		if (value === null || value === undefined) return "";
		return String(value).trim();
	};

	const getShopVideoUrl = (shop) =>
		resolveVenueMedia(shop || {}).videoUrl || "";

	const getShopImages = (shop) => {
		const media = resolveVenueMedia(shop || {});
		return Array.isArray(media.images) ? media.images.filter(Boolean) : [];
	};

	const isCinemaEligible = (shop) => {
		if (!shop || !props.enableCinemaExplorer) return false;
		const pinType = String(shop.pin_type || "").toLowerCase();
		const pinState = String(shop.pin_state || shop.statusNormalized || "")
			.trim()
			.toLowerCase();
		return (
			shop?.is_giant_active === true ||
			shop?.isGiantPin === true ||
			pinType === "giant" ||
			pinState === "event"
		);
	};

	const getShopPreviewImage = (shop) => getShopImages(shop)[0] || "";

	// ✅ Computed Properties
	const selectedGiantVideoUrl = computed(() =>
		getShopVideoUrl(selectedGiantShop.value),
	);

	const selectedGiantImages = computed(() =>
		getShopImages(selectedGiantShop.value),
	);

	const selectedGiantImage = computed(() => {
		if (selectedGiantImages.value.length === 0) return "";
		const index =
			selectedGiantImageIndex.value % selectedGiantImages.value.length;
		return selectedGiantImages.value[index] || selectedGiantImages.value[0];
	});

	const currentShopIsGiant = computed(() => {
		if (!props.activeShopId) return false;
		const shop = props.carouselShops.find((s) => s.id == props.activeShopId);
		return isCinemaEligible(shop);
	});

	// ✅ Giant Pin Activation Watcher
	watch(
		() => props.activeShopId,
		(newId) => {
			if (!newId) {
				isGiantPinView.value = false;
				activeGiantPin.value = null;
				return;
			}

			const shop = props.carouselShops.find((s) => s.id == newId);
			if (isCinemaEligible(shop)) {
				activeGiantPin.value = shop;
				isGiantPinView.value = true;
				giantPinShops.value = props.carouselShops.filter(
					(s) =>
						s?.building === shop?.name ||
						s?.Building === shop?.name ||
						s?.building === shop?.building ||
						s?.Building === shop?.Building,
				);
				selectedGiantShop.value = giantPinShops.value[0] || shop;
				emit("enter-giant-view", shop);
			} else {
				isGiantPinView.value = false;
				activeGiantPin.value = null;
			}
		},
	);

	// ✅ Giant Pin Image Rotation
	watch(selectedGiantShop, () => {
		selectedGiantImageIndex.value = 0;
		if (giantImageRotateTimer) {
			clearInterval(giantImageRotateTimer);
			giantImageRotateTimer = null;
		}
		if (!selectedGiantShop.value) return;
		if (selectedGiantVideoUrl.value) return;
		const totalImages = selectedGiantImages.value.length;
		if (totalImages <= 1) return;
		giantImageRotateTimer = setInterval(() => {
			selectedGiantImageIndex.value =
				(selectedGiantImageIndex.value + 1) % totalImages;
		}, 4500);
	});

	// ✅ Giant Pin Actions
	const exitGiantView = () => {
		isGiantPinView.value = false;
		activeGiantPin.value = null;
		emit("exit-giant-view");
	};

	const selectGiantShop = (shop) => {
		selectedGiantShop.value = shop;
		selectedGiantImageIndex.value = 0;
		emit("click-shop", shop);
	};

	// ✅ Video Expansion Actions
	const expandVideo = (shop) => {
		if (!shop || !canAutoExpand.value) return;
		expandedShop.value = shop;
		isVideoExpanded.value = true;

		nextTick(() => {
			if (videoRef.value) {
				videoRef.value.muted = true;
				videoRef.value.play().catch(() => {});
			}
		});
	};

	const closeExpandedVideo = () => {
		isVideoExpanded.value = false;
		if (videoRef.value) {
			videoRef.value.pause();
		}
		expandedShop.value = null;

		// Cooldown period
		canAutoExpand.value = false;
		setTimeout(() => {
			canAutoExpand.value = true;
		}, 2000);
	};

	const selectShop = (shop) => {
		if (!shop) return;
		expandedShop.value = shop;

		nextTick(() => {
			if (videoRef.value) {
				videoRef.value.muted = true;
				videoRef.value.play().catch(() => {});
			}
		});

		emit("click-shop", shop);
	};

	// ✅ Scroll Handling
	const detectActiveCard = (container) => {
		if (!props.carouselShops.length) return;

		// 1. Immersive Mode (Vertical Snap)
		if (props.isImmersive) {
			const itemHeight = window.innerHeight;
			const triggerPoint = container.scrollTop + itemHeight / 2;
			const index = Math.floor(triggerPoint / itemHeight);

			const shop = props.carouselShops[index];
			if (shop && normalizeId(shop.id) !== normalizeId(props.activeShopId)) {
				emit("click-shop", shop);
				// Auto-open modal with debounce — only once per shop per session
				const shopKey = normalizeId(shop.id);
				if (shopKey && !autoOpenedShops.has(shopKey)) {
					if (autoOpenTimer) clearTimeout(autoOpenTimer);
					autoOpenTimer = setTimeout(() => {
						autoOpenedShops.add(shopKey);
						emit("open-detail", shop);
						autoOpenTimer = null;
					}, 350);
				}
			}
			return;
		}

		// 2. Normal Carousel (Horizontal)
		const cardWidth = 220;
		const gap = 12;
		const cardStride = cardWidth + gap;

		const center = container.scrollLeft + container.clientWidth / 2;
		const index = Math.round((center - cardStride / 2) / cardStride);

		if (index >= 0 && index < props.carouselShops.length) {
			const shop = props.carouselShops[index];
			if (shop && normalizeId(shop.id) !== normalizeId(props.activeShopId)) {
				emit("click-shop", shop);
				// Auto-open modal with debounce — only once per shop per session
				const shopKey = normalizeId(shop.id);
				if (shopKey && !autoOpenedShops.has(shopKey)) {
					if (autoOpenTimer) clearTimeout(autoOpenTimer);
					autoOpenTimer = setTimeout(() => {
						autoOpenedShops.add(shopKey);
						emit("open-detail", shop);
						autoOpenTimer = null;
					}, 350);
				}
			}
		}
	};

	const handleScroll = (e) => {
		const now = Date.now();
		const throttleMs = useVirtualizedFeed.value ? 60 : SCROLL_THROTTLE;
		if (now - lastScrollTime < throttleMs) return;
		lastScrollTime = now;

		emit("scroll", e);

		const container = e.target;
		const { scrollLeft, clientWidth, scrollWidth } = container;

		// Infinite scroll trigger
		if (scrollLeft + clientWidth >= scrollWidth - 200) {
			emit("load-more");
		}

		// Optimized active detection — runs in BOTH carousel and immersive mode
		if (scrollFrame) cancelAnimationFrame(scrollFrame);
		scrollFrame = requestAnimationFrame(() => {
			detectActiveCard(container);
			scrollFrame = null;
		});
	};

	// ✅ Analytics (placeholder for future integration)
	const trackView = (shopId) => {
		if (import.meta.env.DEV) {
			console.log("📊 [Analytics] Track view:", shopId);
		}
		// Future: integrate with analytics service
	};

	const trackImpression = (shopId) => {
		if (import.meta.env.DEV) {
			console.log("📊 [Analytics] Track impression:", shopId);
		}
		// Future: integrate with analytics service
	};

	// ✅ Lifecycle
	onMounted(() => {
		void featureFlagStore.refreshFlags().catch(() => {});
		if (import.meta.env.DEV) {
			console.log("🔍 [BottomFeedLogic] MOUNTED");
		}

		// Initial check
		setTimeout(() => {
			const el = document.querySelector('[data-testid="vibe-carousel"]');
			if (el && props.isImmersive) detectActiveCard(el);
		}, 500);
	});

	onUnmounted(() => {
		if (scrollFrame) cancelAnimationFrame(scrollFrame);
		if (giantImageRotateTimer) clearInterval(giantImageRotateTimer);
		if (autoOpenTimer) clearTimeout(autoOpenTimer);
	});

	return {
		// State
		isGiantPinView,
		activeGiantPin,
		giantPinShops,
		selectedGiantShop,
		selectedGiantImageIndex,
		isVideoExpanded,
		expandedShop,
		videoRef,
		canAutoExpand,

		// Computed
		selectedGiantVideoUrl,
		selectedGiantImages,
		selectedGiantImage,
		currentShopIsGiant,

		// Methods
		normalizeId,
		getShopVideoUrl,
		getShopImages,
		isCinemaEligible,
		getShopPreviewImage,
		exitGiantView,
		selectGiantShop,
		expandVideo,
		closeExpandedVideo,
		selectShop,
		handleScroll,
		detectActiveCard,
		trackView,
		trackImpression,
	};
}
