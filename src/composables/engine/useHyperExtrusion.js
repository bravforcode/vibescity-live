/**
 * useHyperExtrusion.js — 3D building rise effect on venue focus
 * Composable Layer: Vue 3.
 *
 * Animates fill-extrusion-height from 0 to actual height when Dolly Zoom activates.
 * Holds for 2s then fades back. Only activates if 3D buildings layer exists.
 */

import { onUnmounted } from "vue";

const RISE_DURATION = 800;
const HOLD_DURATION = 2000;
const FADE_DURATION = 1200;

const prefersReducedMotion =
	typeof window !== "undefined"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

const easeOutExpo = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
const smoothstep = (t) => t * t * (3 - 2 * t);

export function useHyperExtrusion(map) {
	if (!map) return { onZoomStart() {}, onZoomEnd() {} };

	let _rafId = null;
	let _holdTimeout = null;
	let _active = false;

	const BUILDINGS_LAYER = "3d-buildings";
	const MAX_HEIGHT = 150;

	const ensureBuildingsLayer = () => {
		if (map.getLayer(BUILDINGS_LAYER)) return true;

		// Try to add 3D buildings from composite source
		const layers = map.getStyle()?.layers;
		if (!layers) return false;

		const labelLayer = layers.find(
			(l) => l.type === "symbol" && l.layout?.["text-field"],
		);

		try {
			map.addLayer(
				{
					id: BUILDINGS_LAYER,
					source: "composite",
					"source-layer": "building",
					filter: ["==", "extrude", "true"],
					type: "fill-extrusion",
					minzoom: 14,
					paint: {
						"fill-extrusion-color": "#aaa",
						"fill-extrusion-height": 0,
						"fill-extrusion-base": 0,
						"fill-extrusion-opacity": 0,
					},
				},
				labelLayer?.id,
			);
			return true;
		} catch {
			return false;
		}
	};

	const onZoomStart = (lngLat) => {
		if (prefersReducedMotion || _active) return;
		if (!ensureBuildingsLayer()) return;

		_active = true;
		cancelAll();

		const startTime = performance.now();

		const rise = () => {
			const elapsed = performance.now() - startTime;
			const progress = Math.min(elapsed / RISE_DURATION, 1);
			const eased = easeOutExpo(progress);

			const height = eased * MAX_HEIGHT;
			const opacity = eased * 0.6;

			try {
				map.setPaintProperty(BUILDINGS_LAYER, "fill-extrusion-height", [
					"interpolate",
					["linear"],
					["get", "height"],
					0,
					0,
					100,
					height,
				]);
				map.setPaintProperty(
					BUILDINGS_LAYER,
					"fill-extrusion-opacity",
					opacity,
				);
			} catch {
				/* noop */
			}

			if (progress < 1) {
				_rafId = requestAnimationFrame(rise);
			}
		};

		_rafId = requestAnimationFrame(rise);
	};

	const onZoomEnd = () => {
		if (!_active) return;

		_holdTimeout = setTimeout(() => {
			const startTime = performance.now();

			const fade = () => {
				const elapsed = performance.now() - startTime;
				const progress = Math.min(elapsed / FADE_DURATION, 1);
				const eased = smoothstep(progress);

				const height = MAX_HEIGHT * (1 - eased);
				const opacity = 0.6 * (1 - eased);

				try {
					map.setPaintProperty(BUILDINGS_LAYER, "fill-extrusion-height", [
						"interpolate",
						["linear"],
						["get", "height"],
						0,
						0,
						100,
						height,
					]);
					map.setPaintProperty(
						BUILDINGS_LAYER,
						"fill-extrusion-opacity",
						opacity,
					);
				} catch {
					/* noop */
				}

				if (progress < 1) {
					_rafId = requestAnimationFrame(fade);
				} else {
					_active = false;
				}
			};

			_rafId = requestAnimationFrame(fade);
		}, HOLD_DURATION);
	};

	const cancelAll = () => {
		if (_rafId) {
			cancelAnimationFrame(_rafId);
			_rafId = null;
		}
		if (_holdTimeout) {
			clearTimeout(_holdTimeout);
			_holdTimeout = null;
		}
	};

	onUnmounted(() => {
		cancelAll();
		_active = false;
	});

	return { onZoomStart, onZoomEnd };
}
