/**
 * useVibeTrails.js — Animated comet trails for real-time vibe events
 * Composable Layer: Vue 3.
 *
 * When a vibe event fires via socketService, a glowing
 * bezier-curve trail flies from sender to target venue.
 * Max 10 concurrent trails. Auto-cleanup after 2s.
 */

import { onUnmounted } from "vue";

const MAX_CONCURRENT = 10;
const TRAIL_DURATION = 2000;
const TRAIL_STEPS = 40;
const ARC_HEIGHT = 0.003; // degrees latitude for bezier midpoint

const prefersReducedMotion =
	typeof window !== "undefined"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

// Quadratic bezier point
const bezierPoint = (p0, p1, p2, t) => {
	const mt = 1 - t;
	return [
		mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
		mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
	];
};

export function useVibeTrails(map) {
	if (!map) return { fireTrail() {} };

	const trails = new Map();
	let _trailCounter = 0;
	let _rafId = null;
	let _loopActive = false;

	const SOURCE_ID = "vibe-trails-source";
	const LAYER_ID = "vibe-trails-layer";

	const ensureLayer = () => {
		if (!map.isStyleLoaded?.()) return false;

		if (!map.getSource(SOURCE_ID)) {
			map.addSource(SOURCE_ID, {
				type: "geojson",
				data: { type: "FeatureCollection", features: [] },
			});
		}
		if (!map.getLayer(LAYER_ID)) {
			try {
				map.addLayer({
					id: LAYER_ID,
					type: "line",
					source: SOURCE_ID,
					paint: {
						"line-color": ["coalesce", ["get", "color"], "#f59e0b"],
						"line-width": 3,
						"line-opacity": ["coalesce", ["get", "opacity"], 0.8],
						"line-blur": 2,
					},
					layout: {
						"line-cap": "round",
						"line-join": "round",
					},
				});
			} catch {
				return false;
			}
		}
		return true;
	};

	/**
	 * Fire a trail from source to target.
	 * @param {[number,number]} from — [lng, lat]
	 * @param {[number,number]} to — [lng, lat]
	 * @param {{ color?: string }} opts
	 */
	const fireTrail = (from, to, opts = {}) => {
		if (prefersReducedMotion || !from || !to) return;
		if (!ensureLayer()) return;

		// Evict oldest if at capacity
		if (trails.size >= MAX_CONCURRENT) {
			const oldest = trails.keys().next().value;
			trails.delete(oldest);
		}

		const id = `trail-${_trailCounter++}`;
		const midLng = (from[0] + to[0]) / 2;
		const midLat = (from[1] + to[1]) / 2 + ARC_HEIGHT;
		const mid = [midLng, midLat];

		trails.set(id, {
			from,
			to,
			mid,
			startTime: performance.now(),
			color: opts.color || "#f59e0b",
		});

		startLoop();
	};

	const startLoop = () => {
		if (_loopActive) return;
		_loopActive = true;

		const loop = () => {
			if (!_loopActive || trails.size === 0) {
				_loopActive = false;
				clearTrailSource();
				return;
			}

			const now = performance.now();
			const features = [];

			for (const [id, trail] of trails) {
				const elapsed = now - trail.startTime;
				if (elapsed > TRAIL_DURATION) {
					trails.delete(id);
					continue;
				}

				const progress = easeOutCubic(elapsed / TRAIL_DURATION);
				const headIndex = Math.floor(progress * TRAIL_STEPS);
				const tailLength = 12; // longer tail
				const startIndex = Math.max(0, headIndex - tailLength);

				const coords = [];
				for (let i = startIndex; i <= headIndex && i <= TRAIL_STEPS; i++) {
					const t = i / TRAIL_STEPS;
					coords.push(bezierPoint(trail.from, trail.mid, trail.to, t));
				}

				if (coords.length >= 2) {
					// Elegant fade out: trail head starts fading early, tail is always dimmer
					// Overall opacity fades as it nears target
					const baseOpacity = 1.0 - progress * progress;
					features.push({
						type: "Feature",
						geometry: { type: "LineString", coordinates: coords },
						properties: {
							color: trail.color,
							opacity: Math.max(0.05, baseOpacity),
						},
					});
				}
			}

			try {
				const source = map.getSource(SOURCE_ID);
				if (source) {
					source.setData({ type: "FeatureCollection", features });
				}
			} catch {
				/* noop */
			}

			_rafId = requestAnimationFrame(loop);
		};

		_rafId = requestAnimationFrame(loop);
	};

	const clearTrailSource = () => {
		try {
			const source = map.getSource(SOURCE_ID);
			if (source) {
				source.setData({ type: "FeatureCollection", features: [] });
			}
		} catch {
			/* noop */
		}
	};

	onUnmounted(() => {
		_loopActive = false;
		if (_rafId) cancelAnimationFrame(_rafId);
		trails.clear();
	});

	return { fireTrail };
}
