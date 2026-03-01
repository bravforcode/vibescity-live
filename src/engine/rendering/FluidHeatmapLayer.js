/**
 * FluidHeatmapLayer.js — Mapbox GL custom layer: Navier-Stokes fluid heatmap
 * Engine Layer: WebGL2 + ping-pong FBOs. No Vue.
 *
 * Implements Stam's Stable Fluids (1999):
 *   1. Advect velocity
 *   2. Diffuse velocity (Jacobi, 20 iterations)
 *   3. Compute divergence
 *   4. Solve pressure (Jacobi, 40 iterations)
 *   5. Project (subtract pressure gradient)
 *   6. Advect density
 *   7. Splat density from visitorCount sources
 *   8. Render density colormap as overlay
 *
 * Resolution: 256×256 (quarter screen), bilinear upscale.
 * Adaptive: drops to 128×128 if frame budget exceeded.
 */

import { caps } from "../capabilities.js";
import {
	FLUID_ADVECT_FRAG,
	FLUID_DIFFUSE_FRAG,
	FLUID_DIVERGENCE_FRAG,
	FLUID_PRESSURE_FRAG,
	FLUID_PROJECT_FRAG,
	FLUID_RENDER_FRAG,
	FLUID_SPLAT_FRAG,
	FLUID_VERT,
} from "./shaders/fluid.js";

const SIM_RES = 256;
const DIFFUSE_ITERATIONS = 20;
const PRESSURE_ITERATIONS = 40;
const DT = 1 / 60;
const VISCOSITY = 0.0001;
const DISSIPATION = 0.985;

export class FluidHeatmapLayer {
	constructor() {
		this.id = "fluid-heatmap-layer";
		this.type = "custom";
		this.renderingMode = "2d";

		this._gl = null;
		this._programs = {};
		this._buffers = {};
		this._vao = null;
		this._res = SIM_RES;

		// Ping-pong FBO pairs
		this._velocity = null; // { read, write }
		this._pressure = null;
		this._density = null;
		this._divergence = null;

		// Splat queue (density + velocity injections)
		this._splats = [];

		// Map pan velocity tracking
		this._prevCenter = null;
		this._mapVelocity = { x: 0, y: 0 };

		// Performance: skip frame if budget exceeded
		this._frameTimeMs = 0;
	}

	// ─── Mapbox Interface ────────────────────────────────────────

	onAdd(map, gl) {
		if (!caps.webgl2 || !caps.floatTextures) return;
		this._gl = gl;
		this._map = map;

		// Compile all programs
		const progs = [
			["advect", FLUID_VERT, FLUID_ADVECT_FRAG],
			["diffuse", FLUID_VERT, FLUID_DIFFUSE_FRAG],
			["pressure", FLUID_VERT, FLUID_PRESSURE_FRAG],
			["divergence", FLUID_VERT, FLUID_DIVERGENCE_FRAG],
			["project", FLUID_VERT, FLUID_PROJECT_FRAG],
			["render", FLUID_VERT, FLUID_RENDER_FRAG],
			["splat", FLUID_VERT, FLUID_SPLAT_FRAG],
		];

		for (const [name, vert, frag] of progs) {
			const prog = this._compile(gl, vert, frag);
			if (!prog) {
				this._gl = null;
				return;
			}
			this._programs[name] = prog;
		}

		// Fullscreen quad
		this._vao = this._makeQuad(gl);

		// Create FBO pairs
		this._velocity = this._makePingPong(gl, gl.RG16F, gl.RG, gl.HALF_FLOAT);
		this._pressure = this._makePingPong(gl, gl.R16F, gl.RED, gl.HALF_FLOAT);
		this._density = this._makePingPong(gl, gl.R16F, gl.RED, gl.HALF_FLOAT);
		this._divergence = this._makeSingle(gl, gl.R16F, gl.RED, gl.HALF_FLOAT);
	}

	render(gl, matrix) {
		if (!this._gl || !this._vao) return;

		const t0 = performance.now();

		// Inject map pan velocity into fluid
		this._injectMapVelocity();

		// Process splat queue
		while (this._splats.length) {
			const s = this._splats.shift();
			this._applySplat(gl, s);
		}

		// Fluid simulation steps
		this._advect(gl, this._velocity, DT, 1.0); // advect velocity
		this._diffuse(gl, this._velocity, VISCOSITY, DT); // diffuse velocity
		this._computeDivergence(gl); // divergence
		this._solvePressure(gl); // pressure
		this._project(gl); // project
		this._advect(gl, this._density, DT, DISSIPATION); // advect density

		// Render to screen
		this._renderDensity(gl);

		this._frameTimeMs = performance.now() - t0;

		// Adaptive resolution
		if (this._frameTimeMs > 8 && this._res > 64) {
			this._res = Math.max(64, this._res / 2);
		}
	}

	onRemove(map, gl) {
		if (!this._gl) return;
		Object.values(this._programs).forEach((p) => {
			gl.deleteProgram(p);
		});
		// FBOs cleanup
		const cleanup = (pair) => {
			if (!pair) return;
			[pair.read, pair.write].forEach((fbo) => {
				gl.deleteFramebuffer(fbo.fbo);
				gl.deleteTexture(fbo.tex);
			});
		};
		cleanup(this._velocity);
		cleanup(this._pressure);
		cleanup(this._density);
		this._divergence &&
			gl.deleteFramebuffer(this._divergence.fbo) &&
			gl.deleteTexture(this._divergence.tex);
		this._gl = null;
	}

	// ─── Public API ───────────────────────────────────────────────

	/**
	 * Inject density at a point (venue visitorCount → Gaussian splat).
	 * @param {number} u — 0..1 UV x
	 * @param {number} v — 0..1 UV y
	 * @param {number} density — 0..1
	 * @param {number} radius — UV units (0.01..0.1)
	 */
	addDensitySplat(u, v, density, radius = 0.03) {
		this._splats.push({ u, v, vx: 0, vy: 0, density, radius });
	}

	/**
	 * Inject velocity (from user interaction).
	 */
	addVelocitySplat(u, v, vx, vy, radius = 0.05) {
		this._splats.push({ u, v, vx, vy, density: 0, radius });
	}

	setMapVelocity(vx, vy) {
		this._mapVelocity = { x: vx, y: vy };
	}

	// ─── Simulation Steps ─────────────────────────────────────────

	_advect(gl, field, dt, dissipation) {
		this._runProgram(gl, "advect", field.write.fbo, {
			u_velocity: { tex: this._velocity.read.tex, unit: 0 },
			u_quantity: { tex: field.read.tex, unit: 1 },
			u_resolution: [this._res, this._res],
			u_dt: dt,
			u_dissipation: dissipation,
		});
		this._swap(field);
	}

	_diffuse(gl, field, viscosity, dt) {
		if (viscosity <= 0) return;
		const alpha = dt * viscosity * this._res * this._res;
		const rBeta = 1.0 / (1.0 + 4.0 * alpha);
		for (let i = 0; i < DIFFUSE_ITERATIONS; i++) {
			this._runProgram(gl, "diffuse", field.write.fbo, {
				u_x: { tex: field.read.tex, unit: 0 },
				u_b: { tex: field.read.tex, unit: 1 },
				u_resolution: [this._res, this._res],
				u_alpha: alpha,
				u_rBeta: rBeta,
			});
			this._swap(field);
		}
	}

	_computeDivergence(gl) {
		this._runProgram(gl, "divergence", this._divergence.fbo, {
			u_velocity: { tex: this._velocity.read.tex, unit: 0 },
			u_resolution: [this._res, this._res],
		});
	}

	_solvePressure(gl) {
		// Clear pressure
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._pressure.read.fbo);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);

		for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
			this._runProgram(gl, "pressure", this._pressure.write.fbo, {
				u_pressure: { tex: this._pressure.read.tex, unit: 0 },
				u_divergence: { tex: this._divergence.tex, unit: 1 },
				u_resolution: [this._res, this._res],
			});
			this._swap(this._pressure);
		}
	}

	_project(gl) {
		this._runProgram(gl, "project", this._velocity.write.fbo, {
			u_velocity: { tex: this._velocity.read.tex, unit: 0 },
			u_pressure: { tex: this._pressure.read.tex, unit: 1 },
			u_resolution: [this._res, this._res],
		});
		this._swap(this._velocity);
	}

	_renderDensity(gl) {
		// Render to screen (null framebuffer)
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

		const prog = this._programs["render"];
		gl.useProgram(prog);
		gl.bindVertexArray(this._vao);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this._density.read.tex);
		gl.uniform1i(gl.getUniformLocation(prog, "u_density"), 0);
		gl.uniform1f(gl.getUniformLocation(prog, "u_opacity"), 0.75);

		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
		gl.disable(gl.BLEND);
	}

	_applySplat(gl, s) {
		// Velocity splat
		if (s.vx !== 0 || s.vy !== 0) {
			this._runProgram(gl, "splat", this._velocity.write.fbo, {
				u_target: { tex: this._velocity.read.tex, unit: 0 },
				u_point: [s.u, s.v],
				u_radius: s.radius,
				u_color: [s.vx, s.vy, 0, 0],
			});
			this._swap(this._velocity);
		}
		// Density splat
		if (s.density > 0) {
			this._runProgram(gl, "splat", this._density.write.fbo, {
				u_target: { tex: this._density.read.tex, unit: 0 },
				u_point: [s.u, s.v],
				u_radius: s.radius,
				u_color: [0, 0, 0, s.density],
			});
			this._swap(this._density);
		}
	}

	_injectMapVelocity() {
		if (!this._map || (this._mapVelocity.x === 0 && this._mapVelocity.y === 0))
			return;
		this._splats.push({
			u: 0.5,
			v: 0.5,
			vx: this._mapVelocity.x * 0.001,
			vy: this._mapVelocity.y * 0.001,
			density: 0,
			radius: 0.3,
		});
		// Decay
		this._mapVelocity.x *= 0.85;
		this._mapVelocity.y *= 0.85;
	}

	// ─── WebGL Helpers ────────────────────────────────────────────

	_runProgram(gl, name, fbo, uniforms) {
		const prog = this._programs[name];
		gl.useProgram(prog);
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.viewport(0, 0, this._res, this._res);
		gl.bindVertexArray(this._vao);

		const unit = 0;
		for (const [key, val] of Object.entries(uniforms)) {
			const loc = gl.getUniformLocation(prog, key);
			if (val && typeof val === "object" && "tex" in val) {
				gl.activeTexture(gl.TEXTURE0 + val.unit);
				gl.bindTexture(gl.TEXTURE_2D, val.tex);
				gl.uniform1i(loc, val.unit);
			} else if (Array.isArray(val)) {
				if (val.length === 2) gl.uniform2f(loc, val[0], val[1]);
				else if (val.length === 4)
					gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
			} else if (typeof val === "number") {
				gl.uniform1f(loc, val);
			}
		}

		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
	}

	_makeQuad(gl) {
		const verts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		// Shared across programs — find a_pos location from first program
		const loc = 0; // all shaders use attribute location 0
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
		return vao;
	}

	_makePingPong(gl, internalFormat, format, type) {
		return {
			read: this._makeFBO(gl, internalFormat, format, type),
			write: this._makeFBO(gl, internalFormat, format, type),
		};
	}

	_makeSingle(gl, internalFormat, format, type) {
		return this._makeFBO(gl, internalFormat, format, type);
	}

	_makeFBO(gl, internalFormat, format, type) {
		const tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			internalFormat,
			this._res,
			this._res,
			0,
			format,
			type,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindTexture(gl.TEXTURE_2D, null);

		const fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			tex,
			0,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return { tex, fbo };
	}

	_swap(field) {
		[field.read, field.write] = [field.write, field.read];
	}

	_compile(gl, vertSrc, fragSrc) {
		const compile = (type, src) => {
			const s = gl.createShader(type);
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
				console.error("[FluidHeatmapLayer]", gl.getShaderInfoLog(s));
				gl.deleteShader(s);
				return null;
			}
			return s;
		};
		const v = compile(gl.VERTEX_SHADER, vertSrc);
		const f = compile(gl.FRAGMENT_SHADER, fragSrc);
		if (!v || !f) return null;
		const p = gl.createProgram();
		gl.attachShader(p, v);
		gl.attachShader(p, f);
		gl.bindAttribLocation(p, 0, "a_pos");
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			console.error("[FluidHeatmapLayer] Link:", gl.getProgramInfoLog(p));
			return null;
		}
		gl.deleteShader(v);
		gl.deleteShader(f);
		return p;
	}
}
