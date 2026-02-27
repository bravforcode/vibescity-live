import mapboxgl from "mapbox-gl";
import { shallowRef } from "vue";
import { createGiantPinElement } from "@/utils/mapRenderer";

const COIN_CSS_INJECTED = { done: false };

const injectCoinFlipCSS = () => {
	if (COIN_CSS_INJECTED.done || typeof document === "undefined") return;
	COIN_CSS_INJECTED.done = true;
	const style = document.createElement("style");
	style.textContent = `
		.vibe-coin-flip {
			width: 20px; height: 20px;
			perspective: 200px;
			display: flex; align-items: center; justify-content: center;
		}
		.vibe-coin-flip-inner {
			width: 20px; height: 20px;
			position: relative;
			transform-style: preserve-3d;
			animation: coinFlip3d 2.4s ease-in-out infinite;
		}
		.vibe-coin-front, .vibe-coin-back {
			position: absolute;
			width: 100%; height: 100%;
			backface-visibility: hidden;
			-webkit-backface-visibility: hidden;
			display: flex; align-items: center; justify-content: center;
			font-size: 14px; line-height: 20px;
			filter: drop-shadow(0 1px 3px rgba(255,215,0,0.7));
		}
		.vibe-coin-back {
			transform: rotateY(180deg);
			filter: drop-shadow(0 1px 3px rgba(255,165,0,0.9)) brightness(0.8);
		}
		@keyframes coinFlip3d {
			0%   { transform: rotateY(0deg); }
			40%  { transform: rotateY(180deg); }
			50%  { transform: rotateY(180deg); }
			90%  { transform: rotateY(360deg); }
			100% { transform: rotateY(360deg); }
		}
		@media (prefers-reduced-motion: reduce) {
			.vibe-coin-flip-inner { animation: none !important; }
		}
	`;
	document.head.appendChild(style);
};

const createCoinFlipHTML = () =>
	`<div class="vibe-coin-flip"><div class="vibe-coin-flip-inner"><div class="vibe-coin-front">🪙</div><div class="vibe-coin-back">🪙</div></div></div>`;

const createRegularPinElement = (shop) => {
	const pinType = String(shop?.pin_type || "").toLowerCase();
	const isBoost =
		pinType === "boost" ||
		shop?.is_boost_active === true ||
		shop?.boostActive === true;
	const el = document.createElement("button");
	el.type = "button";
	el.className = "vibe-e2e-pin-marker";
	el.style.width = "18px";
	el.style.height = "18px";
	el.style.borderRadius = "999px";
	el.style.border = "2px solid rgba(255,255,255,0.92)";
	el.style.boxShadow = "0 3px 10px rgba(0,0,0,0.35)";
	el.style.background = isBoost ? "#ef4444" : "#3b82f6";
	el.style.cursor = "pointer";
	el.style.padding = "0";
	el.style.display = "block";
	el.style.transform = "translateY(-2px)";
	el.setAttribute("aria-label", String(shop?.name || "venue"));
	return el;
};

export function useMapMarkers(map) {
	// Fix 3D: inject CSS once at composable init, not inside marker loop
	injectCoinFlipCSS();

	const markersMap = shallowRef(new Map());
	const coinMarkersMap = shallowRef(new Map());
	const eventMarkersMap = shallowRef(new Map());
	const vibeMarkersMap = shallowRef(new Map());
	const normalizeId = (value) => {
		if (value === null || value === undefined) return "";
		return String(value).trim();
	};
	const getShopCoords = (shop) => {
		const lat = Number(shop?.lat ?? shop?.latitude);
		const lng = Number(shop?.lng ?? shop?.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
		if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
		return [lng, lat];
	};

	// ✅ Update Markers — Only creates DOM markers for giant pins.
	// Non-giant pins are rendered by GeoJSON Symbol Layers (useMapLayers.addClusters)
	// which handles clustering, coin animations, and boost styling natively.
	const updateMarkers = (shops, highlightedShopId, options = {}) => {
		if (!map.value) return;

		const {
			pinsVisible = true,
			onSelect,
			onOpenBuilding,
			allowedIds = null,
			enableDomCoinMarkers = false,
			renderRegularDomMarkers = false,
		} = options;
		const isAllowedId = (idStr) =>
			allowedIds === null ? true : allowedIds.has(String(idStr));
		// injectCoinFlipCSS already called at composable init (Fix 3D)

		const eligibleShops = shops.filter((shop) => {
			const idStr = String(shop?.id ?? "").trim();
			if (!idStr || !isAllowedId(idStr)) return false;
			return true;
		});
		// Filter to giant pins only — regular pins handled by GeoJSON symbol layer
		const giantShops = eligibleShops.filter((shop) => {
			const pinType = String(shop.pin_type || "").toLowerCase();
			return (
				pinType === "giant" ||
				shop.is_giant_active === true ||
				shop.isGiantPin === true ||
				shop.giantActive === true
			);
		});
		const markerShops = renderRegularDomMarkers ? eligibleShops : giantShops;

		const newShopIds = new Set(
			markerShops.map((s) => normalizeId(s?.id)).filter(Boolean),
		);

		// 1. Remove markers that are no longer in the new list
		markersMap.value.forEach((value, key) => {
			if (!newShopIds.has(key)) {
				value.marker.remove();
				markersMap.value.delete(key);
			}
		});

		// 2. Add or Update marker DOM overlays.
		markerShops.forEach((shop) => {
			const idStr = normalizeId(shop?.id);
			if (!idStr) return;
			const pinType = String(shop.pin_type || "").toLowerCase();
			const isGiant =
				pinType === "giant" ||
				shop.is_giant_active === true ||
				shop.isGiantPin === true ||
				shop.giantActive === true;
			const isSelected =
				normalizeId(shop.id) === normalizeId(highlightedShopId);
			const coords = getShopCoords(shop);

			// Check if marker already exists
			if (markersMap.value.has(idStr)) {
				const { marker: existingMarker } = markersMap.value.get(idStr);
				const el = existingMarker.getElement();
				if (!coords) {
					existingMarker.remove();
					markersMap.value.delete(idStr);
					return;
				}
				existingMarker.setLngLat(coords);

				// Update Highlight State
				if (isSelected) {
					el.dataset.highlighted = "true";
					el.style.zIndex = "300";
				} else {
					delete el.dataset.highlighted;
					el.style.zIndex = "1000";
				}
				el.style.opacity = pinsVisible ? "1" : "0";

				return;
			}
			if (!coords) return;
			// Create marker element
			const el = isGiant
				? createGiantPinElement(shop)
				: createRegularPinElement(shop);

			const marker = new mapboxgl.Marker({
				element: el,
				anchor: "bottom",
			})
				.setLngLat(coords)
				.addTo(map.value);

			el.addEventListener("click", (e) => {
				e.stopPropagation();
				if (renderRegularDomMarkers) {
					onSelect?.(shop);
					return;
				}
				if (isGiant) {
					onOpenBuilding?.(shop);
				} else {
					onSelect?.(shop);
				}
			});

			// ✅ Respect visibility state
			el.style.opacity = pinsVisible ? "1" : "0";

			markersMap.value.set(idStr, { marker, shop });
		});

		if (!enableDomCoinMarkers) {
			coinMarkersMap.value.forEach((marker) => {
				marker.remove();
			});
			coinMarkersMap.value.clear();
			return;
		}

		// Coin overlays on every pin in viewport (dotlottie-wc)
		const bounds = map.value.getBounds?.();
		const coinShops = shops
			.map((shop) => {
				const idStr = String(shop?.id ?? "").trim();
				if (!isAllowedId(idStr)) return null;
				const lat = Number(shop?.lat ?? shop?.latitude);
				const lng = Number(shop?.lng ?? shop?.longitude);
				if (!idStr) return null;
				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
				if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
				if (bounds && !bounds.contains([lng, lat])) return null;
				return { idStr, lat, lng };
			})
			.filter(Boolean)
			.slice(0, 200);
		const coinIds = new Set(coinShops.map((s) => s.idStr));

		coinMarkersMap.value.forEach((marker, key) => {
			if (!coinIds.has(key)) {
				marker.remove();
				coinMarkersMap.value.delete(key);
			}
		});

		coinShops.forEach(({ idStr, lat, lng }) => {
			const existing = coinMarkersMap.value.get(idStr);
			if (existing) {
				existing.setLngLat([lng, lat]);
				const el = existing.getElement?.();
				if (el) {
					el.style.opacity = pinsVisible ? "1" : "0";
				}
				return;
			}

			const coinEl = document.createElement("div");
			coinEl.className = "vibe-coin-marker";
			coinEl.style.pointerEvents = "none";
			coinEl.style.transform = "translateY(-90px)";
			coinEl.style.zIndex = "2500";
			coinEl.innerHTML = createCoinFlipHTML();

			const coinMarker = new mapboxgl.Marker({
				element: coinEl,
				anchor: "bottom",
			})
				.setLngLat([lng, lat])
				.addTo(map.value);

			if (!pinsVisible) {
				coinEl.style.opacity = "0";
			}

			coinMarkersMap.value.set(idStr, coinMarker);
		});
	};

	// ✅ Update Giant Pin Markers for Events
	const updateEventMarkers = (
		activeEvents,
		{ onOpenBuilding, pinsVisible = true },
	) => {
		if (!map.value) return;

		const currentMarkers = eventMarkersMap.value;
		const eventIds = new Set(
			activeEvents.map((e) => normalizeId(e?.id)).filter(Boolean),
		);

		// Remove expired event markers
		currentMarkers.forEach((marker, id) => {
			if (!eventIds.has(normalizeId(id))) {
				marker.remove();
				currentMarkers.delete(id);
			}
		});

		// Add new event markers
		activeEvents.forEach((event) => {
			const eventId = normalizeId(event?.id);
			if (!eventId) return;
			// Fix 1E: skip if a regular shop marker already owns this id
			if (markersMap.value.has(eventId)) return;
			const coords = getShopCoords(event);
			if (!coords) {
				const existing = currentMarkers.get(eventId);
				if (existing) {
					existing.remove();
					currentMarkers.delete(eventId);
				}
				return;
			}
			if (currentMarkers.has(eventId)) {
				// Update visibility
				const m = currentMarkers.get(eventId);
				m.setLngLat(coords);
				const el = m.getElement();
				el.style.opacity = pinsVisible ? "1" : "0";
				return;
			}

			const el = createGiantPinElement(event);
			const marker = new mapboxgl.Marker({
				element: el,
				anchor: "bottom",
			})
				.setLngLat(coords)
				.addTo(map.value);

			el.addEventListener("click", (e) => {
				e.stopPropagation();
				onOpenBuilding?.(event);
			});

			if (!pinsVisible) {
				el.style.opacity = "0";
			}

			currentMarkers.set(eventId, marker);
		});
	};

	return {
		markersMap,
		coinMarkersMap,
		eventMarkersMap,
		vibeMarkersMap,
		updateMarkers,
		updateEventMarkers,
	};
}
