/**
 * physics.worker.js — Off-main-thread physics engine
 * Engine Layer: Web Worker, no DOM, no Vue.
 *
 * Runs at 120Hz fixed timestep.
 * Communicates via SharedArrayBuffer (SAB) when available,
 * fallback via postMessage for position data.
 *
 * SharedArrayBuffer layout (bytes):
 *   [0]      springCount      (Uint32)
 *   [4..16K] spring data      (Float32: x,y,vx,vy per spring, 16 bytes each)
 *   [16K]    pinCount         (Uint32)
 *   [16K+4]  pin positions    (Float32: x,y,radius per pin, 12 bytes each)
 *   [32K]    predicted_x      (Float32)
 *   [32K+4]  predicted_y      (Float32)
 */

import { SpringSolver } from "../physics/SpringSolver.js";
import { TrajectoryPredictor } from "../physics/TrajectoryPredictor.js";

// ─── Constants ────────────────────────────────────────────────
const TICK_HZ = 120;
const TICK_MS = 1000 / TICK_HZ;
const MAX_SPRINGS = 256;
const SPRING_STRIDE = 4; // floats per spring: x, y, vx, vy
const SAB_SPRING_OFFSET = 4; // bytes (after springCount u32)
const SAB_PIN_OFFSET = 16 * 1024;
const SAB_PRED_OFFSET = 32 * 1024;

// ─── State ────────────────────────────────────────────────────
let sab = null;
let f32 = null;
let u32 = null;
let usingSAB = false;

const solver = new SpringSolver(MAX_SPRINGS);
const predictor = new TrajectoryPredictor();

// Force queue from main thread (pointer events)
const forceQueue = [];
// Target queue from main thread (spring setTarget calls)
const targetQueue = [];
// Pointer samples for trajectory
const pointerQueue = [];

// ─── SAB Helpers ──────────────────────────────────────────────
const writeSpringToSAB = (id, x, y, vx, vy) => {
	if (!usingSAB) return;
	const base = SAB_SPRING_OFFSET / 4 + id * SPRING_STRIDE;
	f32[base] = x;
	f32[base + 1] = y;
	f32[base + 2] = vx;
	f32[base + 3] = vy;
};

const writePrediction = (px, py) => {
	if (!usingSAB) return;
	const base = SAB_PRED_OFFSET / 4;
	f32[base] = px;
	f32[base + 1] = py;
};

const writeSpringCount = (n) => {
	if (!usingSAB) return;
	u32[0] = n;
};

// ─── Main tick ────────────────────────────────────────────────
let lastTick = 0;
const tick = () => {
	const now = performance.now();
	const dt = Math.min((now - lastTick) / 1000, 0.05); // cap at 50ms
	lastTick = now;

	// Apply pending forces
	while (forceQueue.length) {
		const { id, fx, fy } = forceQueue.shift();
		solver.applyForce(id, fx, fy);
	}

	// Apply pending target changes
	while (targetQueue.length) {
		const { id, tx, ty } = targetQueue.shift();
		solver.setTarget(id, tx, ty);
	}

	// Step all springs
	solver.step(dt);

	// Write to SAB
	const count = solver.count;
	writeSpringCount(count);
	for (let i = 0; i < count; i++) {
		const s = solver.getState(i);
		writeSpringToSAB(i, s.x, s.y, s.vx, s.vy);
	}

	// Feed pointer samples to predictor
	while (pointerQueue.length) {
		const { x, y, t } = pointerQueue.shift();
		predictor.addSample(x, y, t);
	}

	// Predict and write
	const pred = predictor.predict(80); // 80ms ahead
	if (pred) {
		writePrediction(pred.x, pred.y);
		if (!usingSAB) {
			// Fallback: postMessage prediction
			self.postMessage({ type: "prediction", x: pred.x, y: pred.y });
		}
	}

	// Fallback: postMessage spring positions
	if (!usingSAB) {
		const positions = [];
		for (let i = 0; i < count; i++) {
			positions.push(solver.getState(i));
		}
		self.postMessage({ type: "springPositions", positions });
	}
};

// ─── Message handler ─────────────────────────────────────────
self.onmessage = (e) => {
	const { type, payload } = e.data;

	switch (type) {
		case "init": {
			// Receive SAB from main thread
			if (payload.sab) {
				sab = payload.sab;
				f32 = new Float32Array(sab);
				u32 = new Uint32Array(sab);
				usingSAB = true;
			}
			// Start fixed-timestep loop
			lastTick = performance.now();
			setInterval(tick, TICK_MS);
			self.postMessage({ type: "ready" });
			break;
		}

		case "createSpring": {
			const { id, mass, stiffness, damping, x, y } = payload;
			solver.create(id, mass, stiffness, damping, x ?? 0, y ?? 0);
			break;
		}

		case "destroySpring": {
			solver.destroy(payload.id);
			break;
		}

		case "applyForce": {
			forceQueue.push(payload);
			break;
		}

		case "setTarget": {
			targetQueue.push(payload);
			break;
		}

		case "pointerSample": {
			pointerQueue.push(payload);
			break;
		}

		case "updatePin": {
			// Update pin position in SAB for SDF clustering
			if (!usingSAB) break;
			const { index, x, y, radius } = payload;
			const base = (SAB_PIN_OFFSET + 4) / 4 + index * 3;
			f32[base] = x;
			f32[base + 1] = y;
			f32[base + 2] = radius;
			u32[SAB_PIN_OFFSET / 4] = payload.total ?? index + 1;
			break;
		}
	}
};
