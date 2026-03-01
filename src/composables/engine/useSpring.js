/**
 * useSpring.js — Per-element spring physics hook
 * Composable Layer: Vue 3.
 *
 * Usage:
 *   const { x, y, vx, vy, applyForce, setTarget, shouldDismiss } = useSpring('drawer', SPRING_PRESETS.drawer)
 *
 * x and y are reactive (updated each RAF from physics world).
 * applyForce / setTarget → sent to Worker.
 */

import { computed, onUnmounted, ref } from "vue";
import { SPRING_PRESETS } from "@/engine/physics/SpringSolver.js";
import { usePhysicsWorld } from "./usePhysicsWorld.js";

// Re-export presets for convenience
export { SPRING_PRESETS };

let _idCounter = 0;

/**
 * @param {string} name — human-readable identifier (auto-suffixed for uniqueness)
 * @param {object} preset — from SPRING_PRESETS or custom {mass, stiffness, damping}
 * @param {{ x0?: number, y0?: number }} opts
 */
export function useSpring(name, preset = SPRING_PRESETS.card, opts = {}) {
	const world = usePhysicsWorld();
	const id = `${name}_${++_idCounter}`;

	const x0 = opts.x0 ?? 0;
	const y0 = opts.y0 ?? 0;

	// Local reactive refs (synced from world.springStates)
	const x = ref(x0);
	const y = ref(y0);
	const vx = ref(0);
	const vy = ref(0);

	// SAB path: springStates keyed by index — we need to track our index
	// For simplicity, track by ID via main-thread index mapping
	// Index is the insertion order in the solver (creation order)
	let _sabIndex = -1;

	world.createSpring(id, preset, x0, y0);

	// We watch springStates map for our entry.
	// SAB path uses sequential indices; postMessage path uses id.
	// Use a watcher approach: check on each micro-tick.
	let _rafHandle = null;

	const syncFromWorld = () => {
		// Try ID-based lookup (postMessage fallback path)
		const byId = world.springStates.get(id);
		if (byId) {
			x.value = byId.x;
			y.value = byId.y;
			vx.value = byId.vx;
			vy.value = byId.vy;
		} else if (_sabIndex >= 0) {
			// SAB path: look up by index
			const byIdx = world.springStates.get(_sabIndex);
			if (byIdx) {
				x.value = byIdx.x;
				y.value = byIdx.y;
				vx.value = byIdx.vx;
				vy.value = byIdx.vy;
			}
		} else {
			// Try to find our spring in the map by scanning for matching index
			for (const [k, v] of world.springStates.entries()) {
				if (typeof k === "number" && v.x !== undefined) {
					// Use latest index as rough approximation (no perfect ID mapping in SAB path)
					// TODO: enhance with ID-tagged SAB layout in future
					_sabIndex = k;
					x.value = v.x;
					y.value = v.y;
					vx.value = v.vx;
					vy.value = v.vy;
				}
			}
		}
		_rafHandle = requestAnimationFrame(syncFromWorld);
	};

	_rafHandle = requestAnimationFrame(syncFromWorld);

	onUnmounted(() => {
		if (_rafHandle) cancelAnimationFrame(_rafHandle);
		world.destroySpring(id);
	});

	/**
	 * Check if spring should trigger dismiss based on current velocity.
	 * @param {number} xmax — max displacement in px (dismiss zone)
	 */
	const shouldDismiss = (xmax = 120) => {
		const speed = Math.hypot(vx.value, vy.value);
		return speed > xmax * Math.sqrt(preset.stiffness / preset.mass);
	};

	/**
	 * Apply a force impulse (from gesture delta).
	 */
	const applyForce = (fx, fy = 0) => world.applyForce(id, fx, fy);

	/**
	 * Set rest target position.
	 */
	const setTarget = (tx, ty = 0) => world.setTarget(id, tx, ty);

	/**
	 * Snap instantly to position without animation.
	 */
	const snapTo = (px, py = 0) => {
		x.value = px;
		y.value = py;
		vx.value = 0;
		vy.value = 0;
		world.setTarget(id, px, py);
	};

	return {
		x,
		y,
		vx,
		vy,
		applyForce,
		setTarget,
		snapTo,
		shouldDismiss,
		/** The computed speed magnitude */
		speed: computed(() => Math.hypot(vx.value, vy.value)),
		/** True when velocity < 0.5 and displacement < 0.5 */
		isSettled: computed(() => {
			const speed = Math.hypot(vx.value, vy.value);
			const disp = Math.hypot(x.value, y.value);
			return speed < 0.5 && disp < 0.5;
		}),
	};
}
