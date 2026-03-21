/**
 * SDFClusterLayer.js — Mapbox GL custom layer for SDF pin blobs
 * Engine Layer: WebGL + Mapbox CustomLayerInterface. No Vue.
 *
 * Renders venue pins as liquid mercury blobs via SDF smooth union.
 * Pin data is uploaded as a RGBA32F 1D texture each frame.
 *
 * Progressive enhancement: only activates when WebGL2 + floatTextures available.
 * Fallback: Mapbox standard circle layers (untouched).
 */

import { caps } from "../capabilities.js";
import { SDF_CLUSTER_FRAG, SDF_CLUSTER_VERT } from "./shaders/sdfCluster.js";

const MAX_PINS = 512;

export class SDFClusterLayer {
	constructor({ onRender } = {}) {
		this.id = "sdf-cluster-layer";
		this.type = "custom";
		this.renderingMode = "2d";

		/** @type {WebGL2RenderingContext | null} */
		this._gl = null;
		this._program = null;
		this._vao = null;
		this._pinTexture = null;
		this._pinData = new Float32Array(MAX_PINS * 4); // x, y, radius, categoryId per pin

		this._pinCount = 0;
		this._smoothK = 20;
		this._startTime = performance.now();

		// External callback after each render
		this._onRender = onRender ?? null;
	}

	// ─── Mapbox Interface ────────────────────────────────────────

	onAdd(_map, gl) {
		if (!caps.webgl2 || !caps.floatTextures) return;

		this._gl = gl;
		this._program = this._compileProgram(
			gl,
			SDF_CLUSTER_VERT,
			SDF_CLUSTER_FRAG,
		);
		if (!this._program) return;

		// Fullscreen quad (2 triangles)
		const verts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

		this._vao = gl.createVertexArray();
		gl.bindVertexArray(this._vao);
		const loc = gl.getAttribLocation(this._program, "a_pos");
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);

		// Create RGBA32F 1D texture for pin data
		this._pinTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this._pinTexture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA32F,
			MAX_PINS,
			1,
			0,
			gl.RGBA,
			gl.FLOAT,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	render(gl, _matrix) {
		if (!this._program || !this._vao || this._pinCount === 0) return;

		gl.useProgram(this._program);
		gl.bindVertexArray(this._vao);

		// Enable blending for transparent blobs
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		// Upload pin data
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this._pinTexture);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			MAX_PINS,
			1,
			gl.RGBA,
			gl.FLOAT,
			this._pinData,
		);

		// Uniforms
		const u = (name) => gl.getUniformLocation(this._program, name);
		gl.uniform1i(u("u_pins"), 0);
		gl.uniform1i(u("u_pinCount"), this._pinCount);
		gl.uniform1f(u("u_smoothK"), this._smoothK);
		gl.uniform2f(
			u("u_resolution"),
			gl.drawingBufferWidth,
			gl.drawingBufferHeight,
		);
		gl.uniform1f(u("u_time"), (performance.now() - this._startTime) / 1000.0);

		gl.drawArrays(gl.TRIANGLES, 0, 6);

		gl.bindVertexArray(null);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.disable(gl.BLEND);

		this._onRender?.();
	}

	onRemove(_map, gl) {
		if (!this._gl) return;
		gl.deleteProgram(this._program);
		gl.deleteTexture(this._pinTexture);
		this._vao && gl.deleteVertexArray(this._vao);
		this._gl = null;
	}

	// ─── Data Updates ────────────────────────────────────────────

	/**
	 * Update pin positions from venue data.
	 * @param {Array<{screenX: number, screenY: number, radius: number, categoryId: number}>} pins
	 * @param {number} smoothK — SDF blend factor (0=hard, 40=ferrofluid)
	 */
	updatePins(pins, smoothK) {
		this._pinCount = Math.min(pins.length, MAX_PINS);
		this._smoothK = smoothK ?? this._smoothK;

		for (let i = 0; i < this._pinCount; i++) {
			const p = pins[i];
			const base = i * 4;
			this._pinData[base] = p.screenX;
			this._pinData[base + 1] = p.screenY;
			this._pinData[base + 2] = p.radius ?? 18;
			this._pinData[base + 3] = p.categoryId ?? 9;
		}
	}

	// ─── Shader Compilation ──────────────────────────────────────

	_compileProgram(gl, vertSrc, fragSrc) {
		const vert = this._compileShader(gl, gl.VERTEX_SHADER, vertSrc);
		const frag = this._compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
		if (!vert || !frag) return null;

		const prog = gl.createProgram();
		gl.attachShader(prog, vert);
		gl.attachShader(prog, frag);
		gl.linkProgram(prog);

		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error(
				"[SDFClusterLayer] Link error:",
				gl.getProgramInfoLog(prog),
			);
			return null;
		}

		gl.deleteShader(vert);
		gl.deleteShader(frag);
		return prog;
	}

	_compileShader(gl, type, src) {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, src);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error(
				`[SDFClusterLayer] Shader compile error (${type === gl.VERTEX_SHADER ? "vert" : "frag"}):`,
				gl.getShaderInfoLog(shader),
			);
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}
}
