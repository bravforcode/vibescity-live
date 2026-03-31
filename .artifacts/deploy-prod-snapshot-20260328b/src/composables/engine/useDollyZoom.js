/**
 * useDollyZoom.js — Cinematic dolly zoom (Vertigo effect) on pin click
 * Composable Layer: Vue 3.
 *
 * Keyframe sequence (from implementation_plan.md §1.4):
 *   Frame 0.0: zoom=current, pitch=0°,  bearing=current
 *   Frame 0.3: zoom-2,       pitch=45°, bearing (slight drift)
 *   Frame 0.7: zoom+3,       pitch=60°, bearing
 *   Frame 1.0: zoom=17,      pitch=55°  (settled on venue)
 *
 * FOV manipulation via map.setFreeCameraOptions() where available.
 * Falls back to map.easeTo() with pitch animation.
 * Respects prefers-reduced-motion.
 */

import { ref } from "vue";

const prefersReducedMotion =
	typeof window !== "undefined"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

// Custom ease-out bezier: cubic-bezier(0.16, 1, 0.3, 1)
const easeOutExpo = (t) => {
	return t === 1 ? 1 : 1 - 2 ** (-10 * t);
};

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {import('maplibre-gl').Map} map
 * @param {{ onZoomStart?: (lngLat: [number,number]) => void, onZoomEnd?: () => void }} callbacks
 */
export function useDollyZoom(map, callbacks = {}) {
	const isAnimating = ref(false);
	const { onZoomStart: onZoomStartCb, onZoomEnd: onZoomEndCb } = callbacks;

	/**
	 * Execute dolly zoom to a venue.
	 * @param {[number, number]} lngLat
	 * @param {{ duration?: number, intensity?: number }} opts
	 * @returns {Promise<void>}
	 */
	const zoomTo = (lngLat, opts = {}) => {
		return new Promise((resolve) => {
			if (!map) {
				resolve();
				return;
			}

			// Reduced motion: simple flyTo
			if (prefersReducedMotion) {
				map.flyTo({
					center: lngLat,
					zoom: 16,
					pitch: 30,
					duration: 800,
					essential: true,
				});
				map.once("moveend", resolve);
				return;
			}

			const duration = opts.duration ?? 1400; // ms
			const intensity = opts.intensity ?? 1.0;

			onZoomStartCb?.(lngLat);

			const startZoom = map.getZoom();
			const startPitch = map.getPitch();
			const startBearing = map.getBearing();
			const startCenter = map.getCenter();

			isAnimating.value = true;

			// Keyframes
			const keyframes = [
				{ t: 0.0, zoom: startZoom, pitch: startPitch, bearing: startBearing },
				{
					t: 0.3,
					zoom: startZoom - 2,
					pitch: 45,
					bearing: startBearing + 3 * intensity,
				},
				{
					t: 0.7,
					zoom: startZoom + 3,
					pitch: 60,
					bearing: startBearing + 1 * intensity,
				},
				{ t: 1.0, zoom: 17, pitch: 55, bearing: startBearing },
			];

			const startTime = performance.now();

			const animate = () => {
				const elapsed = performance.now() - startTime;
				const rawT = Math.min(elapsed / duration, 1.0);
				const t = easeOutExpo(rawT);

				// Find surrounding keyframes
				let k0 = keyframes[0],
					k1 = keyframes[keyframes.length - 1];
				for (let i = 0; i < keyframes.length - 1; i++) {
					if (t >= keyframes[i].t && t <= keyframes[i + 1].t) {
						k0 = keyframes[i];
						k1 = keyframes[i + 1];
						break;
					}
				}

				const segT = k1.t > k0.t ? (t - k0.t) / (k1.t - k0.t) : 1;
				const zoom = lerp(k0.zoom, k1.zoom, segT);
				const pitch = lerp(k0.pitch, k1.pitch, segT);
				const bearing = lerp(k0.bearing, k1.bearing, segT);

				// Interpolate center toward target
				const centerT = easeOutExpo(rawT);
				const lng = lerp(startCenter.lng, lngLat[0], centerT);
				const lat = lerp(startCenter.lat, lngLat[1], centerT);

				// Apply camera
				if (map.setFreeCameraOptions) {
					try {
						// For Mapbox GL v2.3+
						map.setCenter([lng, lat]);
						map.setZoom(zoom);
						map.setPitch(pitch);
						map.setBearing(bearing);
					} catch {
						map.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
					}
				} else {
					map.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
				}

				if (rawT < 1.0) {
					requestAnimationFrame(animate);
				} else {
					isAnimating.value = false;
					onZoomEndCb?.();
					resolve();
				}
			};

			requestAnimationFrame(animate);
		});
	};

	/**
	 * Shared Element Transform: capture pin screen position → FLIP animation to modal.
	 * @param {[number, number]} lngLat
	 * @param {HTMLElement | null} targetEl — modal container element
	 */
	const flipPinToModal = (lngLat, targetEl) => {
		if (!map || !targetEl || prefersReducedMotion) return;

		const pinPt = map.project(lngLat);

		// FIRST: record pin position
		const first = { x: pinPt.x, y: pinPt.y, w: 40, h: 40 };

		// LAST: target element bounds
		const last = targetEl.getBoundingClientRect();

		// INVERT: compute delta
		const dx = first.x - last.left;
		const dy = first.y - last.top;
		const sx = first.w / last.width;
		const sy = first.h / last.height;

		// Apply inverted transform (start from pin position)
		targetEl.style.transition = "none";
		targetEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
		targetEl.style.opacity = "0.4";

		// Force reflow
		targetEl.getBoundingClientRect();

		// PLAY: animate to final position
		targetEl.style.transition =
			"transform 400ms cubic-bezier(0.16,1,0.3,1), opacity 300ms ease-out";
		targetEl.style.transform = "";
		targetEl.style.opacity = "";

		// Cleanup after animation
		const cleanup = () => {
			targetEl.style.transition = "";
			targetEl.removeEventListener("transitionend", cleanup);
		};
		targetEl.addEventListener("transitionend", cleanup, { once: true });
	};

	return {
		isAnimating,
		zoomTo,
		flipPinToModal,
	};
}
