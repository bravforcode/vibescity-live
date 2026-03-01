/**
 * useMomentumTear.js — Inertial momentum tearing (elastic slinky overscroll)
 * Composable Layer: Vue 3.
 *
 * When feed is overscrolled past its boundary, each card gets an individual
 * spring with staggered delay. Cards stretch apart like a slinky, then snap
 * back in wave order (edge → center).
 *
 * Math (from implementation_plan.md §Phase 9):
 *   Stagger delay per card: delay_i = i × 15ms
 *   Max stretch per gap:    20px × (1 - i/totalItems)
 *   Damping increases toward center (prevents infinite wobble)
 *
 * Uses useSpring internally with SPRING_PRESETS.overscroll per card.
 */

import { computed, onUnmounted, ref, watch } from "vue";
import { SPRING_PRESETS } from "@/engine/physics/SpringSolver.js";
import { usePhysicsWorld } from "./usePhysicsWorld.js";

const STAGGER_MS = 15;
const MAX_STRETCH_PX = 20;

/**
 * @param {import('vue').Ref<number>} overscrollY — current overscroll amount (px)
 * @param {import('vue').Ref<number>} itemCount   — number of feed items
 */
export function useMomentumTear(overscrollY, itemCount) {
	const world = usePhysicsWorld();

	// Per-item spring targets (gap stretch)
	const itemGaps = ref([]); // array of gap offsets in px

	// Spring IDs for cleanup
	const springIds = [];

	// ─── Create springs ───────────────────────────────────────────
	const createSprings = (n) => {
		// Cleanup old springs
		springIds.forEach((id) => {
			world.destroySpring(id);
		});
		springIds.length = 0;

		for (let i = 0; i < n; i++) {
			const id = `tear_gap_${i}`;
			// Damping increases toward center (outer items bounce more)
			const damping = SPRING_PRESETS.overscroll.damping + (i / n) * 8;
			world.createSpring(
				id,
				{
					mass: SPRING_PRESETS.overscroll.mass,
					stiffness: SPRING_PRESETS.overscroll.stiffness,
					damping,
				},
				0,
				0,
			);
			springIds.push(id);
		}

		itemGaps.value = new Array(n).fill(0);
	};

	// ─── Watch item count ─────────────────────────────────────────
	const stopWatch = watch(
		itemCount,
		(n) => {
			if (n > 0) createSprings(n);
		},
		{ immediate: true },
	);

	// ─── Apply stretch on overscroll ─────────────────────────────
	let _prevOverscroll = 0;
	let _stretchTimeouts = [];

	const applyStretch = (os) => {
		if (!os || Math.abs(os) < 2) {
			// Release: springs return to rest
			springIds.forEach((id, i) => {
				world.setTarget(id, 0, 0);
			});
			return;
		}

		const n = springIds.length;
		// Clear pending timeouts
		_stretchTimeouts.forEach((t) => {
			clearTimeout(t);
		});
		_stretchTimeouts = [];

		springIds.forEach((id, i) => {
			const delay = i * STAGGER_MS;
			const maxStretch = MAX_STRETCH_PX * (1 - i / n);
			const stretch = Math.sign(os) * Math.min(Math.abs(os) * 0.1, maxStretch);

			const t = setTimeout(() => {
				world.setTarget(id, 0, stretch);
			}, delay);
			_stretchTimeouts.push(t);
		});
	};

	// ─── Sync gap offsets from physics world ─────────────────────
	let _rafId = null;
	const syncGaps = () => {
		_rafId = requestAnimationFrame(syncGaps);
		springIds.forEach((id, i) => {
			// Read from spring state (postMessage fallback)
			for (const [k, v] of world.springStates.entries()) {
				if (k === id) {
					if (itemGaps.value[i] !== v.y) {
						itemGaps.value[i] = v.y;
					}
					break;
				}
			}
		});
	};
	_rafId = requestAnimationFrame(syncGaps);

	// ─── Watch overscroll changes ─────────────────────────────────
	const stopOverscrollWatch = watch(overscrollY, (os) => {
		if (os !== _prevOverscroll) {
			_prevOverscroll = os;
			applyStretch(os);
		}
	});

	// ─── Cleanup ──────────────────────────────────────────────────
	onUnmounted(() => {
		stopWatch();
		stopOverscrollWatch();
		cancelAnimationFrame(_rafId);
		_stretchTimeouts.forEach((t) => {
			clearTimeout(t);
		});
		springIds.forEach((id) => {
			world.destroySpring(id);
		});
	});

	return {
		/** Array of Y-axis gap offsets per item (px) */
		itemGaps,

		/** Call when overscroll resets (bounce back) */
		release: () => {
			applyStretch(0);
		},
	};
}
