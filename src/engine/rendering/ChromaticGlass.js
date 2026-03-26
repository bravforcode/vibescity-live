/**
 * ChromaticGlass.js — Refractive glass panel renderer
 * Engine Layer: Standalone WebGL context on overlay canvas. No Vue.
 *
 * Captures Mapbox canvas as input texture, applies 2-pass
 * Gaussian blur + chromatic aberration, renders to overlay canvas.
 * Updates at ~30fps (sufficient for background effect).
 *
 * CSS fallback: When WebGL unavailable, class applies backdrop-filter.
 */

import { caps } from "../capabilities.js";
import {
	CHROMA_BLUR_H_FRAG,
	CHROMA_BLUR_V_FRAG,
	CHROMA_VERT,
} from "./shaders/chromaticGlass.js";

export class ChromaticGlass {
	/**
	 * @param {HTMLCanvasElement} overlayCanvas — overlay canvas for glass rendering
	 * @param {HTMLCanvasElement} mapCanvas     — Mapbox GL canvas source
	 */
	constructor(overlayCanvas, mapCanvas) {
		this._overlay = overlayCanvas;
		this._mapCanvas = mapCanvas;
		this._gl = null;
		this._programs = {};
		this._textures = {};
		this._fbos = {};
		this._vaos = {};
		this._rafId = null;
		this._active = false;
		this._time = 0;

		// Panel UV bounds (updated per panel rect)
		this._panels = [];
	}

	// ─── Init ─────────────────────────────────────────────────────

	init() {
		if (!caps.webgl2) return false;

		const gl = this._overlay.getContext("webgl2", {
			alpha: true,
			premultipliedAlpha: true,
			antialias: false,
		});
		if (!gl) return false;
		this._gl = gl;

		// Compile programs
		this._programs.blurH = this._compile(gl, CHROMA_VERT, CHROMA_BLUR_H_FRAG);
		this._programs.blurV = this._compile(gl, CHROMA_VERT, CHROMA_BLUR_V_FRAG);
		if (!this._programs.blurH || !this._programs.blurV) return false;

		// Fullscreen quad with UVs
		this._vaos.quad = this._makeQuad(gl);

		// Intermediate FBO for horizontal blur pass
		this._fbos.hBlur = this._makeFBO(gl);
		this._textures.hBlur = this._fbos.hBlur.tex;

		// Texture for Mapbox canvas capture
		this._textures.map = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this._textures.map);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindTexture(gl.TEXTURE_2D, null);

		return true;
	}

	// ─── Panel registration ───────────────────────────────────────

	/**
	 * Register a glass panel.
	 * @param {string} id
	 * @param {{ x: number, y: number, w: number, h: number }} rect — CSS pixel rect
	 * @param {{ aberration?: number }} opts
	 */
	registerPanel(id, rect, opts = {}) {
		const existing = this._panels.findIndex((p) => p.id === id);
		const panel = { id, rect, aberration: opts.aberration ?? 0.006 };
		if (existing >= 0) this._panels[existing] = panel;
		else this._panels.push(panel);
	}

	unregisterPanel(id) {
		this._panels = this._panels.filter((p) => p.id !== id);
	}

	// ─── Render loop ──────────────────────────────────────────────

	start() {
		if (this._active || !this._gl) return;
		this._active = true;
		let lastFrame = 0;
		const fps = 30;
		const interval = 1000 / fps;

		const loop = (now) => {
			this._rafId = requestAnimationFrame(loop);
			if (now - lastFrame < interval) return;
			lastFrame = now;
			this._render();
		};
		this._rafId = requestAnimationFrame(loop);
	}

	stop() {
		this._active = false;
		if (this._rafId) {
			cancelAnimationFrame(this._rafId);
			this._rafId = null;
		}
		// Clear overlay
		if (this._gl) {
			const gl = this._gl;
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
	}

	destroy() {
		this.stop();
		const gl = this._gl;
		if (!gl) return;
		Object.values(this._programs).forEach((p) => {
			gl.deleteProgram(p);
		});
		Object.values(this._textures).forEach((t) => {
			gl.deleteTexture(t);
		});
		Object.values(this._fbos).forEach((f) => {
			gl.deleteFramebuffer(f.fbo);
		});
		this._gl = null;
	}

	// ─── Internal render ──────────────────────────────────────────

	_render() {
		const gl = this._gl;
		if (!gl || !this._panels.length) return;

		this._time += 0.016;

		const W = this._overlay.width;
		const H = this._overlay.height;

		// Capture Mapbox canvas → texture
		gl.bindTexture(gl.TEXTURE_2D, this._textures.map);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			this._mapCanvas,
		);
		gl.bindTexture(gl.TEXTURE_2D, null);

		// Clear overlay
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, W, H);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		// Render each glass panel
		for (const panel of this._panels) {
			this._renderPanel(gl, panel, W, H);
		}
	}

	_renderPanel(gl, panel, W, H) {
		const { rect, aberration } = panel;

		// Convert CSS rect to NDC (normalized device coordinates)
		const x1 = (rect.x / W) * 2 - 1;
		const y1 = 1 - (rect.y / H) * 2;
		const x2 = ((rect.x + rect.w) / W) * 2 - 1;
		const y2 = 1 - ((rect.y + rect.h) / H) * 2;

		// UV range for this panel
		const u1 = rect.x / W;
		const v1 = 1 - (rect.y + rect.h) / H;
		const u2 = (rect.x + rect.w) / W;
		const v2 = 1 - rect.y / H;
		const uCenter = (u1 + u2) * 0.5;
		const vCenter = (v1 + v2) * 0.5;

		// Build quad vertices for this panel (NDC + UV)
		const verts = new Float32Array([
			x1,
			y2,
			u1,
			v2,
			x2,
			y2,
			u2,
			v2,
			x1,
			y1,
			u1,
			v1,
			x1,
			y1,
			u1,
			v1,
			x2,
			y2,
			u2,
			v2,
			x2,
			y1,
			u2,
			v1,
		]);

		// Update VAO buffer
		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

		// ─ Pass 1: Horizontal blur ─
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.hBlur.fbo);
		gl.viewport(0, 0, W, H);
		gl.useProgram(this._programs.blurH);

		this._setQuadAttribs(gl, this._programs.blurH);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this._textures.map);
		gl.uniform1i(gl.getUniformLocation(this._programs.blurH, "u_texture"), 0);
		gl.uniform2f(
			gl.getUniformLocation(this._programs.blurH, "u_resolution"),
			W,
			H,
		);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		// ─ Pass 2: Vertical blur + chromatic aberration → screen ─
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, W, H);
		gl.useProgram(this._programs.blurV);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		this._setQuadAttribs(gl, this._programs.blurV);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this._textures.hBlur);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this._textures.map);
		gl.uniform1i(gl.getUniformLocation(this._programs.blurV, "u_texture"), 0);
		gl.uniform1i(gl.getUniformLocation(this._programs.blurV, "u_original"), 1);
		gl.uniform2f(
			gl.getUniformLocation(this._programs.blurV, "u_resolution"),
			W,
			H,
		);
		gl.uniform1f(
			gl.getUniformLocation(this._programs.blurV, "u_time"),
			this._time,
		);
		gl.uniform2f(
			gl.getUniformLocation(this._programs.blurV, "u_center"),
			uCenter,
			vCenter,
		);
		gl.uniform1f(
			gl.getUniformLocation(this._programs.blurV, "u_aberration"),
			aberration,
		);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		gl.disable(gl.BLEND);
		gl.deleteBuffer(buf);
	}

	// ─── WebGL Helpers ────────────────────────────────────────────

	_setQuadAttribs(gl, prog) {
		const aPos = gl.getAttribLocation(prog, "a_pos");
		const aUv = gl.getAttribLocation(prog, "a_uv");
		const stride = 4 * 4; // 4 floats * 4 bytes
		if (aPos >= 0) {
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
		}
		if (aUv >= 0) {
			gl.enableVertexAttribArray(aUv);
			gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 8);
		}
	}

	_makeQuad(gl) {
		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		// Vertex data set dynamically per panel
		gl.bindVertexArray(null);
		return vao;
	}

	_makeFBO(gl) {
		const tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
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
		return { fbo, tex };
	}

	_compile(gl, vertSrc, fragSrc) {
		const mk = (type, src) => {
			const s = gl.createShader(type);
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
				console.error("[ChromaticGlass]", gl.getShaderInfoLog(s));
				gl.deleteShader(s);
				return null;
			}
			return s;
		};
		const v = mk(gl.VERTEX_SHADER, vertSrc);
		const f = mk(gl.FRAGMENT_SHADER, fragSrc);
		if (!v || !f) return null;
		const p = gl.createProgram();
		gl.attachShader(p, v);
		gl.attachShader(p, f);
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			console.error("[ChromaticGlass] Link:", gl.getProgramInfoLog(p));
			return null;
		}
		gl.deleteShader(v);
		gl.deleteShader(f);
		return p;
	}
}
