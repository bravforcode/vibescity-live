import lottie from "lottie-web";
import mapboxgl from "mapbox-gl";
import { shallowRef } from "vue";
import coinAnimation from "@/assets/animations/coin.json";
import {
	createGiantPinElement,
	createMarkerElement,
	escapeHtml,
} from "@/utils/mapRenderer";

export function useMapMarkers(map) {
	const markersMap = shallowRef(new Map());
	const eventMarkersMap = shallowRef(new Map());
	const vibeMarkersMap = shallowRef(new Map());

	// ✅ Update Markers (Optimized Diffing)
	const updateMarkers = (shops, highlightedShopId, options = {}) => {
		if (!map.value) return;

		const normalizeId = (value) => {
			if (value === null || value === undefined) return "";
			return String(value).trim();
		};

		const { pinsVisible = true, onSelect, onOpenBuilding } = options;

		const newShopIds = new Set(shops.map((s) => String(s.id)));

		// 1. Remove markers that are no longer in the new list
		markersMap.value.forEach((value, key) => {
			if (!newShopIds.has(key)) {
				value.marker.remove();
				markersMap.value.delete(key);
			}
		});

		// 2. Add or Update markers
		shops.forEach((shop) => {
			const idStr = String(shop.id);
			const isGiant = shop.is_giant_active;
			const isSelected =
				normalizeId(shop.id) === normalizeId(highlightedShopId);

			// Check if marker already exists
			if (markersMap.value.has(idStr)) {
				const { marker: existingMarker } = markersMap.value.get(idStr);
				const el = existingMarker.getElement();

				// Update Highlight State
				if (isSelected) {
					el.dataset.highlighted = "true";
					el.style.zIndex = "300";
				} else {
					delete el.dataset.highlighted;
					el.style.zIndex = isGiant ? "1000" : "50";
				}

				// Update Visibility
				return;
			}
			// Create DOM Element
			// ✅ Optimization: Standardized DOM markers for all pins (Coin+Pin)
			let el;
			if (isGiant) {
				const img = shop.Image_URL1 || shop.coverImage || shop.image_urls?.[0];
				el = document.createElement("div");
				el.className = `marker-container vibe-pin-bounce transition-all duration-500 will-change-transform z-[1000]`;
				el.dataset.shopId = idStr;

				// Giant Pin Structure
				el.innerHTML = `
                <div class="relative group cursor-pointer" style="display:flex;flex-direction:column;align-items:center;">
                    <div class="relative" style="width:42px;height:52px;">
                        <div class="vibe-giant-glow"></div>
                        <img src="/images/pins/pin-purple.png" alt=""
                             class="vibe-pin-img" draggable="false"
                             style="width:42px;height:52px;filter:drop-shadow(0 3px 6px rgba(139,92,246,0.5));" />

                        <div class="absolute inset-0 flex items-center justify-center pb-2">
                             ${img ? `<img src="${img}" class="w-6 h-6 rounded-full object-cover border border-white/50" />` : '<span class="text-white text-xs font-bold">★</span>'}
                        </div>
                    </div>
                    <div class="px-2 py-0.5 rounded-full bg-black/80 text-white text-[8px] font-black uppercase tracking-widest border border-purple-400/30 whitespace-nowrap shadow-md" style="margin-top:-4px;">
                    ${escapeHtml(shop.name || "GIANT")}
                    </div>
                </div>
                `;
			} else {
				el = createMarkerElement({
					item: shop,
					isHighlighted: isSelected,
					isLive: shop.status === "LIVE",
					hasCoins: true,
				});
			}

			const lat = Number(shop.lat ?? shop.latitude);
			const lng = Number(shop.lng ?? shop.longitude);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

			const marker = new mapboxgl.Marker({
				element: el,
				anchor: "bottom",
			})
				.setLngLat([lng, lat])
				.addTo(map.value);

			// ✅ Lottie Animation Initialization
			if (!isGiant && pinsVisible) {
				const coinContainer = el.querySelector(".lottie-coin-target");
				if (coinContainer) {
					try {
						lottie.loadAnimation({
							container: coinContainer,
							renderer: "svg",
							loop: true,
							autoplay: true,
							animationData: coinAnimation,
						});
					} catch (err) {
						// Silent fail for animation
					}
				}
			}

			el.addEventListener("click", (e) => {
				e.stopPropagation();
				if (isGiant) {
					onOpenBuilding?.(shop);
				} else {
					onSelect?.(shop);
				}
			});

			// ✅ Respect visibility state
			if (!pinsVisible) {
				el.style.opacity = "0";
			}

			markersMap.value.set(idStr, { marker, shop });
		});
	};

	// ✅ Update Giant Pin Markers for Events
	const updateEventMarkers = (
		activeEvents,
		{ onOpenBuilding, pinsVisible = true },
	) => {
		if (!map.value) return;

		const currentMarkers = eventMarkersMap.value;
		const eventIds = new Set(activeEvents.map((e) => e.id));

		// Remove expired event markers
		currentMarkers.forEach((marker, id) => {
			if (!eventIds.has(id)) {
				marker.remove();
				currentMarkers.delete(id);
			}
		});

		// Add new event markers
		activeEvents.forEach((event) => {
			if (!event.lat || !event.lng) return;
			if (currentMarkers.has(event.id)) {
				// Update visibility
				const m = currentMarkers.get(event.id);
				const el = m.getElement();
				el.style.opacity = pinsVisible ? "1" : "0";
				return;
			}

			const el = createGiantPinElement(event);
			const marker = new mapboxgl.Marker({
				element: el,
				anchor: "bottom",
			})
				.setLngLat([event.lng, event.lat])
				.addTo(map.value);

			el.addEventListener("click", (e) => {
				e.stopPropagation();
				onOpenBuilding?.(event);
			});

			if (!pinsVisible) {
				el.style.opacity = "0";
			}

			currentMarkers.set(event.id, marker);
		});
	};

	return {
		markersMap,
		eventMarkersMap,
		vibeMarkersMap,
		updateMarkers,
		updateEventMarkers,
	};
}
