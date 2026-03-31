/**
 * CanvasVirtualizer.js — DOM-bypass instanced canvas renderer
 * Engine Layer: Canvas 2D / OffscreenCanvas. No Vue, no DOM layout.
 *
 * Renders N badges/particles via instanced draw calls.
 * Completely bypasses Vue virtual DOM for extreme list performance.
 *
 * Use cases:
 *   - Ranking badges (leaderboard confetti)
 *   - Dense marker labels at high zoom
 *   - Particle celebration effects (favorites, coins)
 */

export class CanvasVirtualizer {
	/**
	 * @param {HTMLCanvasElement} canvas
	 * @param {{ itemWidth?: number, itemHeight?: number, font?: string }} opts
	 */
	constructor(canvas, opts = {}) {
		this._canvas = canvas;
		this._ctx = canvas.getContext("2d", { alpha: true });
		this._items = [];
		this._rafId = null;
		this._dirty = true;

		this._itemW = opts.itemWidth ?? 48;
		this._itemH = opts.itemHeight ?? 48;
		this._font = opts.font ?? "bold 12px Inter, sans-serif";

		// Offscreen canvas for single item template (stamp pattern)
		this._stamp = null;
	}

	// ─── Item Management ──────────────────────────────────────────

	/**
	 * Set all items (triggers full redraw).
	 * @param {Array<{x:number, y:number, label:string, color:string, alpha?:number}>} items
	 */
	setItems(items) {
		this._items = items;
		this._dirty = true;
	}

	/**
	 * Update a single item (partial redraw on next frame).
	 */
	updateItem(index, patch) {
		if (this._items[index]) {
			Object.assign(this._items[index], patch);
			this._dirty = true;
		}
	}

	// ─── Render Loop ──────────────────────────────────────────────

	start() {
		const loop = () => {
			this._rafId = requestAnimationFrame(loop);
			if (this._dirty) {
				this._render();
				this._dirty = false;
			}
		};
		this._rafId = requestAnimationFrame(loop);
	}

	stop() {
		if (this._rafId) {
			cancelAnimationFrame(this._rafId);
			this._rafId = null;
		}
		this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
	}

	// ─── Rendering ───────────────────────────────────────────────

	_render() {
		const ctx = this._ctx;
		const W = this._canvas.width;
		const H = this._canvas.height;

		ctx.clearRect(0, 0, W, H);

		ctx.font = this._font;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		for (let i = 0; i < this._items.length; i++) {
			this._drawItem(ctx, this._items[i], i);
		}
	}

	_drawItem(ctx, item, index) {
		const { x, y, label, color, alpha = 1.0, scale = 1.0 } = item;
		const hw = this._itemW * 0.5 * scale;
		const hh = this._itemH * 0.5 * scale;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.translate(x, y);

		// Badge background
		ctx.fillStyle = color ?? "#ff6b35";
		ctx.beginPath();
		ctx.roundRect(
			-hw,
			-hh,
			this._itemW * scale,
			this._itemH * scale,
			8 * scale,
		);
		ctx.fill();

		// Rank number
		ctx.fillStyle = "#ffffff";
		ctx.font = `bold ${Math.round(12 * scale)}px Inter, sans-serif`;
		ctx.fillText(label ?? String(index + 1), 0, 0);

		ctx.restore();
	}

	// ─── Particle system ─────────────────────────────────────────

	/**
	 * Burst confetti particles at a point.
	 * @param {number} x @param {number} y @param {number} count
	 * @param {string[]} colors
	 */
	burstParticles(
		x,
		y,
		count = 20,
		colors = ["#ff6b35", "#f7c59f", "#ebebd3", "#87bcde", "#a2d2ff"],
	) {
		const particles = [];
		for (let i = 0; i < count; i++) {
			const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
			const speed = 2 + Math.random() * 4;
			particles.push({
				x,
				y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed - 3,
				alpha: 1,
				color: colors[i % colors.length],
				size: 4 + Math.random() * 4,
			});
		}

		const ctx = this._ctx;
		let start = null;
		const animate = (ts) => {
			if (!start) start = ts;
			const dt = Math.min((ts - start) / 1000, 0.05);
			start = ts;

			for (const p of particles) {
				p.x += p.vx;
				p.y += p.vy;
				p.vy += 0.2; // gravity
				p.alpha -= 0.02;
				p.vx *= 0.98;
				p.vy *= 0.98;
			}

			ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
			this._render(); // re-render items underneath

			for (const p of particles) {
				if (p.alpha <= 0) continue;
				ctx.save();
				ctx.globalAlpha = Math.max(0, p.alpha);
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			}

			if (particles.some((p) => p.alpha > 0)) {
				requestAnimationFrame(animate);
			}
		};
		requestAnimationFrame(animate);
	}

	destroy() {
		this.stop();
		this._items = [];
	}
}
