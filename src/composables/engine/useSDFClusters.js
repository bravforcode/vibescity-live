/**
 * useSDFClusters.js — Vue bridge for SDF Liquid Clustering
 * Composable Layer: Vue 3.
 *
 * Manages the SDFClusterLayer lifecycle on the Mapbox map.
 * Feeds venue positions from shopStore, throttled to 30fps.
 * Adds spring-physics displacement on zoom transitions.
 * Gracefully degrades to standard layers if WebGL2 unavailable.
 */

import { getCurrentInstance, onUnmounted, watch } from "vue";
import { caps } from "@/engine/capabilities.js";
import { SDFClusterLayer } from "@/engine/rendering/SDFClusterLayer.js";
import { useShopStore } from "@/store/shopStore.js";

const SDF_LAYER_BEFORE = "unclustered-pins";

// Spring constants for zoom break-apart effect
const SPRING_STIFFNESS = 12;
const SPRING_DAMPING = 4;
const SPRING_AMPLITUDE = 8; // max px displacement

/**
 * @param {import('mapbox-gl').Map} map
 */
export function useSDFClusters(map) {
	if (!caps.webgl2 || !caps.floatTextures || !map) {
		return { enabled: false, dispose: () => {} };
	}

	const shopStore = useShopStore();
	const layer = new SDFClusterLayer();

	let _frameThrottle = null;
	let _scheduled = false;
	let _repaintRaf = null;
	let _idleTimeout = null;
	let _isAnimating = false;
	let _disposed = false;

	// Spring state per pin (index → { offsetX, offsetY, t0 })
	let _springOffsets = [];
	let _lastZoom = map.getZoom();

	const getSmoothK = () => {
		const zoom = map.getZoom();
		return Math.max(2, Math.min(40, 40 / (zoom - 9)));
	};

	const getPinRadius = () => {
		const zoom = map.getZoom();
		return Math.max(8, Math.min(30, zoom * 1.5));
	};

	const categoryToId = {
		bar: 0,
		club: 0,
		nightlife: 1,
		food: 2,
		restaurant: 2,
		cafe: 2,
		nature: 3,
		park: 3,
		culture: 4,
		museum: 4,
		temple: 4,
		shopping: 5,
		mall: 5,
		wellness: 6,
		spa: 6,
		sport: 7,
		gym: 7,
		hotel: 8,
		resort: 8,
	};
	const getCategoryId = (shop) => {
		const cat = (shop.category || shop.Category || "").toLowerCase();
		return categoryToId[cat] ?? 9;
	};

	// ─── Spring displacement ─────────────────────────────────────
	const triggerSpring = (pinCount, zoomDelta) => {
		const now = performance.now();
		const direction = zoomDelta > 0 ? 1 : -1; // zoom in = expand, zoom out = contract
		_springOffsets = [];
		for (let i = 0; i < pinCount; i++) {
			// Random angle per pin for radial burst
			const angle = i * 2.399 + now * 0.001; // golden angle
			_springOffsets.push({
				angle,
				direction,
				t0: now,
			});
		}
	};

	const getSpringOffset = (springState, now) => {
		const dt = (now - springState.t0) / 1000;
		if (dt > 2) return { dx: 0, dy: 0 }; // spring settled

		const decay = Math.exp(-SPRING_DAMPING * dt);
		const oscillation = Math.sin(SPRING_STIFFNESS * dt);
		const magnitude =
			SPRING_AMPLITUDE * decay * oscillation * springState.direction;

		return {
			dx: Math.cos(springState.angle) * magnitude,
			dy: Math.sin(springState.angle) * magnitude,
		};
	};

	// ─── Layer setup ─────────────────────────────────────────────
	const setup = () => {
		if (!map || _disposed) return;
		if (!map.isStyleLoaded()) {
			map.once("style.load", setup);
			return;
		}
		try {
			map.addLayer(layer, SDF_LAYER_BEFORE);
		} catch {
			try {
				map.addLayer(layer);
			} catch {
				/* noop */
			}
		}
		startRepaintLoop();
	};

	// ─── Continuous repaint loop for wobble ──────────────────────
	const startRepaintLoop = () => {
		if (_isAnimating || _disposed) return;
		_isAnimating = true;
		const loop = () => {
			if (!_isAnimating || _disposed) return;
			map.triggerRepaint();
			_repaintRaf = requestAnimationFrame(loop);
		};
		_repaintRaf = requestAnimationFrame(loop);
		scheduleIdle();
	};

	const stopRepaintLoop = () => {
		_isAnimating = false;
		if (_repaintRaf) {
			cancelAnimationFrame(_repaintRaf);
			_repaintRaf = null;
		}
	};

	const scheduleIdle = () => {
		if (_disposed) return;
		if (_idleTimeout) clearTimeout(_idleTimeout);
		_idleTimeout = setTimeout(() => {
			stopRepaintLoop();
		}, 5000); // pause wobble after 5s idle
	};

	const wakeUp = () => {
		startRepaintLoop();
		scheduleIdle();
	};

	// ─── Update pins on shop changes ─────────────────────────────
	const scheduleUpdate = () => {
		if (_scheduled || _disposed) return;
		_scheduled = true;
		_frameThrottle = requestAnimationFrame(() => {
			_scheduled = false;
			updatePins();
		});
	};

	const updatePins = () => {
		if (_disposed) return;
		const shops = shopStore.rawShops;
		if (!shops?.length) return;

		const smoothK = getSmoothK();
		const radius = getPinRadius();
		const now = performance.now();

		const pins = shops
			.filter((s) => s.longitude != null && s.latitude != null)
			.map((s, i) => {
				const pt = map.project([s.longitude, s.latitude]);
				let sx = pt.x;
				let sy = pt.y;

				// Apply spring offset if active
				if (_springOffsets[i]) {
					const { dx, dy } = getSpringOffset(_springOffsets[i], now);
					sx += dx;
					sy += dy;
				}

				return {
					screenX: sx,
					screenY: sy,
					radius,
					categoryId: getCategoryId(s),
				};
			});

		layer.updatePins(pins, smoothK);
		map.triggerRepaint();
	};

	// ─── Zoom spring trigger ─────────────────────────────────────
	const onZoom = () => {
		if (_disposed) return;
		const currentZoom = map.getZoom();
		const delta = currentZoom - _lastZoom;
		if (Math.abs(delta) > 0.3) {
			const shops = shopStore.rawShops;
			if (shops?.length) {
				triggerSpring(shops.length, delta);
			}
		}
		_lastZoom = currentZoom;
		wakeUp();
		scheduleUpdate();
	};

	// ─── Lifecycle ───────────────────────────────────────────────
	setup();

	const stopWatch = watch(() => shopStore.rawShops?.length, scheduleUpdate);

	const onMove = () => {
		if (_disposed) return;
		wakeUp();
		scheduleUpdate();
	};
	map.on("move", onMove);
	map.on("zoom", onZoom);

	const dispose = () => {
		if (_disposed) return;
		_disposed = true;
		stopWatch();
		map.off("move", onMove);
		map.off("zoom", onZoom);
		if (_frameThrottle) cancelAnimationFrame(_frameThrottle);
		_frameThrottle = null;
		stopRepaintLoop();
		if (_idleTimeout) clearTimeout(_idleTimeout);
		_idleTimeout = null;
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
