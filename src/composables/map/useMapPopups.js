import { ref, shallowRef } from "vue";
import { useShopStore } from "@/store/shopStore";

export function useMapPopups(mapRef, mapContainerRef) {
	const shopStore = useShopStore();

	// State
	const buildingPopupX = ref(0);
	const buildingPopupY = ref(0);
	const buildingPopupVisible = ref(false);
	const buildingPopupName = ref("");
	const buildingPopupCategoryIcon = ref("📍");
	const buildingPopupVisitors = ref(0);
	const buildingPopupShop = shallowRef(null);
	let lastBuildingPopupUpdateAt = 0;

	// Computed
	const selectedShopVisitors = (highlightedShopId) => {
		const selectedId =
			highlightedShopId != null ? String(highlightedShopId) : null;
		if (!selectedId) return 0;
		const liveVisitors = shopStore?.liveVisitors;
		if (!liveVisitors) return 0;
		if (liveVisitors instanceof Map) {
			return Number(liveVisitors.get(selectedId) || 0);
		}
		if (typeof liveVisitors === "object") {
			return Number(liveVisitors[selectedId] || 0);
		}
		return 0;
	};

	// Helpers
	const categoryToIcon = (category) => {
		const raw = String(category || "")
			.trim()
			.toLowerCase();
		if (
			raw.includes("nightlife") ||
			raw.includes("bar") ||
			raw.includes("club")
		) {
			return "🌃";
		}
		if (raw.includes("temple")) return "⛩️";
		if (raw.includes("park")) return "🌿";
		return "📍";
	};

	// Actions
	const hideBuildingInfoPopup = () => {
		buildingPopupVisible.value = false;
		buildingPopupShop.value = null;
	};

	const syncBuildingPopupContent = (shop, highlightedShopId) => {
		buildingPopupName.value = shop?.name || "";
		buildingPopupCategoryIcon.value = categoryToIcon(shop?.category);
		buildingPopupVisitors.value = Number(
			selectedShopVisitors(highlightedShopId) || 0,
		);
	};

	const updateBuildingInfoPopupPosition = (force = false) => {
		if (!mapRef.value || !mapContainerRef.value || !buildingPopupShop.value) {
			hideBuildingInfoPopup();
			return;
		}
		if (!mapRef.value.isStyleLoaded?.()) {
			hideBuildingInfoPopup();
			return;
		}
		const now = performance.now();
		if (!force && now - lastBuildingPopupUpdateAt < 120) return;
		lastBuildingPopupUpdateAt = now;

		const lng = Number(
			buildingPopupShop.value.lng ?? buildingPopupShop.value.longitude,
		);
		const lat = Number(
			buildingPopupShop.value.lat ?? buildingPopupShop.value.latitude,
		);
		if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
			hideBuildingInfoPopup();
			return;
		}

		const projected = mapRef.value.project([lng, lat]);
		const width = mapContainerRef.value.clientWidth;
		const height = mapContainerRef.value.clientHeight;
		if (
			projected.x < 0 ||
			projected.x > width ||
			projected.y < 0 ||
			projected.y > height
		) {
			hideBuildingInfoPopup();
			return;
		}

		const HEADER_CLEARANCE = 72;
		const POPUP_HEIGHT = 78;
		const PIN_OFFSET = 16;

		let popupY = Math.round(projected.y - POPUP_HEIGHT - PIN_OFFSET);
		if (popupY < HEADER_CLEARANCE) {
			popupY = Math.round(projected.y + PIN_OFFSET + 8);
		}

		buildingPopupX.value = Math.round(projected.x + 16);
		buildingPopupY.value = popupY;
		buildingPopupVisible.value = true;
	};

	const syncBuildingInfoPopupFromSelection = (shops, highlightedShopId) => {
		const highlightedId =
			highlightedShopId != null ? String(highlightedShopId) : null;
		if (!highlightedId) {
			hideBuildingInfoPopup();
			return;
		}
		const selectedShop = shops?.find(
			(shop) => String(shop?.id ?? "") === highlightedId,
		);
		if (!selectedShop) {
			hideBuildingInfoPopup();
			return;
		}
		buildingPopupShop.value = selectedShop;
		syncBuildingPopupContent(selectedShop, highlightedShopId);
		updateBuildingInfoPopupPosition(true);
	};

	return {
		buildingPopupX,
		buildingPopupY,
		buildingPopupVisible,
		buildingPopupName,
		buildingPopupCategoryIcon,
		buildingPopupVisitors,
		buildingPopupShop,
		selectedShopVisitors,
		hideBuildingInfoPopup,
		syncBuildingPopupContent,
		updateBuildingInfoPopupPosition,
		syncBuildingInfoPopupFromSelection,
	};
}
