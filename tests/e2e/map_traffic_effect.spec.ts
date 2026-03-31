import { expect, test } from "@playwright/test";
import {
	isMapRequiredProfile,
	waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

const BANGKOK_GEO = { latitude: 13.7563, longitude: 100.5018 };
const CHIANG_MAI_GEO = { latitude: 18.7883, longitude: 98.9853 };

test.describe.configure({ mode: "serial" });

const readTrafficSnapshot = async (page) => {
	return page.evaluate(() => {
		const map = window.__vibecityMapDebug;
		if (!map || typeof map.getStyle !== "function") {
			return {
				ok: false,
				reason: "map-debug-unavailable",
			};
		}

		const style = map.getStyle();
		const styleLayers = Array.isArray(style?.layers) ? style.layers : [];
		const getLayerDef = (layerId) =>
			styleLayers.find((layer) => layer?.id === layerId) || null;
		const activeTrafficLayerId =
			[
				"road-cars",
				"road-flow-car-symbol",
				"road-flow-car-core",
				"road-flow-core",
				"road-flow-glow",
			].find((layerId) => Boolean(getLayerDef(layerId))) || null;
		const activeTrafficLayer = activeTrafficLayerId
			? getLayerDef(activeTrafficLayerId)
			: null;

		const hasRoadCars = Boolean(map.getLayer("road-cars"));
		const hasFlowCore = Boolean(map.getLayer("road-flow-core"));
		const hasFlowGlow = Boolean(map.getLayer("road-flow-glow"));
		const hasFlowCarSymbol = Boolean(map.getLayer("road-flow-car-symbol"));
		const flowCarSource = map.getSource("road-flow-cars");
		const flowCarFeatureCount = Array.isArray(flowCarSource?._data?.features)
			? flowCarSource._data.features.length
			: null;
		const renderedFlowCarCore = map.getLayer("road-flow-car-core")
			? map.queryRenderedFeatures(undefined, {
					layers: ["road-flow-car-core"],
				}).length
			: 0;
		const renderedFlowCarSymbol = hasFlowCarSymbol
			? map.queryRenderedFeatures(undefined, {
					layers: ["road-flow-car-symbol"],
				}).length
			: 0;
		const renderedFlowRoadCore = hasFlowCore
			? map.queryRenderedFeatures(undefined, {
					layers: ["road-flow-core"],
				}).length
			: 0;

		return {
			ok: true,
			center: map.getCenter ? map.getCenter() : null,
			hasRoadCars,
			hasFlowCore,
			hasFlowGlow,
			hasFlowCarSymbol,
			flowCarFeatureCount,
			renderedFlowCarCore,
			renderedFlowCarSymbol,
			renderedFlowRoadCore,
			activeTrafficLayerId,
			hasLocalTrafficSource: Boolean(map.getSource("traffic-roads-local")),
			hasCompositeSource: Boolean(map.getSource("composite")),
			roadCarsSource: activeTrafficLayer?.source || null,
			roadCarsSourceLayer: activeTrafficLayer?.["source-layer"] || null,
			iconOffset: hasRoadCars
				? map.getLayoutProperty("road-cars", "icon-offset")
				: null,
			flowDash: hasFlowCore
				? map.getPaintProperty("road-flow-core", "line-dasharray")
				: null,
			sourceIds: Object.keys(style?.sources || {}),
		};
	});
};

test("traffic road effect mounts and animates @map-required", async ({
	page,
}) => {
	if (!isMapRequiredProfile()) {
		test.skip(
			true,
			"Traffic effect test requires @map-required profile (set E2E_MAP_REQUIRED=1).",
		);
		return;
	}
	const context = page.context();
	await context.grantPermissions(["geolocation"]);
	await context.setGeolocation(BANGKOK_GEO);
	await page.goto("/", { waitUntil: "domcontentloaded" });

	const mapReady = await waitForMapReadyOrSkip(page, 60_000);
	if (!mapReady) return;

	await page.waitForFunction(
		() => {
			const map = window.__vibecityMapDebug;
			if (!map || typeof map.getLayer !== "function") return false;
			return Boolean(
				map.getLayer("road-cars") ||
					map.getLayer("road-flow-core") ||
					map.getLayer("road-flow-glow"),
			);
		},
		undefined,
		{ timeout: 20_000 },
	);

	const first = await readTrafficSnapshot(page);
	expect(first.ok).toBe(true);
	expect(
		first.hasRoadCars ||
			first.hasFlowCore ||
			first.hasFlowGlow ||
			first.hasFlowCarSymbol,
	).toBe(true);
	expect(Boolean(first.roadCarsSource)).toBe(true);

	const prefersReducedMotion = await page.evaluate(
		() =>
			window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
	);

	await page.waitForTimeout(1_000);
	const second = await readTrafficSnapshot(page);

	const offsetChanged =
		JSON.stringify(first.iconOffset) !== JSON.stringify(second.iconOffset);
	const dashChanged =
		JSON.stringify(first.flowDash) !== JSON.stringify(second.flowDash);

	if (prefersReducedMotion) {
		expect(
			second.hasRoadCars || second.hasFlowCore || second.hasFlowCarSymbol,
		).toBe(true);
	} else {
		expect(
			second.hasRoadCars ||
				second.hasFlowCore ||
				second.hasFlowGlow ||
				second.hasFlowCarSymbol ||
				offsetChanged ||
				dashChanged,
		).toBe(true);
	}
});

test("traffic road effect follows province geolocation changes @map-required", async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName !== "chromium" || process.env.PW_TRAFFIC_GEO_SWITCH !== "1",
		"Geolocation-switch traffic regression is opt-in because headless runners do not update location reliably.",
	);
	if (!isMapRequiredProfile()) {
		test.skip(
			true,
			"Traffic effect test requires @map-required profile (set E2E_MAP_REQUIRED=1).",
		);
		return;
	}

	const context = page.context();
	await context.grantPermissions(["geolocation"]);
	await context.setGeolocation(BANGKOK_GEO);

	await page.goto("/", { waitUntil: "domcontentloaded" });

	const mapReady = await waitForMapReadyOrSkip(page, 60_000);
	if (!mapReady) return;

	await page.waitForFunction(
		() => {
			const map = window.__vibecityMapDebug;
			if (!map || typeof map.getLayer !== "function") return false;
			return Boolean(
				map.getLayer("road-cars") ||
					map.getLayer("road-flow-core") ||
					map.getLayer("road-flow-glow"),
			);
		},
		undefined,
		{ timeout: 20_000 },
	);

	const bangkok = await readTrafficSnapshot(page);
	expect(
		bangkok.hasRoadCars ||
			bangkok.hasFlowCore ||
			bangkok.hasFlowGlow ||
			bangkok.hasFlowCarSymbol,
	).toBe(true);

	await context.setGeolocation(CHIANG_MAI_GEO);

	await page.waitForFunction(
		({ lat, lng }) => {
			const map = window.__vibecityMapDebug;
			const center = map?.getCenter?.();
			if (!center) return false;
			return (
				Math.abs(center.lat - lat) < 0.05 && Math.abs(center.lng - lng) < 0.05
			);
		},
		{ lat: CHIANG_MAI_GEO.latitude, lng: CHIANG_MAI_GEO.longitude },
		{ timeout: 30_000 },
	);

	await page.waitForFunction(
		() => {
			const map = window.__vibecityMapDebug;
			if (!map || typeof map.getLayer !== "function") return false;
			const renderedRoads = map.getLayer("road-flow-core")
				? map.queryRenderedFeatures(undefined, {
						layers: ["road-flow-core"],
					}).length
				: 0;
			const renderedCars = map.getLayer("road-flow-car-core")
				? map.queryRenderedFeatures(undefined, {
						layers: ["road-flow-car-core"],
					}).length
				: 0;
			const renderedSymbols = map.getLayer("road-flow-car-symbol")
				? map.queryRenderedFeatures(undefined, {
						layers: ["road-flow-car-symbol"],
					}).length
				: 0;
			return renderedRoads > 0 && Math.max(renderedCars, renderedSymbols) > 0;
		},
		undefined,
		{ timeout: 25_000 },
	);

	const chiangMai = await readTrafficSnapshot(page);
	expect((chiangMai.renderedFlowRoadCore ?? 0) > 0).toBe(true);
	expect(
		Math.max(
			chiangMai.renderedFlowCarCore ?? 0,
			chiangMai.renderedFlowCarSymbol ?? 0,
		) > 0,
	).toBe(true);
	expect(
		Math.abs((chiangMai.center?.lat ?? 0) - CHIANG_MAI_GEO.latitude) < 0.05,
	).toBe(true);
	expect(
		Math.abs((chiangMai.center?.lng ?? 0) - CHIANG_MAI_GEO.longitude) < 0.05,
	).toBe(true);
});
