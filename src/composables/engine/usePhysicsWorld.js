/**
 * usePhysicsWorld.js — Vue bridge for the physics Worker
 * Composable Layer: Vue 3, singleton pattern.
 *
 * Responsibilities:
 *   - Instantiate physics.worker.js once
 *   - Allocate SharedArrayBuffer (if crossOriginIsolated)
 *   - Read spring positions from SAB on each RAF tick
 *   - Expose createSpring / destroySpring / applyForce / setTarget
 *   - Expose reactive predicted cursor position
 *
 * Fallback: when SAB unavailable, receives positions via postMessage.
 */

import { onScopeDispose, ref, shallowReactive } from "vue";
import { caps } from "@/engine/capabilities.js";

// ─── SAB Layout (mirrors physics.worker.js) ──────────────────
const SAB_SIZE = 64 * 1024; // 64 KB total
const SAB_SPRING_OFFSET = 4; // bytes
const SAB_SPRING_STRIDE = 4; // floats per spring (x,y,vx,vy)
const SAB_PRED_OFFSET = 32 * 1024; // bytes

// ─── Module-level singleton ───────────────────────────────────
let _worker = null;
let _sab = null;
let _f32 = null;
let _u32 = null;
let _rafId = null;
let _refCount = 0;
let _ready = false;

// Reactive spring position cache (id → {x, y, vx, vy})
const springStates = shallowReactive(new Map());

// Reactive predicted cursor
const predictedCursor = ref({ x: 0, y: 0 });

// Callbacks waiting for worker ready
const onReadyCallbacks = [];

// ─── Init ─────────────────────────────────────────────────────
const initWorker = () => {
	if (_worker) return;

	_worker = new Worker(
		new URL("../../engine/workers/physics.worker.js", import.meta.url),
		{ type: "module" },
	);

	const payload = {};

	if (caps.sharedArrayBuffer) {
		_sab = new SharedArrayBuffer(SAB_SIZE);
		_f32 = new Float32Array(_sab);
		_u32 = new Uint32Array(_sab);
		payload.sab = _sab;
	}

	_worker.postMessage({ type: "init", payload });

	_worker.onmessage = (e) => {
		const { type, payload: p } = e.data;

		if (type === "ready") {
			_ready = true;
			onReadyCallbacks.forEach((cb) => {
				cb();
			});
			onReadyCallbacks.length = 0;
			startReadLoop();
		}

		// Fallback (no SAB): receive positions via postMessage
		if (type === "springPositions" && !caps.sharedArrayBuffer) {
			p.positions?.forEach((s) => {
				if (s) springStates.set(s.id, s);
			});
		}

		if (type === "prediction" && !caps.sharedArrayBuffer) {
			predictedCursor.value = { x: p.x, y: p.y };
		}
	};
};

// ─── RAF Read Loop (SAB path) ─────────────────────────────────
const startReadLoop = () => {
	if (_rafId || !caps.sharedArrayBuffer) return;

	const loop = () => {
		_rafId = requestAnimationFrame(loop);

		const count = _u32[0];
		const base = SAB_SPRING_OFFSET / 4;

		for (let i = 0; i < count; i++) {
			const offset = base + i * SAB_SPRING_STRIDE;
			const x = _f32[offset];
			const y = _f32[offset + 1];
			const vx = _f32[offset + 2];
			const vy = _f32[offset + 3];
			// We need to look up id by index — worker maintains insertion order
			// Use index as key for SAB path
			const existing = springStates.get(i);
			if (!existing || existing.x !== x || existing.y !== y) {
				springStates.set(i, { x, y, vx, vy, index: i });
			}
		}

		// Read predicted cursor
		const predBase = SAB_PRED_OFFSET / 4;
		const px = _f32[predBase];
		const py = _f32[predBase + 1];
		if (px !== predictedCursor.value.x || py !== predictedCursor.value.y) {
			predictedCursor.value = { x: px, y: py };
		}
	};

	loop();
};

// ─── Public API ───────────────────────────────────────────────
const whenReady = (cb) => {
	if (_ready) cb();
	else onReadyCallbacks.push(cb);
};

const send = (type, payload) => {
	whenReady(() => _worker?.postMessage({ type, payload }));
};

// ─── Composable ───────────────────────────────────────────────
export function usePhysicsWorld() {
	_refCount++;
	initWorker();

	onScopeDispose(() => {
		_refCount--;
		if (_refCount <= 0) {
			if (_rafId) {
				cancelAnimationFrame(_rafId);
				_rafId = null;
			}
			_worker?.terminate();
			_worker = null;
			_ready = false;
			springStates.clear();
			_refCount = 0;
		}
	});

	return {
		/** Reactive spring state map (id/index → {x,y,vx,vy}) */
		springStates,

		/** Reactive predicted cursor {x, y} */
		predictedCursor,

		/** @param {string|number} id @param {object} preset @param {number} x0 @param {number} y0 */
		createSpring(id, preset, x0 = 0, y0 = 0) {
			send("createSpring", {
				id,
				mass: preset.mass,
				stiffness: preset.stiffness,
				damping: preset.damping,
				x: x0,
				y: y0,
			});
		},

		/** @param {string|number} id */
		destroySpring(id) {
			send("destroySpring", { id });
		},

		/** Apply gesture force */
		applyForce(id, fx, fy) {
			send("applyForce", { id, fx, fy });
		},

		/** Move rest position (target) */
		setTarget(id, tx, ty) {
			send("setTarget", { id, tx, ty });
		},

		/** Add pointer sample for trajectory prediction */
		addPointerSample(x, y, t) {
			send("pointerSample", { x, y, t: t ?? performance.now() });
		},

		/** Update a cluster pin position (for SDF) */
		updatePin(index, x, y, radius, total) {
			send("updatePin", { index, x, y, radius, total });
		},
	};
}
