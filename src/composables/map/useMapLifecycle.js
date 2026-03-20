import { ref } from "vue";

export const MAP_LIFECYCLE_STATE = Object.freeze({
	UNINITIALIZED: "UNINITIALIZED",
	MAP_READY: "MAP_READY",
	SOURCE_LOADED: "SOURCE_LOADED",
	LAYERS_ADDED: "LAYERS_ADDED",
	UPDATING: "UPDATING",
	DEGRADED: "DEGRADED",
	DESTROYED: "DESTROYED",
});

const toNonEmptyString = (value) => {
	const next = String(value ?? "").trim();
	return next || "";
};

export function useMapLifecycle() {
	const state = ref(MAP_LIFECYCLE_STATE.UNINITIALIZED);

	const transition = (nextState) => {
		const normalized = toNonEmptyString(nextState);
		if (!normalized) return state.value;
		state.value = normalized;
		return state.value;
	};

	const ensureSource = (mapInstance, sourceId, sourceDef) => {
		if (!mapInstance || !sourceId || !sourceDef) return false;
		try {
			if (mapInstance.getSource(sourceId)) return true;
			mapInstance.addSource(sourceId, sourceDef);
			if (
				state.value === MAP_LIFECYCLE_STATE.MAP_READY ||
				state.value === MAP_LIFECYCLE_STATE.UNINITIALIZED
			) {
				state.value = MAP_LIFECYCLE_STATE.SOURCE_LOADED;
			}
			return true;
		} catch {
			return false;
		}
	};

	const ensureLayer = (mapInstance, layerDef, beforeId) => {
		const layerId = toNonEmptyString(layerDef?.id);
		if (!mapInstance || !layerId || !layerDef) return false;
		try {
			if (mapInstance.getLayer(layerId)) return true;
			mapInstance.addLayer(layerDef, beforeId);
			if (
				state.value === MAP_LIFECYCLE_STATE.SOURCE_LOADED ||
				state.value === MAP_LIFECYCLE_STATE.MAP_READY
			) {
				state.value = MAP_LIFECYCLE_STATE.LAYERS_ADDED;
			}
			return true;
		} catch {
			return false;
		}
	};

	const removeLayer = (mapInstance, layerId) => {
		if (!mapInstance || !layerId || !mapInstance.getLayer(layerId))
			return false;
		try {
			mapInstance.removeLayer(layerId);
			return true;
		} catch {
			return false;
		}
	};

	const removeSource = (mapInstance, sourceId) => {
		if (!mapInstance || !sourceId || !mapInstance.getSource(sourceId))
			return false;
		try {
			mapInstance.removeSource(sourceId);
			return true;
		} catch {
			return false;
		}
	};

	const setSourceData = (mapInstance, sourceId, data) => {
		if (!mapInstance || !sourceId) return false;
		const source = mapInstance.getSource(sourceId);
		if (!source?.setData || !data) return false;
		try {
			if (state.value !== MAP_LIFECYCLE_STATE.DEGRADED) {
				state.value = MAP_LIFECYCLE_STATE.UPDATING;
			}
			source.setData(data);
			if (state.value === MAP_LIFECYCLE_STATE.UPDATING) {
				state.value = MAP_LIFECYCLE_STATE.LAYERS_ADDED;
			}
			return true;
		} catch {
			return false;
		}
	};

	const markReady = () => transition(MAP_LIFECYCLE_STATE.MAP_READY);
	const markDegraded = () => transition(MAP_LIFECYCLE_STATE.DEGRADED);
	const markDestroyed = () => transition(MAP_LIFECYCLE_STATE.DESTROYED);

	return {
		state,
		transition,
		markReady,
		markDegraded,
		markDestroyed,
		ensureSource,
		ensureLayer,
		removeLayer,
		removeSource,
		setSourceData,
	};
}
