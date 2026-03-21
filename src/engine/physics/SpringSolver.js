/**
 * SpringSolver.js — Damped Harmonic Oscillator
 * Engine Layer: Pure JS, no DOM, no Vue.
 *
 * Integration: Symplectic (Semi-implicit) Euler
 *   v(t+dt) = v(t) + dt * (-k*x - c*v + F_ext) / m
 *   x(t+dt) = x(t) + dt * v(t+dt)
 *
 * Energy-stable at variable timesteps. 4x cheaper than RK4.
 * Suitable for 256 concurrent springs at 120Hz.
 *
 * Spring Presets (from implementation_plan.md §1.1):
 *
 *   Name        m      k     c    Character
 *   tooltip    0.3    400   18    Snappy, light
 *   card       1.0    200   22    Responsive
 *   drawer     3.0    120   30    Heavy, deliberate
 *   modal      5.0     80   35    Massive, cinematic
 *   overscroll 0.5    350   15    Elastic, bouncy
 */

export const SPRING_PRESETS = Object.freeze({
	tooltip: { mass: 0.3, stiffness: 400, damping: 18 },
	card: { mass: 1.0, stiffness: 200, damping: 22 },
	drawer: { mass: 3.0, stiffness: 120, damping: 30 },
	modal: { mass: 5.0, stiffness: 80, damping: 35 },
	overscroll: { mass: 0.5, stiffness: 350, damping: 15 },
});

/**
 * Single spring state (2D position).
 */
class Spring {
	constructor(id, mass, stiffness, damping, x0, y0) {
		this.id = id;
		this.m = mass;
		this.k = stiffness;
		this.c = damping;

		this.x = x0;
		this.y = y0;
		this.vx = 0;
		this.vy = 0;

		// Rest position (target)
		this.tx = x0;
		this.ty = y0;

		// External accumulated force (reset each tick)
		this.fx = 0;
		this.fy = 0;

		this.active = true;
	}

	step(dt) {
		if (!this.active) return;

		// Displacement from target
		const dx = this.x - this.tx;
		const dy = this.y - this.ty;

		// Symplectic Euler
		const ax = (-this.k * dx - this.c * this.vx + this.fx) / this.m;
		const ay = (-this.k * dy - this.c * this.vy + this.fy) / this.m;

		this.vx += dt * ax;
		this.vy += dt * ay;
		this.x += dt * this.vx;
		this.y += dt * this.vy;

		// Reset external force
		this.fx = 0;
		this.fy = 0;
	}

	/**
	 * Returns true when spring has settled (kinetic + potential energy < epsilon).
	 */
	isAtRest(epsilon = 0.01) {
		const ke = 0.5 * this.m * (this.vx * this.vx + this.vy * this.vy);
		const dx = this.x - this.tx;
		const dy = this.y - this.ty;
		const pe = 0.5 * this.k * (dx * dx + dy * dy);
		return ke + pe < epsilon;
	}

	/**
	 * Dismiss threshold: kinetic energy > spring potential at max displacement.
	 * Used for swipe-to-dismiss.
	 *   |v| > xmax * sqrt(k/m)
	 * @param {number} xmax — max displacement threshold in px
	 */
	exceedsDismissThreshold(xmax) {
		const speed = Math.hypot(this.vx, this.vy);
		return speed > xmax * Math.sqrt(this.k / this.m);
	}
}

export class SpringSolver {
	constructor(maxSprings = 256) {
		this.maxSprings = maxSprings;
		this._springs = new Map(); // id → Spring
		this._list = []; // ordered for SAB writes
		this.count = 0;
	}

	/**
	 * Create a spring.
	 * @param {string|number} id
	 * @param {number} mass
	 * @param {number} stiffness
	 * @param {number} damping
	 * @param {number} x0   — initial x position
	 * @param {number} y0   — initial y position
	 */
	create(id, mass, stiffness, damping, x0 = 0, y0 = 0) {
		const spring = new Spring(id, mass, stiffness, damping, x0, y0);
		this._springs.set(id, spring);
		this._list = [...this._springs.values()];
		this.count = this._list.length;
		return spring;
	}

	/**
	 * Remove a spring.
	 */
	destroy(id) {
		this._springs.delete(id);
		this._list = [...this._springs.values()];
		this.count = this._list.length;
	}

	/**
	 * Apply external force (e.g., from touch gesture delta).
	 */
	applyForce(id, fx, fy) {
		const s = this._springs.get(id);
		if (s) {
			s.fx += fx;
			s.fy += fy;
		}
	}

	/**
	 * Move spring target (rest position).
	 */
	setTarget(id, tx, ty) {
		const s = this._springs.get(id);
		if (s) {
			s.tx = tx;
			s.ty = ty;
		}
	}

	/**
	 * Teleport spring position (no animation, instant).
	 */
	setPosition(id, x, y) {
		const s = this._springs.get(id);
		if (s) {
			s.x = x;
			s.y = y;
			s.vx = 0;
			s.vy = 0;
		}
	}

	/**
	 * Step all springs by dt seconds.
	 */
	step(dt) {
		for (let i = 0; i < this._list.length; i++) {
			this._list[i].step(dt);
		}
	}

	/**
	 * Get spring state by index (for SAB write).
	 */
	getState(index) {
		const s = this._list[index];
		if (!s) return null;
		return { id: s.id, x: s.x, y: s.y, vx: s.vx, vy: s.vy };
	}

	/**
	 * Get spring by ID (main thread read).
	 */
	get(id) {
		return this._springs.get(id);
	}

	/**
	 * Check dismiss threshold for a spring.
	 */
	shouldDismiss(id, xmax) {
		const s = this._springs.get(id);
		return s ? s.exceedsDismissThreshold(xmax) : false;
	}

	/**
	 * Check if all springs are at rest.
	 */
	isQuiet() {
		return this._list.every((s) => s.isAtRest());
	}
}
