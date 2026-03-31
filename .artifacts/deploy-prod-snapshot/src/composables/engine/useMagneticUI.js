/**
 * useMagneticUI.js — Cursor trajectory prediction → magnetic button warp
 * Composable Layer: Vue 3.
 *
 * Reads predicted cursor from physics world (TrajectoryPredictor in Worker).
 * Applies 3D rotateX/Y tilt + translate pull to registered interactive elements.
 * Max warp: ±12° tilt, 8px translation.
 * Respects prefers-reduced-motion.
 */

import { onUnmounted, watch } from "vue";
import { usePhysicsWorld } from "./usePhysicsWorld.js";

const MAX_TILT_DEG = 12;
const MAX_TRANSLATE_PX = 8;
const ATTRACT_RADIUS_PX = 120;

const prefersReducedMotion =
	typeof window !== "undefined"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

// ─── Module-level: one RAF loop for all magnetic elements ─────
const _elements = new Map(); // id → { el, rect }
let _rafId = null;
let _world = null;

const startLoop = () => {
	if (_rafId) return;
	const loop = () => {
		_rafId = requestAnimationFrame(loop);
		updateMagnetics();
	};
	_rafId = requestAnimationFrame(loop);
};

const stopLoop = () => {
	if (!_elements.size && _rafId) {
		cancelAnimationFrame(_rafId);
		_rafId = null;
	}
};

const updateMagnetics = () => {
	if (!_world || prefersReducedMotion) return;
	const predicted = _world.predictedCursor.value;
	if (!predicted.x && !predicted.y) return;

	for (const [id, entry] of _elements.entries()) {
		const { el, rect } = entry;
		if (!el || !document.contains(el)) {
			_elements.delete(id);
			continue;
		}

		// Refresh rect periodically
		const now = performance.now();
		if (!entry._lastRect || now - entry._lastRect > 200) {
			entry.rect = el.getBoundingClientRect();
			entry._lastRect = now;
		}

		const r = entry.rect;
		if (!r.width || !r.height) continue;

		const cx = r.left + r.width / 2;
		const cy = r.top + r.height / 2;
		const dx = predicted.x - cx;
		const dy = predicted.y - cy;
		const dist = Math.hypot(dx, dy);

		if (dist > ATTRACT_RADIUS_PX) {
			// Reset
			el.style.transform = "";
			continue;
		}

		// Normalized distance (1 = center, 0 = at radius)
		const t = 1 - dist / ATTRACT_RADIUS_PX;
		const tSmooth = t * t; // ease-in quad

		// Translation pull (toward predicted position)
		const tx = (dx / dist) * MAX_TRANSLATE_PX * tSmooth;
		const ty = (dy / dist) * MAX_TRANSLATE_PX * tSmooth;

		// Tilt based on direction
		const rotY = (dx / ATTRACT_RADIUS_PX) * MAX_TILT_DEG * tSmooth;
		const rotX = -(dy / ATTRACT_RADIUS_PX) * MAX_TILT_DEG * tSmooth;

		el.style.transform = [
			`perspective(400px)`,
			`rotateX(${rotX.toFixed(2)}deg)`,
			`rotateY(${rotY.toFixed(2)}deg)`,
			`translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`,
		].join(" ");
		el.style.transition = "transform 60ms linear";
		el.style.willChange = "transform";
	}
};

// ─── Composable ───────────────────────────────────────────────

let _idCounter = 0;

/**
 * Make an element magnetically attracted to predicted cursor.
 * @param {import('vue').Ref<HTMLElement>} elRef
 */
export function useMagneticUI(elRef) {
	if (prefersReducedMotion) return;

	const world = usePhysicsWorld();
	_world = world;

	const id = ++_idCounter;

	const register = () => {
		const el = elRef.value;
		if (!el) return;
		_elements.set(id, { el, rect: el.getBoundingClientRect(), _lastRect: 0 });
		startLoop();
	};

	const unregister = () => {
		const entry = _elements.get(id);
		if (entry?.el) {
			entry.el.style.transform = "";
			entry.el.style.willChange = "";
		}
		_elements.delete(id);
		stopLoop();
	};

	// Register when element mounts
	if (elRef.value) {
		register();
	} else {
		const stop = watch(elRef, (el) => {
			if (el) {
				register();
				stop();
			}
		});
	}

	onUnmounted(unregister);
}

// ─── Pointer sample collector (call from pointermove handler) ─

/**
 * Feed pointer position to trajectory predictor (via physics world).
 * Call this from your top-level pointermove handler.
 */
export function feedPointerSample(x, y) {
	_world?.addPointerSample(x, y, performance.now());
}
