<script setup>
import { useMotion } from "@vueuse/motion";
import {
	computed,
	defineAsyncComponent,
	inject,
	nextTick,
	onMounted,
	onUnmounted,
	ref,
	watch,
	watchEffect,
} from "vue";
import { useChromaticGlass } from "../../composables/engine/useChromaticGlass.js";
import { useGranularAudio } from "../../composables/engine/useGranularAudio.js";
import { useFocusTrap } from "../../composables/useFocusTrap";
import { useHaptics } from "../../composables/useHaptics";
import { Z } from "../../constants/zIndex";
import { resolveVenueMedia } from "../../domain/venue/viewModel";
import { getMediaDetails } from "../../utils/linkHelper";
import AsyncFallback from "../ui/AsyncFallback.vue";

// ==========================================
// ✅ LAZY LOADED COMPONENTS
// ==========================================
const VisitorCount = defineAsyncComponent({
	loader: () => import("../ui/VisitorCount.vue"),
	errorComponent: AsyncFallback,
	delay: 200,
	timeout: 8000,
});

const ReviewSystem = defineAsyncComponent({
	loader: () => import("../ui/ReviewSystem.vue"),
	errorComponent: AsyncFallback,
	delay: 200,
	timeout: 8000,
});

const PhotoGallery = defineAsyncComponent({
	loader: () => import("../ui/PhotoGallery.vue"),
	errorComponent: AsyncFallback,
	delay: 120,
	timeout: 8000,
});

// ==========================================
// ✅ IMPORTS
// ==========================================
import {
	Car,
	ChevronLeft,
	ChevronRight,
	Clock,
	Facebook,
	Heart,
	Instagram,
	MapPin,
	Navigation,
	Share2,
	Sparkles,
	Users,
	X,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useNeonSignTheme } from "../../composables/map/useNeonSignTheme";
import {
	openBoltApp,
	openGrabApp,
	openLinemanApp,
} from "../../services/DeepLinkService";
import { getRealVenueMedia } from "../../services/shopService";
import {
	copyToClipboard,
	isMobileDevice,
	openGoogleMapsDir,
	shareLocation,
} from "../../utils/browserUtils";
import { getStatusColorClass } from "../../utils/shopUtils";

// ==========================================
// ✅ CONSTANTS
// ==========================================
const FALLBACK_IMAGE =
	"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%230b1020'/><stop offset='1' stop-color='%2311162a'/></linearGradient></defs><rect width='1600' height='1000' fill='url(%23g)'/></svg>";
const DOUBLE_TAP_DELAY = 300;
const MAX_FLASH_WINDOW = 1200000; // 20 minutes
const DISMISS_THRESHOLD = {
	DISTANCE: 150,
	VELOCITY: 0.5,
	QUICK_FLICK: 60,
};

// ==========================================
// ✅ COMPOSABLES & PROPS
// ==========================================
const { t } = useI18n();
const { selectFeedback, successFeedback, impactFeedback } = useHaptics();
const {
	onSwipe: audioSwipe,
	onSnap: audioSnap,
	onDismiss: audioDismiss,
} = useGranularAudio();
const props = defineProps({
	shop: {
		type: Object,
		required: true,
		validator: (shop) => shop && typeof shop === "object" && shop.id,
	},
	initialIndex: {
		type: Number,
		default: 0,
	},
	userCount: {
		type: Number,
		default: null,
	},
	userLocation: {
		type: Array,
		default: null,
	},
});

const emit = defineEmits(["close", "toggle-favorite"]);

// ==========================================
// ✅ STATE MANAGEMENT
// ==========================================

// UI State
const modalCard = ref(null);

// ✅ A11y: Focus trap within modal
useFocusTrap(modalCard);

// Neon sign theme — derive venue's neon color to anchor modal to its sign
const { getNeonDescriptor } = useNeonSignTheme();
const modalNeonColor = computed(() => {
	try {
		const d = getNeonDescriptor(props.shop);
		return d?.neon_theme?.frame || "#06b6d4";
	} catch {
		return "#06b6d4";
	}
});
const modalNeonGlow = computed(() => {
	const hex = modalNeonColor.value;
	const r = parseInt(hex.slice(1, 3), 16) || 6;
	const g = parseInt(hex.slice(3, 5), 16) || 182;
	const b = parseInt(hex.slice(5, 7), 16) || 212;
	return `rgba(${r},${g},${b},0.6)`;
});

// Refractive glass panel — placed after modalCard so ref is captured
const { enabled: glassEnabled, fallbackClass } = useChromaticGlass({
	panelId: "vibe-modal",
	panelRef: modalCard,
	aberration: 0.006,
});
const scrollContentRef = ref(null);
const imageCarouselRef = ref(null);
const videoPlayer = ref(null);

// Animation State
const isDragging = ref(false);
const dragProgress = ref(0);
const showHeartAnim = ref(false);
const touchStart = ref({ y: 0, t: 0 });
const initialScrollTop = ref(0);

// Gallery State
const currentImageIndex = ref(0);
const lastHapticIndex = ref(-1); // For dots snap haptics
const isGalleryOpen = ref(false);
const galleryInitialIndex = ref(0);

// Real Media State
const realMediaData = ref(null);

// Ride App State
const showRidePopup = ref(false);
const copyStatus = ref("");
const rideLoading = ref("");
const isMobile = ref(false);
const modalTitleId = "vibe-modal-title";

// --- Cinematic Spatial Physics: Dynamic Map Padding ---
const mapPaddingApi = inject("mapPaddingApi", null);

// Promotion State
const timeLeft = ref("");
const isPromoActive = ref(false);
let timerInterval = null;

// Lazy Loading State
const isMediaVisible = ref(true); // Show immediately — no IntersectionObserver delay
const isReviewsVisible = ref(true); // Show all content immediately
const mediaObserver = ref(null);
const reviewsObserver = ref(null);
const mediaLoadFailed = ref(false);

// Visitor Count State
const initialVisitorCount = ref(null);

// Double Tap State
const lastPointerTap = ref(0);

// ==========================================
// ✅ COMPUTED PROPERTIES
// ==========================================

const media = computed(() => {
	try {
		const resolved = resolveVenueMedia(props.shop || {}, realMediaData.value);
		const mediaUrl =
			resolved.videoUrl || resolved.primaryImage || FALLBACK_IMAGE;
		return getMediaDetails(mediaUrl);
	} catch (error) {
		console.error("Error processing media:", error);
		return { type: "image", url: FALLBACK_IMAGE };
	}
});

const toFiniteCoord = (value) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
};

const resolvedMediaUrl = computed(() => {
	if (mediaLoadFailed.value) return FALLBACK_IMAGE;
	return media.value?.url || FALLBACK_IMAGE;
});

const safeTopOffset = computed(
	() => "calc(env(safe-area-inset-top) + 0.75rem)",
);

const processedImages = computed(() => {
	try {
		const items = [];
		const resolved = resolveVenueMedia(props.shop || {}, realMediaData.value);
		if (resolved.videoUrl) items.push(resolved.videoUrl);

		const images = Array.isArray(resolved.images) ? resolved.images : [];
		images.forEach((img) => {
			try {
				const url = getMediaDetails(img)?.url;
				if (url && !items.includes(url)) items.push(url);
			} catch {}
		});
		return items;
	} catch (error) {
		console.error("Error processing media items:", error);
		return [];
	}
});

const isVideo = (url) => {
	if (!url || typeof url !== "string") return false;
	return (
		/\.(mp4|webm|ogg|mov|m3u8)/i.test(url) ||
		url.includes("video") ||
		url.includes("stream")
	);
};

const hasGallery = computed(() => processedImages.value.length > 0);

const hasSocialLinks = computed(
	() => props.shop?.IG_URL || props.shop?.FB_URL || props.shop?.TikTok_URL,
);

const shopStatus = computed(() => props.shop?.status || "UNKNOWN");

const isPromoted = computed(
	() => props.shop?.isPromoted || props.shop?.IsPromoted === "TRUE",
);

watch(
	() => props.shop?.id,
	async (newId) => {
		mediaLoadFailed.value = false;
		currentImageIndex.value = 0;
		isGalleryOpen.value = false;
		realMediaData.value = null;

		if (newId) {
			try {
				const data = await getRealVenueMedia(newId);
				if (data && data.length > 0) {
					realMediaData.value = data;
				}
			} catch (error) {
				console.error("Failed to fetch real media:", error);
			}
		}
	},
	{ immediate: true },
);

// ==========================================
// ✅ MOTION SYSTEM (iOS-STYLE)
// ==========================================

const { apply } = useMotion(modalCard, {
	initial: {
		y: "100%",
		opacity: 0,
		scale: 0.95,
	},
	enter: {
		y: 0,
		opacity: 1,
		scale: 1,
		transition: {
			type: "spring",
			stiffness: 260,
			damping: 30,
			mass: 0.8,
		},
	},
	leave: {
		y: "100%",
		opacity: 0,
		scale: 0.95,
		transition: {
			duration: 350,
			ease: [0.25, 0.1, 0.25, 1],
		},
	},
});

// ==========================================
// ✅ TOUCH GESTURE HANDLERS (OPTIMIZED)
// ==========================================

const handleTouchStart = (e) => {
	if (!scrollContentRef.value) return;

	initialScrollTop.value = scrollContentRef.value.scrollTop;
	touchStart.value = { y: e.touches[0].clientY, t: Date.now() };
	isDragging.value = true;
};

const handleTouchMove = (e) => {
	if (!isDragging.value) return;

	const currentY = e.touches[0].clientY;
	const deltaY = currentY - touchStart.value.y;

	// Block dragging if scrolled down or scrolling up
	if (
		initialScrollTop.value > 0 ||
		(scrollContentRef.value && scrollContentRef.value.scrollTop > 0) ||
		deltaY < 0
	) {
		return;
	}

	// Active drag (pulling down from top)
	if (e.cancelable && deltaY > 0) {
		e.preventDefault();

		// Logarithmic resistance for iOS feel
		const limit = 200;
		const resistance = limit * Math.log10(1 + deltaY / (limit * 0.5)) * 2.5;

		dragProgress.value = Math.min(deltaY / 600, 1);

		apply({
			y: resistance,
			scale: 1 - deltaY / 3000,
			opacity: 1,
		});

		const _dt = Date.now() - touchStart.value.t;
		if (_dt > 0) {
			audioSwipe(Math.abs(deltaY) / _dt);
		}
	}
};

const handleTouchEnd = (e) => {
	if (!isDragging.value) return;
	isDragging.value = false;

	const currentY = e.changedTouches[0].clientY;
	const deltaY = currentY - touchStart.value.y;
	const time = Date.now() - touchStart.value.t;
	const velocity = deltaY / time;

	const isScrolledToTop =
		!scrollContentRef.value || scrollContentRef.value.scrollTop <= 0;

	// Dismiss conditions
	if (isScrolledToTop && deltaY > 0) {
		if (
			(deltaY > DISMISS_THRESHOLD.QUICK_FLICK &&
				velocity > DISMISS_THRESHOLD.VELOCITY) ||
			deltaY > DISMISS_THRESHOLD.DISTANCE
		) {
			handleClose();
			return;
		}
	}

	// Snap back
	if (deltaY > 0) {
		apply("enter");
		audioSnap();
	}

	dragProgress.value = 0;
};

// ==========================================
// ✅ MODAL CONTROL & FOCUS TRAP
// ==========================================

const handleClose = () => {
	try {
		impactFeedback("medium");
		audioDismiss();
		apply("leave");
		setTimeout(() => emit("close"), 300);
	} catch (error) {
		console.error("Error closing modal:", error);
		emit("close");
	}
};

const focusableSelector =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const trapFocus = (e) => {
	if (e.key !== "Tab") return;
	if (!modalCard.value) return;

	const focusables = modalCard.value.querySelectorAll(focusableSelector);
	if (!focusables.length) return;

	const first = focusables[0];
	const last = focusables[focusables.length - 1];

	if (e.shiftKey && document.activeElement === first) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && document.activeElement === last) {
		e.preventDefault();
		first.focus();
	}
};

const handleKeydown = (e) => {
	if (e.key === "Escape") handleClose();
	trapFocus(e);
};

const lockBodyScroll = (locked) => {
	document.documentElement.style.overflow = locked ? "hidden" : "";
	document.body.style.overflow = locked ? "hidden" : "";
};

// ==========================================
// ✅ GALLERY CAROUSEL (R-AF + HAPTICS)
// ==========================================

const fireSnapHaptic = (idx) => {
	if (idx === lastHapticIndex.value) return;
	lastHapticIndex.value = idx;
	impactFeedback("light");
};

const openGalleryAt = (index) => {
	if (!processedImages.value.length) return;
	const safeIndex = Math.max(
		0,
		Math.min(Number(index) || 0, processedImages.value.length - 1),
	);
	galleryInitialIndex.value = safeIndex;
	currentImageIndex.value = safeIndex;
	isGalleryOpen.value = true;
	impactFeedback("light");
};

const closeGallery = () => {
	isGalleryOpen.value = false;
};

const jumpToImage = (index) => {
	const safeIndex = Math.max(
		0,
		Math.min(Number(index) || 0, processedImages.value.length - 1),
	);
	currentImageIndex.value = safeIndex;
	scrollToImage(safeIndex);
	impactFeedback("light");
};

const nextImage = () => {
	if (currentImageIndex.value < processedImages.value.length - 1) {
		currentImageIndex.value++;
		scrollToImage(currentImageIndex.value);
		impactFeedback("light");
	}
};

const prevImage = () => {
	if (currentImageIndex.value > 0) {
		currentImageIndex.value--;
		scrollToImage(currentImageIndex.value);
		impactFeedback("light");
	}
};

const scrollToImage = (index) => {
	if (!imageCarouselRef.value) return;

	const container = imageCarouselRef.value;
	const itemWidth = container.clientWidth;

	container.scrollTo({
		left: itemWidth * index,
		behavior: "smooth",
	});
};

const handleCarouselScroll = () => {
	if (!imageCarouselRef.value) return;

	const container = imageCarouselRef.value;
	const newIndex = Math.round(container.scrollLeft / container.clientWidth);

	if (
		newIndex !== currentImageIndex.value &&
		newIndex >= 0 &&
		newIndex < processedImages.value.length
	) {
		currentImageIndex.value = newIndex;
		fireSnapHaptic(newIndex);
	}
};

let rafId = 0;
const handleCarouselScrollRaf = () => {
	if (rafId) return;
	rafId = requestAnimationFrame(() => {
		rafId = 0;
		handleCarouselScroll();
	});
};

// ==========================================
// ✅ POINTER DOUBLE TAP (iOS/Android/Desktop)
// ==========================================

let singleTapTimer = null;

const handlePointerTap = (e) => {
	// only primary pointer (avoid right click / secondary)
	if (e.pointerType === "mouse" && e.button !== 0) return;

	const now = Date.now();
	if (now - lastPointerTap.value < DOUBLE_TAP_DELAY) {
		// Double tap → favorite
		if (singleTapTimer) {
			clearTimeout(singleTapTimer);
			singleTapTimer = null;
		}
		emit("toggle-favorite", props.shop?.id);
		showHeartAnim.value = true;
		successFeedback();

		setTimeout(() => {
			showHeartAnim.value = false;
		}, 900);
		lastPointerTap.value = 0;
	} else {
		// Potential single tap → open gallery after delay
		lastPointerTap.value = now;
		if (singleTapTimer) clearTimeout(singleTapTimer);
		singleTapTimer = setTimeout(() => {
			singleTapTimer = null;
			if (processedImages.value.length > 0) {
				openGalleryAt(0);
			}
		}, DOUBLE_TAP_DELAY);
	}
};

// ==========================================
// ✅ RIDE APP INTEGRATION
// ==========================================

const openRide = async (appName) => {
	if (!appName || !props.shop?.name) return;
	const latNum = Number(props.shop?.lat ?? props.shop?.latitude);
	const lngNum = Number(props.shop?.lng ?? props.shop?.longitude);
	const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);

	rideLoading.value = appName;
	impactFeedback("medium");

	try {
		// Cinematic Route Unveiling: Fly to destination before switching apps
		if (hasCoords && mapPaddingApi?.map) {
			try {
				const mapInstance = mapPaddingApi.map.value || mapPaddingApi.map;
				if (typeof mapInstance.flyTo === "function") {
					mapInstance.flyTo({
						center: [lngNum, latNum],
						zoom: 16,
						duration: 800, // Longer duration for smooth cinematic effect
						essential: true,
					});
				}
			} catch (err) {
				console.warn("Cinematic flyTo failed:", err);
			}
		}

		// Wait 400ms for the animation to be visible before thread blocks / app switches
		await new Promise((resolve) => setTimeout(resolve, 400));

		// Copy shop name to clipboard
		await copyToClipboard(props.shop.name);
		copyStatus.value = hasCoords
			? "📋 Copied!"
			: "📋 Copied! Opening provider website (no coordinates).";

		// Open appropriate app
		let success = false;
		switch (appName) {
			case "grab":
				success = openGrabApp(props.shop);
				break;
			case "bolt":
				success = openBoltApp(props.shop);
				break;
			case "lineman":
				success = openLinemanApp(props.shop);
				break;
			default:
				copyStatus.value = "❌ Unknown app";
				return;
		}

		if (success) {
			copyStatus.value = `🚗 Opening ${appName}…`;
		} else {
			copyStatus.value = "🌐 Opening provider website…";
		}
	} catch (error) {
		console.error("Error opening ride app:", error);
		copyStatus.value = "🌐 Opening provider website…";
	} finally {
		setTimeout(() => {
			showRidePopup.value = false;
			rideLoading.value = "";
			setTimeout(() => {
				copyStatus.value = "";
			}, 1000);
		}, 1500);
	}
};

// ==========================================
// ✅ PROMOTION COUNTDOWN (Overnight Support)
// ==========================================

const buildTargetTime = (hh, mm) => {
	const now = new Date();
	const target = new Date(now);
	target.setHours(hh, mm, 0, 0);

	// If target is in the past, assume it's for the next day (overnight)
	if (target <= now) target.setDate(target.getDate() + 1);
	return target;
};

const updateCountdown = () => {
	if (!props.shop?.promotionEndtime || !props.shop?.promotionInfo) {
		isPromoActive.value = false;
		return;
	}

	try {
		const now = new Date();
		const [hours, minutes] = props.shop.promotionEndtime.split(":");

		const hh = Number.parseInt(hours, 10);
		const mm = Number.parseInt(minutes, 10);

		if (Number.isNaN(hh) || Number.isNaN(mm)) {
			isPromoActive.value = false;
			return;
		}

		const target = buildTargetTime(hh, mm);
		const diff = target - now;

		if (diff <= 0) {
			timeLeft.value = t("promo.expired");
			isPromoActive.value = true;
			return;
		}

		if (diff > MAX_FLASH_WINDOW) {
			isPromoActive.value = false;
			return;
		}

		const totalSeconds = Math.floor(diff / 1000);
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;

		timeLeft.value = `${mins}:${secs.toString().padStart(2, "0")}`;
		isPromoActive.value = true;
	} catch (error) {
		console.error("Error updating countdown:", error);
		isPromoActive.value = false;
	}
};

// ==========================================
// ✅ SHARE SYSTEM
// ==========================================

const handleShare = async () => {
	const lat = toFiniteCoord(props.shop?.lat ?? props.shop?.latitude);
	const lng = toFiniteCoord(props.shop?.lng ?? props.shop?.longitude);
	if (!props.shop?.name || lat === null || lng === null) return;
	const origin =
		Array.isArray(props.userLocation) && props.userLocation.length >= 2
			? {
					lat: toFiniteCoord(props.userLocation[0]),
					lng: toFiniteCoord(props.userLocation[1]),
				}
			: null;

	try {
		impactFeedback("medium");
		const success = await shareLocation(
			{ name: props.shop.name, lat, lng },
			origin,
		);

		if (success) {
			copyStatus.value = "✅ Shared!";
			successFeedback();
		} else {
			copyStatus.value = "📋 Link copied!";
		}
	} catch (error) {
		console.error("Error sharing:", error);
		copyStatus.value = "❌ Share failed";
	} finally {
		setTimeout(() => {
			copyStatus.value = "";
		}, 2000);
	}
};

const openGoogleMaps = () => {
	const lat = toFiniteCoord(props.shop?.lat ?? props.shop?.latitude);
	const lng = toFiniteCoord(props.shop?.lng ?? props.shop?.longitude);
	if (lat === null || lng === null) return;
	const origin =
		Array.isArray(props.userLocation) && props.userLocation.length >= 2
			? props.userLocation
			: null;

	try {
		impactFeedback("medium");
		openGoogleMapsDir(lat, lng, origin);
	} catch (error) {
		console.error("Error opening Google Maps:", error);
	}
};

// ==========================================
// ✅ LAZY LOADING (Unobserve Once)
// ==========================================

const setupIntersectionObservers = () => {
	try {
		// Media Observer
		mediaObserver.value = new IntersectionObserver(
			(entries, obs) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						isMediaVisible.value = true;
						obs.unobserve(entry.target); // ✅ Stop observing
					}
				});
			},
			{ threshold: 0.01, root: scrollContentRef.value ?? null },
		);

		// Reviews Observer
		reviewsObserver.value = new IntersectionObserver(
			(entries, obs) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						isReviewsVisible.value = true;
						obs.unobserve(entry.target); // ✅ Stop observing
					}
				});
			},
			{ threshold: 0.01, root: scrollContentRef.value ?? null },
		);

		nextTick(() => {
			const mediaEl = document.querySelector("#media-container");
			const reviewsEl = document.querySelector("#reviews-container");

			if (mediaEl && mediaObserver.value) {
				mediaObserver.value.observe(mediaEl);
			}
			if (reviewsEl && reviewsObserver.value) {
				reviewsObserver.value.observe(reviewsEl);
			}
		});
	} catch (error) {
		console.error("Error setting up observers:", error);
		// Fallback: show content immediately
		isMediaVisible.value = true;
		isReviewsVisible.value = true;
	}
};

// ==========================================
// ✅ VIDEO SYNC
// ==========================================

watchEffect(() => {
	if (videoPlayer.value && props.shop?.initialTime) {
		try {
			videoPlayer.value.currentTime = props.shop.initialTime;
		} catch (error) {
			console.error("Error setting video time:", error);
		}
	}
});

// ==========================================
// ✅ PARTICLE EFFECTS
// ==========================================

const getParticleStyle = (index) => {
	const hue = (index * 30) % 360;
	return {
		"--particle-delay": `${index * 0.2}s`,
		"--particle-duration": `${3 + Math.random() * 2}s`,
		"--particle-x": `${Math.random() * 100}%`,
		"--particle-color": `hsla(${hue}, 80%, 60%, 0.6)`,
	};
};

// ==========================================
// ✅ LIFECYCLE HOOKS
// ==========================================

onMounted(() => {
	try {
		isMobile.value = isMobileDevice();
		initialVisitorCount.value = Math.floor(Math.random() * 50) + 10;

		updateCountdown();
		timerInterval = setInterval(updateCountdown, 1000);

		setupIntersectionObservers();

		// Content visible immediately — no observer delay needed

		// ✅ Add carousel scroll listener (Passive + Throttled)
		if (imageCarouselRef.value) {
			imageCarouselRef.value.addEventListener(
				"scroll",
				handleCarouselScrollRaf,
				{ passive: true },
			);
		}

		// ✅ Add desktop keyboard support
		document.addEventListener("keydown", handleKeydown);
		lockBodyScroll(true);

		// ✅ Focus close button for accessibility
		nextTick(() => {
			const closeBtn = modalCard.value?.querySelector(
				'button[aria-label="Close details"]',
			);
			closeBtn?.focus?.();
		});
	} catch (error) {
		console.error("Error in onMounted:", error);
	}
});

onUnmounted(() => {
	try {
		if (timerInterval) clearInterval(timerInterval);
		if (singleTapTimer) clearTimeout(singleTapTimer);

		if (mediaObserver.value) mediaObserver.value.disconnect();
		if (reviewsObserver.value) reviewsObserver.value.disconnect();

		// ✅ Remove listener & cancel rAF
		if (imageCarouselRef.value) {
			imageCarouselRef.value.removeEventListener(
				"scroll",
				handleCarouselScrollRaf,
			);
		}
		if (rafId) cancelAnimationFrame(rafId);

		// ✅ Clean up desktop listeners
		document.removeEventListener("keydown", handleKeydown);
		lockBodyScroll(false);
	} catch (error) {
		console.error("Error in onUnmounted:", error);
	}
});
</script>

<template>
  <div
    data-testid="vibe-modal"
    class="fixed inset-0 flex items-end md:items-center justify-center pointer-events-auto font-sans overflow-hidden"
    :style="{ zIndex: Z.MODAL }"
  >
    <!-- iOS-Style Backdrop with Blur -->
    <div role="button" tabindex="0"
      class="absolute inset-0 bg-black/70 backdrop-blur-xl transition-opacity duration-300"
      :style="{ opacity: 1 - dragProgress * 0.5 }"
      @click="handleClose"
    />

    <!-- Main Modal Container -->
    <div
      ref="modalCard"
      @touchstart.stop="handleTouchStart"
      @touchmove.stop="handleTouchMove"
      @touchend.stop="handleTouchEnd"
      class="relative w-full md:max-w-5xl bg-zinc-950 md:rounded-[2rem] rounded-none flex flex-col max-h-[90vh] md:max-h-[90vh] pointer-events-auto overflow-hidden"
      :class="fallbackClass"
      :style="{
        zIndex: Z.MODAL,
        '--safe-area-top': 'env(safe-area-inset-top)',
        '--safe-area-bottom': 'env(safe-area-inset-bottom)',
        '--modal-neon': modalNeonColor,
        '--modal-neon-glow': modalNeonGlow,
        background: glassEnabled ? 'rgba(10,10,18,0.96)' : 'rgba(10,10,18,0.99)',
        border: `1.5px solid ${modalNeonColor}`,
        boxShadow: `0 0 24px ${modalNeonGlow}, 0 -10px 80px rgba(0,0,0,0.7), inset 0 0 40px rgba(0,0,0,0.4)`,
      }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="modalTitleId"
      tabindex="-1"
    >
      <!-- Neon top strip — category color accent bar -->
      <div
        class="neon-modal-topbar"
        :style="{ background: `linear-gradient(90deg, transparent, ${modalNeonColor}, transparent)`, boxShadow: `0 0 12px ${modalNeonGlow}` }"
        aria-hidden="true"
      />

      <!-- Drag Handle + Neon Sign Beacon (anchors modal to venue neon sign on map) -->
      <div
        class="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing gap-0.5"
        :style="{ '--modal-neon': modalNeonColor, '--modal-neon-glow': modalNeonGlow }"
      >
        <!-- Upward-pointing callout arrow — visually connects modal to the neon sign above -->
        <div class="neon-modal-callout" aria-hidden="true" />
        <!-- Thin neon accent line -->
        <div class="neon-modal-beacon-line" aria-hidden="true" />
        <!-- Drag pill -->
        <div
          class="w-10 h-1 rounded-full transition-[width,background-color] duration-200 mt-1"
          :style="{
            width: dragProgress > 0 ? `${10 + dragProgress * 20}px` : '40px',
            backgroundColor: dragProgress > 0.3 ? '#10b981' : 'rgba(255,255,255,0.2)',
          }"
        />
      </div>

      <!-- Close Button -->
      <button
        @click="handleClose"
        :aria-label="$t('auto.k_e9260901')"
        class="absolute right-4 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/10 backdrop-blur-xl transition active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 dark:bg-white/10"
        :style="{ top: safeTopOffset }"
      >
        <X class="w-5 h-5 text-white" />
      </button>

      <!-- Scrollable Content -->
      <div
        ref="scrollContentRef"
        class="flex-1 overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch"
      >
        <!-- Header Section -->
        <div class="px-5 py-4 space-y-3">
          <!-- Title Row -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <h2
                :id="modalTitleId"
                class="text-2xl font-black text-white leading-tight break-words"
              >
                {{ shop.name }}
              </h2>
              <div
                class="mt-2 flex items-center gap-2 text-sm text-zinc-400"
              >
                <MapPin class="w-4 h-4" />
                <span class="font-medium">{{
                  shop.category || "Entertainment"
                }}</span>
              </div>
            </div>

            <!-- Status Badges -->
            <div class="mr-10 flex shrink-0 flex-col gap-1.5">
              <transition name="scale">
                <div
                  v-if="isPromoActive"
                  class="px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-wider text-white bg-gradient-to-r from-red-500 to-orange-500 shadow-lg animate-pulse"
                > {{ $t("auto.k_9c5705f9") }} </div>
              </transition>

              <transition name="scale">
                <div
                  v-if="isPromoted"
                  class="px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-tight bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-lg"
                > {{ $t("auto.k_9696cfdc") }} </div>
              </transition>

              <div
                :class="[
                  'px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-wide text-white shadow-lg flex items-center gap-1.5',
                  getStatusColorClass(shopStatus),
                ]"
              >
                <span
                  v-if="shopStatus === 'LIVE'"
                  class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"
                />
                {{ shopStatus }}
              </div>
            </div>
          </div>

          <!-- Visitor Count -->
          <VisitorCount
            v-if="isMediaVisible"
            :shop-id="shop.id"
            :initial-count="initialVisitorCount"
            :live-count="userCount"
          />

          <!-- Stats Grid -->
          <div class="mt-4 grid grid-cols-4 gap-2">
            <div
              class="flex min-h-[74px] flex-col items-center justify-between rounded-xl border border-white/5 bg-zinc-800/50 p-2 backdrop-blur-sm"
            >
              <span
                class="text-[10px] font-semibold text-zinc-400"
              >
                {{ t("vibe.rating") }}
              </span>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="text-sm font-black text-white">
                  {{ shop.rating ? shop.rating.toFixed(1) : "-" }}
                </span>
                <Sparkles v-if="shop.rating" class="w-3 h-3 text-yellow-500" />
              </div>
            </div>

            <div
              class="flex min-h-[74px] flex-col items-center justify-between rounded-xl border border-white/5 bg-zinc-800/50 p-2 backdrop-blur-sm"
            >
              <span
                class="text-[10px] font-semibold text-zinc-400"
              >
                {{ t("vibe.reviews") }}
              </span>
              <span
                class="text-sm font-black text-white mt-0.5"
              >
                {{ shop.reviewCount || 0 }}
              </span>
            </div>

            <div
              class="flex min-h-[74px] flex-col items-center justify-between rounded-xl border border-white/5 bg-zinc-800/50 p-2 backdrop-blur-sm"
            >
              <span
                class="text-[10px] font-semibold text-zinc-400"
              >
                {{ t("vibe.checkins") }}
              </span>
              <span
                class="text-sm font-black text-white mt-0.5"
              >
                {{ shop.checkins || 0 }}
              </span>
            </div>

            <div
              class="flex min-h-[74px] flex-col items-center justify-between rounded-xl border border-white/5 bg-zinc-800/50 p-2 backdrop-blur-sm"
            >
              <span
                class="text-[10px] font-semibold text-zinc-400"
              >
                {{ t("vibe.photos") }}
              </span>
              <span
                class="text-sm font-black text-white mt-0.5"
              >
                {{ processedImages.length }}
              </span>
            </div>
          </div>
        </div>

        <!-- Media Section (Hero + Particles) -->
        <div
          id="media-container"
          class="group relative w-full overflow-hidden bg-zinc-950 aspect-[16/10]"
          @pointerdown.stop="handlePointerTap"
        >
          <!-- ✅ Cinematic Blooms (Hero Glow) -->
          <div class="absolute inset-0 pointer-events-none z-[5]">
            <div
              class="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/25 opacity-50 blur-3xl"
            />
            <div
              class="absolute -bottom-28 -right-28 h-80 w-80 rounded-full bg-sky-500/20 opacity-45 blur-3xl"
            />
          </div>

          <!-- Cinematic Gradients -->
          <div
            class="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10"
          />
          <div
            class="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10"
          />
          <div
            class="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.5)] pointer-events-none z-10"
          />

          <!-- Floating Particles -->
          <div
            class="absolute inset-0 overflow-hidden pointer-events-none z-10"
          >
            <div
              v-for="i in 12"
              :key="`particle-${i}`"
              class="particle"
              :style="getParticleStyle(i)"
            />
          </div>

          <!-- Loading Skeleton -->
          <div
            v-if="!isMediaVisible"
            class="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 animate-pulse"
          />

          <!-- Heart Animation -->
          <transition name="heart">
            <div
              v-if="showHeartAnim"
              class="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
            >
              <Heart
                class="w-24 h-24 text-pink-500 fill-current drop-shadow-2xl"
                style="animation: heartBeat 0.6s ease-out"
              />
            </div>
          </transition>

          <!-- Double Tap Hint -->
          <div
            class="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-md text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20"
          >
            {{ t("vibe.double_tap") }}
          </div>

          <!-- Promotion Badge -->
          <transition name="slide-up">
            <div
              v-if="isPromoActive"
              class="absolute bottom-3 left-3 z-10 bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl p-3 shadow-2xl border-l-4 border-white/50"
            >
              <div class="flex flex-col">
                <span
                  class="text-[9px] font-bold text-white/80 uppercase tracking-widest"
                >
                  {{ t("vibe.limited_deal") }}
                </span>
                <h3 class="text-sm font-black text-white mt-0.5 leading-tight">
                  {{ shop.promotionInfo }}
                </h3>
                <div
                  class="mt-1.5 flex items-center gap-1 bg-black/30 px-2 py-0.5 rounded-md"
                >
                  <Clock class="w-3 h-3 text-white" />
                  <span class="text-[10px] font-mono font-bold text-white">
                    {{ timeLeft }}
                  </span>
                </div>
              </div>
            </div>
          </transition>

          <!-- Media Content -->
          <template v-if="isMediaVisible">
            <video
              v-if="media.type === 'video' && !mediaLoadFailed"
              ref="videoPlayer"
              :src="resolvedMediaUrl"
              autoplay
              loop
              muted
              playsinline
              class="w-full h-full object-cover"
              @error="mediaLoadFailed = true"
            />
            <iframe
              v-else-if="media.type === 'youtube' && !mediaLoadFailed"
              :src="resolvedMediaUrl"
              class="w-full h-full"
              :title="$t('auto.k_ee15f9ef')"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen
              loading="lazy"
            />
            <img
              v-else
              :src="resolvedMediaUrl"
              :alt="shop.name || 'Venue photo'"
              class="w-full h-full object-cover"
              loading="lazy"
              @error="mediaLoadFailed = true"
            />
          </template>
        </div>

        <!-- Image Gallery Carousel -->
        <div v-if="hasGallery" class="relative px-5 py-4">
          <h4
            class="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-3"
          >
            {{ t("vibe.gallery") }} ({{ processedImages.length }})
          </h4>

          <div class="relative">
            <!-- Carousel Container -->
            <div
              ref="imageCarouselRef"
              class="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth"
            >
              <button
                v-for="(img, idx) in processedImages"
                :key="`gallery-${idx}`"
                type="button"
                :aria-label="`Open gallery image ${idx + 1}`"
                class="h-32 w-32 flex-shrink-0 cursor-pointer snap-start overflow-hidden rounded-2xl bg-zinc-800 transition-transform active:scale-95"
                @click="openGalleryAt(idx)"
              >
                <video
                  v-if="isVideo(img)"
                  :src="img"
                  class="w-full h-full object-cover"
                  muted
                  playsinline
                  preload="metadata"
                />
                <img
                  v-else
                  :src="img"
                  :alt="`${shop.name} gallery image ${idx + 1}`"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            </div>

            <!-- ✅ Dots Indicator -->
            <div class="mt-3 flex items-center justify-center gap-1.5">
              <button
                v-for="(_, i) in processedImages"
                :key="`dot-${i}`"
                class="h-1.5 rounded-full transition-[width,background-color] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                :class="
                  i === currentImageIndex
                    ? 'w-5 bg-black/80 dark:bg-white/90 shadow'
                    : 'w-1.5 bg-gray-300 dark:bg-white/20'
                "
                :aria-label="`Go to image ${i + 1}`"
                @click="jumpToImage(i)"
              />
            </div>

            <!-- Navigation Buttons -->
            <button
              v-if="currentImageIndex > 0"
              @click="prevImage"
              :aria-label="$t('auto.k_41e27be5')"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 dark:bg-black/50 backdrop-blur-md shadow-lg active:scale-90 transition z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            >
              <ChevronLeft class="w-5 h-5 text-white" />
            </button>

            <button
              v-if="currentImageIndex < processedImages.length - 1"
              @click="nextImage"
              :aria-label="$t('auto.k_929cea25')"
              class="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 dark:bg-black/50 backdrop-blur-md shadow-lg active:scale-90 transition z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            >
              <ChevronRight class="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <!-- Info Cards -->
        <div class="px-5 py-4 space-y-3">
          <!-- Crowd Info -->
          <div
            class="bg-zinc-800/50 rounded-2xl p-4 backdrop-blur-sm"
          >
            <div class="flex items-start gap-3">
              <div
                class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0"
              >
                <Users class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div class="flex-1 min-w-0">
                <h5
                  class="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1"
                >
                  {{ t("vibe.crowd_vibe") }}
                </h5>
                <p
                  class="text-sm font-medium text-white leading-relaxed line-clamp-3"
                >
                  {{
                    shop.description ||
                    shop.crowdInfo ||
                    t("vibe.crowd_default")
                  }}
                </p>
              </div>
            </div>
          </div>

          <!-- Vibe Tag -->
          <div
            class="bg-zinc-800/50 rounded-2xl p-4 backdrop-blur-sm"
          >
            <div class="flex items-start gap-3">
              <div
                class="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center shrink-0"
              >
                <Sparkles
                  class="w-5 h-5 text-cyan-600 dark:text-cyan-400"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h5
                  class="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1"
                >
                  {{ t("vibe.atmosphere") }}
                </h5>
                <p
                  class="text-sm font-medium text-white leading-relaxed"
                >
                  {{
                    shop.category ||
                    shop.vibeTag ||
                    t("vibe.atmosphere_default")
                  }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Social Links -->
        <div v-if="hasSocialLinks" class="px-5 py-4">
          <h4
            class="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-3"
          >
            {{ t("vibe.explore_atmosphere") }}
          </h4>
          <div class="grid grid-cols-3 gap-2">
            <a
              v-if="shop.IG_URL"
              :href="shop.IG_URL"
              target="_blank"
              rel="noopener noreferrer"
              @click="impactFeedback('medium')"
              class="h-12 rounded-2xl bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
            >
              <Instagram class="w-5 h-5 text-white" />
              <span class="text-xs font-bold text-white">IG</span>
            </a>

            <a
              v-if="shop.FB_URL"
              :href="shop.FB_URL"
              target="_blank"
              rel="noopener noreferrer"
              @click="impactFeedback('medium')"
              class="h-12 rounded-2xl bg-[#1877F2] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            >
              <Facebook class="w-5 h-5 text-white" />
              <span class="text-xs font-bold text-white">FB</span>
            </a>

            <a
              v-if="shop.TikTok_URL"
              :href="shop.TikTok_URL"
              target="_blank"
              rel="noopener noreferrer"
              @click="impactFeedback('medium')"
              class="h-12 rounded-2xl bg-black flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
              </svg>
              <span class="text-xs font-bold text-white">TT</span>
            </a>
          </div>
        </div>

        <!-- Reviews Section -->
        <div id="reviews-container" class="px-5 py-4">
          <ReviewSystem
            v-if="isReviewsVisible"
            :shop-id="shop.id"
            :shop-name="shop.name"
          />
        </div>

        <!-- Bottom Safe Area -->
        <div class="h-[calc(var(--safe-area-bottom)+20px)]" />
      </div>

      <!-- iOS-Style Action Bar (Sticky Bottom) -->
      <div
        class="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-xl"
      >
        <div class="px-5 py-3 grid grid-cols-2 gap-2">
          <!-- Share -->
          <button
            @click="handleShare"
            class="h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            <Share2 class="w-5 h-5 text-white" />
            <span
              class="text-[10px] sm:text-[11px] font-bold text-white uppercase tracking-wide leading-tight px-1 text-center"
            >
              {{ t("vibe.share") }}
            </span>
          </button>

          <!-- Navigate -->
          <button
            @click="openGoogleMaps"
            class="h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-600 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          >
            <Navigation class="w-5 h-5 text-white" />
            <span
              class="text-[10px] sm:text-[11px] font-bold text-white uppercase tracking-wide leading-tight px-1 text-center"
            >
              {{ t("vibe.navigate") }}
            </span>
          </button>
        </div>

        <!-- Safe Area Bottom Padding -->
        <div class="h-[var(--safe-area-bottom)]" />
      </div>
    </div>

    <!-- Ride Selection Bottom Sheet -->
    <transition name="sheet">
      <div role="button" tabindex="0"
        v-if="showRidePopup"
        class="fixed inset-0 flex items-end justify-center bg-black/70 backdrop-blur-xl"
        :style="{ zIndex: Z.SUBMODAL }"
        @click.self="showRidePopup = false"
      >
        <div
          class="w-full max-w-md bg-zinc-950 rounded-t-[2rem] shadow-2xl"
        >
          <!-- Drag Handle -->
          <div class="flex justify-center pt-3 pb-1">
            <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>

          <div class="px-5 py-4">
            <!-- Header -->
            <div class="text-center mb-6">
              <div
                class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-xl"
              >
                <Car class="w-8 h-8 text-white" />
              </div>
              <h3 class="text-xl font-black text-white">
                {{ t("vibe.book_ride") }}
              </h3>
              <p class="text-sm text-zinc-400 mt-1">
                {{ shop.name }}
              </p>
            </div>

            <!-- Ride Options -->
            <div class="space-y-3 mb-6">
              <!-- Grab -->
              <button
                @click="openRide('grab')"
                :disabled="rideLoading === 'grab'"
                :aria-label="t('vibe.open_grab')"
                class="w-full h-16 bg-gradient-to-r from-[#00B14F] to-[#00A84D] rounded-2xl flex items-center px-4 gap-3 active:scale-98 transition-transform shadow-lg disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300/80"
              >
                <div
                  class="w-10 h-10 bg-white rounded-full flex items-center justify-center"
                >
                  <span class="text-lg font-black text-[#00B14F]">G</span>
                </div>
                <span class="flex-1 text-left font-bold text-white text-lg">
                  {{
                    rideLoading === "grab" ? t("vibe.opening") : t("vibe.grab")
                  }}
                </span>
                <ChevronRight class="w-5 h-5 text-white/70" />
              </button>

              <!-- Bolt -->
              <button
                @click="openRide('bolt')"
                :disabled="rideLoading === 'bolt'"
                :aria-label="t('vibe.open_bolt')"
                class="w-full h-16 bg-gradient-to-r from-[#34D186] to-[#2EC477] rounded-2xl flex items-center px-4 gap-3 active:scale-98 transition-transform shadow-lg disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300/80"
              >
                <div
                  class="w-10 h-10 bg-white rounded-full flex items-center justify-center"
                >
                  <span class="text-lg font-black text-[#34D186]">B</span>
                </div>
                <span class="flex-1 text-left font-bold text-white text-lg">
                  {{
                    rideLoading === "bolt" ? t("vibe.opening") : t("vibe.bolt")
                  }}
                </span>
                <ChevronRight class="w-5 h-5 text-white/70" />
              </button>

              <!-- Lineman -->
              <button
                @click="openRide('lineman')"
                :disabled="rideLoading === 'lineman'"
                :aria-label="t('vibe.open_lineman')"
                class="w-full h-16 bg-gradient-to-r from-[#00B14F] to-[#009440] rounded-2xl flex items-center px-4 gap-3 active:scale-98 transition-transform shadow-lg disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300/80"
              >
                <div
                  class="w-10 h-10 bg-white rounded-full flex items-center justify-center"
                >
                  <span class="text-lg font-black text-[#00B14F]">L</span>
                </div>
                <span class="flex-1 text-left font-bold text-white text-lg">
                  {{
                    rideLoading === "lineman"
                      ? t("vibe.opening")
                      : t("vibe.lineman")
                  }}
                </span>
                <ChevronRight class="w-5 h-5 text-white/70" />
              </button>
            </div>

            <!-- Status Message -->
            <transition name="fade">
              <div
                v-if="copyStatus"
                role="status"
                aria-live="polite"
                class="text-center py-2 px-4 bg-green-100 dark:bg-green-900/30 rounded-xl"
              >
                <p class="text-sm font-bold text-green-600 dark:text-green-400">
                  {{ copyStatus }}
                </p>
              </div>
            </transition>

            <!-- Helper Text -->
            <p
              v-if="isMobile"
              class="text-center text-xs text-zinc-500 mt-4"
            >
              {{ t("vibe.app_manual") }}
            </p>
          </div>

          <!-- Safe Area Bottom -->
          <div class="h-[calc(var(--safe-area-bottom)+16px)]" />
        </div>
      </div>
    </transition>

    <PhotoGallery
      :images="processedImages"
      :initial-index="galleryInitialIndex"
      :is-open="isGalleryOpen"
      @close="closeGallery"
    />

    <div class="sr-only" role="status" aria-live="polite">
      {{ copyStatus || (rideLoading ? `Opening ${rideLoading}…` : "") }}
    </div>
  </div>
</template>

<style scoped>
/* ====================================================
   Neon Sign Beacon — anchors modal to venue neon sign
   ==================================================== */

/* Upward callout arrow — points modal toward the neon sign on the map */
/* Neon top accent bar */
.neon-modal-topbar {
  height: 2px;
  width: 100%;
  flex-shrink: 0;
  opacity: 0.9;
}

.neon-modal-callout {
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-bottom: 11px solid var(--modal-neon, #06b6d4);
  filter: drop-shadow(0 0 6px var(--modal-neon-glow, rgba(6,182,212,0.6)));
  animation: neon-callout-pulse 2.4s ease-in-out infinite;
}

/* Thin glowing line below the callout arrow */
.neon-modal-beacon-line {
  width: 48px;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--modal-neon, #06b6d4),
    transparent
  );
  box-shadow: 0 0 8px var(--modal-neon-glow, rgba(6,182,212,0.4));
  animation: neon-beacon-shimmer 2.4s ease-in-out infinite;
}

@keyframes neon-callout-pulse {
  0%, 100% { opacity: 0.6; filter: drop-shadow(0 0 4px var(--modal-neon-glow, rgba(6,182,212,0.4))); }
  50% { opacity: 1; filter: drop-shadow(0 0 10px var(--modal-neon-glow, rgba(6,182,212,0.8))); }
}

@keyframes neon-beacon-shimmer {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .neon-modal-callout { animation: none; opacity: 0.85; }
  .neon-modal-beacon-line { animation: none; opacity: 0.7; }
}

/* iOS-Style Smooth Scrolling */
.overflow-y-auto {
  -webkit-overflow-scrolling: touch;
}

/* Hide Scrollbar */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scale-enter-active,
.scale-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.25, 0.1, 0.25, 1),
    transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.heart-enter-active {
  animation: heartBeat 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.heart-leave-active {
  transition: opacity 0.3s ease;
}

.heart-leave-to {
  opacity: 0;
}

@keyframes heartBeat {
  0% {
    opacity: 0;
    transform: scale(0);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}

/* Active Scale */
.active\:scale-90:active {
  transform: scale(0.9);
}

.active\:scale-95:active {
  transform: scale(0.95);
}

.active\:scale-98:active {
  transform: scale(0.98);
}

/* Particle Animation */
.particle {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--particle-color, rgba(255, 255, 255, 0.5));
  left: var(--particle-x, 50%);
  bottom: -10px;
  animation:
    float-up var(--particle-duration, 4s) ease-out infinite,
    twinkle 2s ease-in-out infinite alternate;
  animation-delay: var(--particle-delay, 0s);
  will-change: transform, opacity;
}

@keyframes float-up {
  0% {
    transform: translateY(0) scale(1);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 0.5;
  }
  100% {
    transform: translateY(-45vh) scale(0.5);
    opacity: 0;
  }
}

@keyframes twinkle {
  0% {
    filter: brightness(1);
  }
  100% {
    filter: brightness(1.5);
  }
}

/* Performance Optimizations */
.transition-opacity,
.transition-transform {
  will-change: transform, opacity;
}

/* Safe Area Support */
@supports (padding: max(0px)) {
  .h-\[var\(--safe-area-bottom\)\] {
    height: max(var(--safe-area-bottom), 0px);
  }
}

/* ✅ Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  .particle {
    animation: none !important;
  }
  * {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
</style>
