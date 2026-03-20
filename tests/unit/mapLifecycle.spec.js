import { describe, expect, it } from "vitest";
import {
	MAP_LIFECYCLE_STATE,
	useMapLifecycle,
} from "../../src/composables/map/useMapLifecycle";

const createMockMap = () => {
	const sources = new Map();
	const layers = new Map();
	return {
		addSource: (id, def) => {
			sources.set(id, {
				...def,
				setData: (data) => sources.set(id, { ...sources.get(id), data }),
			});
		},
		getSource: (id) => sources.get(id),
		removeSource: (id) => sources.delete(id),
		addLayer: (def) => layers.set(def.id, { ...def }),
		getLayer: (id) => layers.get(id),
		removeLayer: (id) => layers.delete(id),
		__sources: sources,
		__layers: layers,
	};
};

describe("useMapLifecycle", () => {
	it("adds source/layer idempotently and updates data", () => {
		const map = createMockMap();
		const lifecycle = useMapLifecycle();

		lifecycle.markReady();
		expect(lifecycle.state.value).toBe(MAP_LIFECYCLE_STATE.MAP_READY);

		expect(
			lifecycle.ensureSource(map, "s1", {
				type: "geojson",
				data: { type: "FeatureCollection", features: [] },
			}),
		).toBe(true);
		expect(
			lifecycle.ensureSource(map, "s1", { type: "geojson", data: {} }),
		).toBe(true);

		expect(
			lifecycle.ensureLayer(map, {
				id: "l1",
				type: "symbol",
				source: "s1",
			}),
		).toBe(true);
		expect(
			lifecycle.ensureLayer(map, {
				id: "l1",
				type: "symbol",
				source: "s1",
			}),
		).toBe(true);

		expect(
			lifecycle.setSourceData(map, "s1", {
				type: "FeatureCollection",
				features: [],
			}),
		).toBe(true);
		expect(lifecycle.state.value).toBe(MAP_LIFECYCLE_STATE.LAYERS_ADDED);
	});

	it("removes registered layer/source", () => {
		const map = createMockMap();
		const lifecycle = useMapLifecycle();
		lifecycle.ensureSource(map, "s2", {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
		});
		lifecycle.ensureLayer(map, { id: "l2", type: "symbol", source: "s2" });
		expect(lifecycle.removeLayer(map, "l2")).toBe(true);
		expect(lifecycle.removeSource(map, "s2")).toBe(true);
	});
});
