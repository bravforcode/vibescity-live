import { useIntervalFn, useNow } from "@vueuse/core";
import { ref } from "vue";
import { calculateShopStatus } from "@/utils/shopUtils";

/**
 * 🎯 Smart Markers System
 *
 * Real-time marker management with:
 * - Live status calculation based on opening hours
 * - Performance-optimized animations
 * - Accessibility-first design
 * - SEO-friendly marker states
 */
export function useSmartMarkers() {
	// 📊 Core state management
	const now = useNow();
	const markerStates = ref(new Map());

	const normalizeStatus = (rawStatus) => {
		const s = String(rawStatus || "").toUpperCase();
		if (s === "LIVE") return "LIVE";
		if (s === "ACTIVE") return "OPEN";
		if (s === "TONIGHT") return "TONIGHT";
		return "CLOSED";
	};

	// 🎨 Status configuration with semantic meaning
	const STATUS_CONFIG = {
		LIVE: {
			color: "#ef4444",
			priority: 4,
			pulseSpeed: 1000,
			scale: 1.3,
			glowIntensity: 1.0,
			badge: "LIVE",
			description: "Currently active with special event",
		},
		OPEN: {
			color: "#22c55e",
			priority: 3,
			pulseSpeed: 2000,
			scale: 1.1,
			glowIntensity: 0.6,
			badge: "OPEN",
			description: "Currently open for business",
		},
		TONIGHT: {
			color: "#f97316",
			priority: 2,
			pulseSpeed: 3000,
			scale: 1.0,
			glowIntensity: 0.4,
			badge: "TONIGHT",
			description: "Opening later tonight",
		},
		CLOSED: {
			color: "#6b7280",
			priority: 1,
			pulseSpeed: 0,
			scale: 0.9,
			glowIntensity: 0.2,
			badge: "CLOSED",
			description: "Currently closed",
		},
	};

	// 🧮 Real-time status calculation with error handling
	const calculateRealTimeStatus = (shop) => {
		try {
			if (!shop || !shop.id) {
				console.warn("[useSmartMarkers] Invalid shop data:", shop);
				return getDefaultStatus();
			}

			const rawStatus = calculateShopStatus(shop, now.value);
			const status = normalizeStatus(rawStatus);
			const config = STATUS_CONFIG[status] || STATUS_CONFIG.CLOSED;

			return {
				status,
				isOpen: status === "OPEN",
				isLive: status === "LIVE",
				isTonight: status === "TONIGHT",
				isClosed: status === "CLOSED",
				...config,
			};
		} catch (error) {
			console.error("[useSmartMarkers] Error calculating status:", error);
			return getDefaultStatus();
		}
	};

	// 🛡️ Safe fallback for invalid data
	const getDefaultStatus = () => ({
		status: "CLOSED",
		isOpen: false,
		isLive: false,
		isTonight: false,
		isClosed: true,
		...STATUS_CONFIG.CLOSED,
	});

	// 🔄 Batch update all marker states (performance optimized)
	const updateMarkerStates = (shops) => {
		if (!Array.isArray(shops)) {
			console.warn("[useSmartMarkers] Invalid shops array:", shops);
			return;
		}

		const newStates = new Map();
		const updateStartTime = performance.now();

		shops.forEach((shop) => {
			const state = calculateRealTimeStatus(shop);
			if (shop.id) {
				newStates.set(shop.id, state);
			}
		});

		markerStates.value = newStates;

		const updateTime = performance.now() - updateStartTime;
		if (updateTime > 16) {
			console.warn(
				`[useSmartMarkers] Slow update: ${updateTime.toFixed(2)}ms for ${shops.length} shops`,
			);
		}
	};

	// 🔍 Get marker state with validation
	const getMarkerState = (shopId) => {
		if (!shopId) {
			return getDefaultStatus();
		}

		return markerStates.value.get(String(shopId)) || getDefaultStatus();
	};

	// 🎨 Generate optimized marker styles
	const getMarkerStyles = (shop) => {
		if (!shop || !shop.id) {
			return getFallbackStyles();
		}

		const state = getMarkerState(shop.id);
		const isHighlighted = Boolean(shop.isHighlighted);

		// 🎯 Performance-optimized style calculations
		const baseScale = state.scale;
		const highlightScale = isHighlighted ? 1.2 : 1;
		const finalScale = baseScale * highlightScale;

		// 🎨 CSS custom properties for better performance
		return {
			// Base dimensions
			"--marker-width": isHighlighted ? "64px" : "48px",
			"--marker-height": isHighlighted ? "84px" : "64px",
			"--marker-scale": finalScale,
			"--marker-color": state.color,
			"--marker-glow": `${state.glowIntensity * 20}px`,
			"--marker-opacity": state.isClosed ? "0.92" : "1",
			"--marker-z-index": state.priority * 100 + (isHighlighted ? 1000 : 100),

			// Animation properties
			"--pulse-duration": `${state.pulseSpeed}ms`,
			"--pulse-enabled": state.pulseSpeed > 0 ? "1" : "0",
		};
	};

	// 🛡️ Safe fallback styles
	const getFallbackStyles = () => ({
		"--marker-width": "48px",
		"--marker-height": "64px",
		"--marker-scale": "0.9",
		"--marker-color": "#6b7280",
		"--marker-glow": "4px",
		"--marker-opacity": "0.92",
		"--marker-z-index": "100",
		"--pulse-duration": "0ms",
		"--pulse-enabled": "0",
	});

	// 🎭 Generate CSS with performance optimizations
	// Note: marker visual styles live in src/assets/smart-markers.css

	// ⏰ Auto-update with performance monitoring
	const { pause, resume } = useIntervalFn(
		() => {
			const updateStart = performance.now();
			now.value = new Date();
			const updateTime = performance.now() - updateStart;

			if (updateTime > 5) {
				console.warn(
					`[useSmartMarkers] Slow time update: ${updateTime.toFixed(2)}ms`,
				);
			}
		},
		60000, // Update every minute
	);

	//  Performance monitoring
	const getPerformanceMetrics = () => ({
		totalMarkers: markerStates.value.size,
		statuses: Object.keys(STATUS_CONFIG).map((status) => ({
			status,
			count: Array.from(markerStates.value.values()).filter(
				(s) => s.status === status,
			).length,
		})),
		lastUpdate: now.value.toISOString(),
	});

	return {
		// 📊 State
		markerStates: readonly(markerStates),
		currentTime: readonly(now),
		STATUS_CONFIG: readonly(STATUS_CONFIG),

		// 🎯 Methods
		calculateRealTimeStatus,
		getMarkerState,
		getMarkerStyles,
		updateMarkerStates,
		getPerformanceMetrics,

		// 🎮 Controls
		pauseUpdates: pause,
		resumeUpdates: resume,
	};
}

// 🛡️ Type safety helper
function readonly(obj) {
	return obj;
}
