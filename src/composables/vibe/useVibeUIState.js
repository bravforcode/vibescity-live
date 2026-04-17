import { reactive, ref } from "vue";
import {
	normalizeGiantPinPayload,
	resolveCanonicalBuilding,
	resolveVenueBuildingId,
} from "../../domain/venue/giantPinContext";

const AUTO_OPENED_DETAIL_SESSION_KEY = "vibecity.autoOpenedDetailShopIds";

export const normalizeAutoOpenedDetailId = (value) => {
	if (value === null || value === undefined) return null;
	const normalized = String(value).trim();
	return normalized || null;
};

export const restoreAutoOpenedDetailShopIds = (storage) => {
	if (!storage?.getItem) return new Set();
	try {
		const raw = storage.getItem(AUTO_OPENED_DETAIL_SESSION_KEY);
		if (!raw) return new Set();
		const ids = JSON.parse(raw);
		if (!Array.isArray(ids)) return new Set();
		return new Set(
			ids.map((id) => normalizeAutoOpenedDetailId(id)).filter(Boolean),
		);
	} catch {
		return new Set();
	}
};

export const persistAutoOpenedDetailShopIds = (storage, ids) => {
	if (!storage?.setItem || !(ids instanceof Set)) return;
	try {
		storage.setItem(
			AUTO_OPENED_DETAIL_SESSION_KEY,
			JSON.stringify([...ids].filter(Boolean)),
		);
	} catch {
		// ignore sessionStorage failures
	}
};

export const shouldAutoOpenDetailAfterFlight = ({
	shopId,
	source,
	surface,
	selectedShopId = null,
	openedShopIds = new Set(),
} = {}) => {
	const normalizedId = normalizeAutoOpenedDetailId(shopId);
	if (!normalizedId) return false;
	if (surface !== "preview") return false;
	if (normalizeAutoOpenedDetailId(selectedShopId) === normalizedId)
		return false;
	if (source === "sentient") return !openedShopIds.has(normalizedId);
	if (source !== "carousel" && source !== "startup") return false;
	return !openedShopIds.has(normalizedId);
};

export function useVibeUIState({ buildingsData }) {
	const selectedShop = ref(null);
	const errorMessage = ref(null);
	const activeFloor = ref("GF");
	const activeBuilding = ref(null);
	const activeDrawerContext = ref(null);
	const activeDrawerBuilding = ref(null);
	const activeProvince = ref(null);
	const activeZone = ref(null);
	const isOwnerDashboardOpen = ref(false);
	const favorites = ref([]);
	const showSafetyPanel = ref(false);
	const showFavoritesModal = ref(false);
	const showMallDrawer = ref(false);
	const isRefreshing = ref(false);
	const mapSelectionIntent = ref(null);

	const openedDetailShopIds = reactive(new Set());
	let drawerStateResetTimerId = null;

	const markDetailOpened = (id) => {
		const normalized = normalizeAutoOpenedDetailId(id);
		if (!normalized) return;
		openedDetailShopIds.add(normalized);
	};

	const normalizeDrawerBuildingId = (value) => {
		if (value === null || value === undefined) return null;
		const normalized = String(value).trim();
		return normalized || null;
	};

	const cancelDrawerStateReset = () => {
		if (drawerStateResetTimerId === null) return;
		clearTimeout(drawerStateResetTimerId);
		drawerStateResetTimerId = null;
	};

	const createMallDrawerContext = ({
		source = "map",
		buildingId = null,
		buildingName = null,
		initialShopId = null,
	} = {}) => {
		const normalizedBuildingId = normalizeDrawerBuildingId(buildingId);
		const normalizedInitialShopId = normalizeDrawerBuildingId(initialShopId);
		return {
			contextId: [
				"mall",
				source || "map",
				normalizedBuildingId || "unresolved",
				normalizedInitialShopId || "none",
			].join(":"),
			mode: "mall",
			source: source || "map",
			buildingId: normalizedBuildingId,
			buildingName:
				typeof buildingName === "string" && buildingName.trim()
					? buildingName.trim()
					: null,
			representativeShopId: null,
			initialShopId: normalizedInitialShopId,
		};
	};

	const buildDrawerBuilding = (building, drawerContext) => {
		const source = building && typeof building === "object" ? building : {};
		const buildingId =
			normalizeDrawerBuildingId(source.id) ||
			normalizeDrawerBuildingId(source.key) ||
			normalizeDrawerBuildingId(drawerContext?.buildingId);
		const buildingName =
			(typeof source.name === "string" && source.name.trim()) ||
			(typeof source.building_name === "string" &&
				source.building_name.trim()) ||
			(typeof drawerContext?.buildingName === "string" &&
				drawerContext.buildingName.trim()) ||
			null;

		if (
			!buildingId &&
			!buildingName &&
			source.lat === undefined &&
			source.lng === undefined
		) {
			return null;
		}

		return {
			...source,
			id: source.id ?? buildingId,
			key: source.key ?? buildingId,
			name: source.name ?? buildingName,
			lat: source.lat ?? source.latitude ?? null,
			lng: source.lng ?? source.longitude ?? null,
		};
	};

	const setDrawerState = ({
		canonicalBuilding = null,
		drawerContext = null,
		drawerBuilding = null,
		open = false,
		floor,
	} = {}) => {
		cancelDrawerStateReset();
		activeBuilding.value = canonicalBuilding;
		activeDrawerContext.value = drawerContext;
		activeDrawerBuilding.value = drawerBuilding || canonicalBuilding;
		showMallDrawer.value = open;
		if (floor !== undefined) {
			activeFloor.value = floor;
		}
	};

	const clearDrawerState = ({ resetFloor = false } = {}) => {
		cancelDrawerStateReset();
		activeBuilding.value = null;
		activeDrawerContext.value = null;
		activeDrawerBuilding.value = null;
		if (resetFloor) {
			activeFloor.value = "GF";
		}
	};

	const closeMallDrawer = ({ resetFloor = true } = {}) => {
		showMallDrawer.value = false;
		cancelDrawerStateReset();
		drawerStateResetTimerId = setTimeout(() => {
			clearDrawerState({ resetFloor });
		}, 220);
	};

	const resolveCanonicalBuildingForDrawer = (
		buildingId,
		fallbackBuilding = null,
	) => {
		const normalizedBuildingId = normalizeDrawerBuildingId(buildingId);
		const canonicalBuilding = resolveCanonicalBuilding(
			buildingsData?.value || [],
			normalizedBuildingId,
		);
		if (canonicalBuilding) return canonicalBuilding;
		if (fallbackBuilding && typeof fallbackBuilding === "object") {
			return buildDrawerBuilding(fallbackBuilding, {
				buildingId: normalizedBuildingId,
			});
		}
		return null;
	};

	return {
		selectedShop,
		errorMessage,
		activeFloor,
		activeBuilding,
		activeDrawerContext,
		activeDrawerBuilding,
		activeProvince,
		activeZone,
		isOwnerDashboardOpen,
		favorites,
		showSafetyPanel,
		showFavoritesModal,
		showMallDrawer,
		isRefreshing,
		mapSelectionIntent,
		openedDetailShopIds,
		markDetailOpened,
		createMallDrawerContext,
		buildDrawerBuilding,
		setDrawerState,
		clearDrawerState,
		closeMallDrawer,
		resolveCanonicalBuildingForDrawer,
	};
}
