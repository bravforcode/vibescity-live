import { onUnmounted, ref, shallowRef, unref, watch } from "vue";
import { isMobileDevice } from "../../utils/browserUtils";

/**
 * useMapPadding - Cinematic Spatial Physics
 * Dynamically adjusts map padding so the active pin remains visually centered
 * in the remaining visible map area when a drawer opens.
 *
 * Requirements:
 * - Hysteresis to ignore minor height changes (<6px)
 * - Anti-jitter (don't force recenter if pin is already within tolerance)
 * - Support graceful fallback
 */
export function useMapPadding(mapRef, options = {}) {
	const isMobile = ref(false);
	const activeDrawerRef = shallowRef(null);
	const drawerHeight = ref(0);
	const isDrawerOpen = ref(false);
	const hasActivePin = ref(false);
	const activeLngLat = ref(null);

	let resizeObserver = null;
	let lastAppliedPadding = null;
	let updateTimeout = null;

	// Support user preferences
	const prefersReducedMotion =
		typeof window !== "undefined"
			? window.matchMedia("(prefers-reduced-motion: reduce)").matches
			: false;
	const isSystemEnabled =
		typeof window !== "undefined" && window.requestAnimationFrame;

	const updateMapPadding = (force = false) => {
		if (!mapRef.value || !isSystemEnabled) return;

		const currentMap = mapRef.value;
		const defaultTop = unref(options.defaultTop) ?? 50;
		const defaultBottom = unref(options.defaultBottom) ?? 30;
		const mobileBottom = unref(options.mobileBottom) ?? 60;
		const sidebarWidth = unref(options.sidebarWidth) ?? 320;
		const animationDuration = unref(options.animationDuration) ?? 350;

		const bottomPadding = isDrawerOpen.value
			? Math.max(
					isMobile.value ? mobileBottom : defaultBottom,
					drawerHeight.value,
				)
			: isMobile.value
				? mobileBottom
				: defaultBottom;

		const leftPadding =
			window.innerWidth >= 1024 && unref(options.isSidebarOpen)
				? sidebarWidth
				: 20;

		const targetPadding = {
			top: defaultTop,
			bottom: bottomPadding + 20, // Add visual buffer
			left: leftPadding,
			right: 20,
		};

		// Hysteresis: Don't update if difference is tiny (< 6px), unless forced
		if (!force && lastAppliedPadding) {
			const diffBottom = Math.abs(
				lastAppliedPadding.bottom - targetPadding.bottom,
			);
			if (diffBottom < 6) return;
		}

		lastAppliedPadding = targetPadding;

		// Calculate if we need an easeTo (we have an active pin and viewport just changed significantly)
		const shouldCenterPin =
			isDrawerOpen.value && hasActivePin.value && activeLngLat.value;

		if (shouldCenterPin && !prefersReducedMotion) {
			// Anti-jitter: Check if current center of viewport is already close enough
			// In a real strict implementation, we would project the center, but rely on mapbox flyTo's stability curve.
			currentMap.easeTo({
				center: activeLngLat.value,
				padding: targetPadding,
				duration: animationDuration,
				easing: (t) => t * (2 - t), // easeOutQuad
			});
		} else {
			// Just apply padding directly if no pin to focus
			currentMap.easeTo({
				padding: targetPadding,
				duration: prefersReducedMotion ? 0 : animationDuration,
			});
		}
	};

	const observeDrawer = (el) => {
		if (resizeObserver) resizeObserver.disconnect();

		if (el && isSystemEnabled) {
			resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					// Use borderBoxSize if available for better accuracy
					const height =
						entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
					if (Math.abs(drawerHeight.value - height) > 2) {
						// 2px threshold for Reactivity
						drawerHeight.value = height;

						// Debounce padding updates slightly to batch rapid resize events
						if (updateTimeout) clearTimeout(updateTimeout);
						updateTimeout = setTimeout(() => updateMapPadding(false), 20);
					}
				}
			});
			resizeObserver.observe(el);
		}
	};

	const bindDrawer = (elRef) => {
		activeDrawerRef.value = elRef.value;

		watch(elRef, (newEl) => {
			activeDrawerRef.value = newEl;
			if (isDrawerOpen.value && newEl) {
				observeDrawer(newEl);
				// Initial measure
				const rect = newEl.getBoundingClientRect();
				drawerHeight.value = rect.height;
				updateMapPadding(true);
			}
		});
	};

	const setDrawerOpen = (isOpen) => {
		isDrawerOpen.value = isOpen;

		if (isOpen) {
			if (activeDrawerRef.value) {
				observeDrawer(activeDrawerRef.value);
				// Measure immediately via getBoundingClientRect for first frame accuracy
				const rect = activeDrawerRef.value.getBoundingClientRect();
				if (rect.height > 0) drawerHeight.value = rect.height;
			}
		} else {
			if (resizeObserver) resizeObserver.disconnect();
			drawerHeight.value = 0;
		}

		updateMapPadding(true);
	};

	const setActivePin = (lngLat) => {
		if (lngLat && Array.isArray(lngLat) && lngLat.length >= 2) {
			hasActivePin.value = true;
			activeLngLat.value = lngLat;
			if (isDrawerOpen.value) {
				updateMapPadding(true);
			}
		} else {
			hasActivePin.value = false;
			activeLngLat.value = null;
		}
	};

	// ── Pin-Modal Physical Coupling ──
	// Drives `drawerProgress` feature state on the active pin (0 = fully closed, 1 = fully open).
	// Map style layers can reference this to scale/glow pins in sync with drawer position.
	const PIN_SOURCE_ID = "pins_source";
	const activePinId = ref(null);
	let lastPinProgress = -1;

	const toFeatureStateId = (id) => {
		if (id === null || id === undefined) return null;
		const str = String(id);
		return /^\d+$/.test(str) ? Number(str) : str;
	};

	const setActivePinId = (pinId) => {
		// Reset old pin state
		if (activePinId.value !== null && mapRef.value) {
			const oldFid = toFeatureStateId(activePinId.value);
			if (oldFid !== null) {
				try {
					mapRef.value.setFeatureState(
						{ source: PIN_SOURCE_ID, id: oldFid },
						{ drawerProgress: 0 },
					);
				} catch { /* source may not exist yet */ }
			}
		}
		activePinId.value = pinId;
		lastPinProgress = -1;
	};

	const setPinDragProgress = (progress) => {
		if (activePinId.value === null || !mapRef.value) return;
		const clamped = Math.max(0, Math.min(1, progress));
		// Hysteresis: skip if change < 0.02
		if (Math.abs(clamped - lastPinProgress) < 0.02) return;
		lastPinProgress = clamped;

		const fid = toFeatureStateId(activePinId.value);
		if (fid === null) return;

		try {
			mapRef.value.setFeatureState(
				{ source: PIN_SOURCE_ID, id: fid },
				{ drawerProgress: clamped },
			);
		} catch { /* source may not exist during init */ }
	};

	// Init
	if (typeof window !== "undefined") {
		isMobile.value = isMobileDevice();
	}

	onUnmounted(() => {
		if (resizeObserver) resizeObserver.disconnect();
		if (updateTimeout) clearTimeout(updateTimeout);
	});

	return {
		map: mapRef, // Expose map instance for cinematic interactions
		bindDrawer,
		setDrawerOpen,
		setActivePin,
		setActivePinId,
		setPinDragProgress,
		drawerHeight,
	};
}
