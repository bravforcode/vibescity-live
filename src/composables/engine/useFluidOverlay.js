/**
 * useFluidOverlay.js — Vue bridge for Fluid Heatmap
 * Composable Layer: Vue 3.
 *
 * Injects visitorCount as density splats, wires map pan → velocity injection.
 * Auto-pauses when tab hidden. Adaptive resolution on budget miss.
 */

import { getCurrentInstance, onUnmounted, watch } from "vue";
import { caps } from "@/engine/capabilities.js";
import { FluidHeatmapLayer } from "@/engine/rendering/FluidHeatmapLayer.js";
import { useShopStore } from "@/store/shopStore.js";

export function useFluidOverlay(map) {
	if (!caps.webgl2 || !caps.floatTextures || !map) {
		return { enabled: false, dispose: () => {} };
	}

	const shopStore = useShopStore();
	const layer = new FluidHeatmapLayer();
	let _disposed = false;

	let _prevMapCenter = null;
	let _hidden = false;
	let _splatInterval = null;

	// ─── Setup layer ──────────────────────────────────────────────
	const setup = () => {
		if (_disposed || !map) return;
		if (!map.isStyleLoaded()) {
			map.once("style.load", setup);
			return;
		}
		try {
			map.addLayer(layer);
		} catch {
			/* noop */
		}
	};

	// ─── Inject density splats from venue visitorCounts ───────────
	const injectDensity = () => {
		if (_hidden || _disposed) return;
		const shops = shopStore.rawShops;
		if (!shops?.length) return;

		const bounds = map.getBounds();
		const sw = bounds.getSouthWest();
		const ne = bounds.getNorthEast();
		const lngRange = ne.lng - sw.lng;
		const latRange = ne.lat - sw.lat;

		shops.forEach((shop) => {
			const lng = shop.longitude;
			const lat = shop.latitude;
			if (lng == null || lat == null) return;
			if (lng < sw.lng || lng > ne.lng || lat < sw.lat || lat > ne.lat) return;

			const u = (lng - sw.lng) / lngRange;
			const v = (lat - sw.lat) / latRange;
			const count = shop.visitorCount ?? shop.visitor_count ?? 10;
			const density = Math.min(count / 500, 1.0); // normalize to 0..1
			const radius = 0.02 + density * 0.05;

			layer.addDensitySplat(u, v, density * 0.15, radius);
		});
	};

	// ─── Map pan → velocity injection ────────────────────────────
	const onMapMove = () => {
		if (_hidden || _disposed) return;
		const center = map.getCenter();
		if (_prevMapCenter) {
			const proj = map.project(center);
			const prevProj = map.project(_prevMapCenter);
			const vx = (proj.x - prevProj.x) * 0.02;
			const vy = (proj.y - prevProj.y) * 0.02;
			if (Math.abs(vx) > 0.001 || Math.abs(vy) > 0.001) {
				layer.setMapVelocity(vx, vy);
			}
		}
		_prevMapCenter = center;
	};

	// ─── Tab visibility ───────────────────────────────────────────
	const onVisibilityChange = () => {
		if (_disposed) return;
		_hidden = document.visibilityState === "hidden";
	};

	// ─── Lifecycle ────────────────────────────────────────────────
	setup();

	map.on("move", onMapMove);
	document.addEventListener("visibilitychange", onVisibilityChange);

	// Inject density splats at 2Hz (enough for visual effect)
	_splatInterval = setInterval(injectDensity, 500);

	const stopWatch = watch(
		() => shopStore.rawShops?.length,
		() => injectDensity(),
	);

	const dispose = () => {
		if (_disposed) return;
		_disposed = true;
		stopWatch();
		clearInterval(_splatInterval);
		_splatInterval = null;
		map.off("move", onMapMove);
		document.removeEventListener("visibilitychange", onVisibilityChange);
		try {
			map.removeLayer(layer.id);
		} catch {
			/* noop */
		}
	};

	if (getCurrentInstance()) {
		onUnmounted(dispose);
	}

	return { enabled: true, layer, dispose };
}
