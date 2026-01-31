import { createGiantPinElement, createMarkerElement } from '@/utils/mapRenderer';
import mapboxgl from 'mapbox-gl';
import { shallowRef } from 'vue';

export function useMapMarkers(map) {
    const markersMap = shallowRef(new Map());
    const eventMarkersMap = shallowRef(new Map());
    const vibeMarkersMap = shallowRef(new Map());

    // ✅ Update Markers (Optimized Diffing)
    const updateMarkers = (shops, highlightedShopId, { onSelect, onOpenBuilding, pinsVisible = true }) => {
        if (!map.value) return;

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
            const isSelected = Number(shop.id) === Number(highlightedShopId);

            // Check if marker already exists
            if (markersMap.value.has(idStr)) {
                const { marker: existingMarker } = markersMap.value.get(idStr);
                const el = existingMarker.getElement();

                // Update Highlight State
                if (isSelected) {
                    el.setAttribute("data-highlighted", "true");
                    el.style.zIndex = "300";
                } else {
                    el.removeAttribute("data-highlighted");
                    el.style.zIndex = isGiant ? "1000" : "50";
                }

                // Update Visibility
                el.style.opacity = pinsVisible ? "1" : "0";

                return;
            }

            // Create DOM Element
            // ✅ Optimization: ONLY create DOM markers for Giant/Active shops or Highlighted
            // Regular shops are rendered via WebGL layer ("unclustered-point")
            if (!isGiant && !isSelected) {
                return;
            }

            let el;
            if (isGiant) {
                el = document.createElement("div");
                el.className = `marker-container transition-all duration-500 will-change-transform z-[1000]`;
                el.innerHTML = `
                <div class="relative group cursor-pointer w-12 h-12">
                    <div class="relative w-full h-full rounded-2xl bg-gradient-to-br from-red-600 via-pink-600 to-purple-600 border-2 border-white shadow-xl flex items-center justify-center transform group-hover:scale-110 transition-transform">
                    <span class="text-xl">🔥</span>
                    </div>
                    <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black text-white text-[9px] font-black uppercase tracking-widest border border-white/20 whitespace-nowrap shadow-md">
                    GIANT
                    </div>
                </div>
            `;
            } else {
                el = createMarkerElement({
                    item: shop,
                    isHighlighted: isSelected,
                    isLive: shop.status === "LIVE",
                    hasCoins: false // We accept this as simplified for now, or pass simpler props
                });
            }

            const marker = new mapboxgl.Marker({
                element: el,
                anchor: "bottom",
            })
                .setLngLat([Number(shop.lng), Number(shop.lat)])
                .addTo(map.value);

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
    const updateEventMarkers = (activeEvents, { onOpenBuilding, pinsVisible = true }) => {
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
        updateEventMarkers
    };
}
