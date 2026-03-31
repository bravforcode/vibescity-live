/**
 * useChromaticGlass.js — Vue bridge for ChromaticGlass renderer
 * Composable Layer: Vue 3.
 *
 * Module-level singleton: one ChromaticGlass instance shared across all modals.
 * Each modal registers/unregisters its panel rect.
 *
 * CSS fallback when WebGL unavailable:
 *   backdrop-filter: blur(20px) saturate(1.4)
 *   background: rgba(15,15,20,0.75)
 */

import { onMounted, onUnmounted } from "vue";
import { caps } from "@/engine/capabilities.js";
import { ChromaticGlass } from "@/engine/rendering/ChromaticGlass.js";

// ─── Module-level singleton ───────────────────────────────────
let _glass = null;
let _overlayCanvas = null;
let _refCount = 0;

const initSingleton = (mapCanvas) => {
	if (_glass) return;
	if (!caps.webgl2) return;

	// Create overlay canvas (fullscreen, pointer-events: none)
	_overlayCanvas = document.createElement("canvas");
	_overlayCanvas.style.cssText = [
		"position:fixed",
		"inset:0",
		"width:100%",
		"height:100%",
		"pointer-events:none",
		"z-index:49",
	].join(";");
	_overlayCanvas.width = window.innerWidth;
	_overlayCanvas.height = window.innerHeight;
	document.body.appendChild(_overlayCanvas);

	// Resize observer
	const ro = new ResizeObserver(() => {
		_overlayCanvas.width = window.innerWidth;
		_overlayCanvas.height = window.innerHeight;
	});
	ro.observe(document.body);

	_glass = new ChromaticGlass(_overlayCanvas, mapCanvas);
	if (!_glass.init()) {
		_glass = null;
		_overlayCanvas.remove();
		_overlayCanvas = null;
		return;
	}

	_glass.start();
};

// ─── Composable ───────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.panelId        — unique panel identifier
 * @param {import('vue').Ref<HTMLElement>} opts.panelRef — Vue ref to panel element
 * @param {HTMLCanvasElement} [opts.mapCanvas]  — Mapbox canvas (for init)
 * @param {number} [opts.aberration]   — 0..0.01 (default 0.006)
 */
export function useChromaticGlass({
	panelId,
	panelRef,
	mapCanvas,
	aberration,
}) {
	const enabled = caps.webgl2;

	onMounted(() => {
		if (!enabled) return;

		// Init singleton once we have a mapCanvas reference
		const canvas =
			mapCanvas ?? document.querySelector("canvas.maplibregl-canvas");
		if (canvas) initSingleton(canvas);
		if (!_glass) return;

		_refCount++;

		// Register panel with current rect
		const updateRect = () => {
			const el = panelRef?.value;
			if (!el) return;
			const r = el.getBoundingClientRect();
			_glass.registerPanel(
				panelId,
				{
					x: r.left,
					y: r.top,
					w: r.width,
					h: r.height,
				},
				{ aberration: aberration ?? 0.006 },
			);
		};

		// Initial registration
		updateRect();

		// Track panel size/position changes
		const ro = new ResizeObserver(updateRect);
		if (panelRef?.value) ro.observe(panelRef.value);

		onUnmounted(() => {
			ro.disconnect();
			_glass?.unregisterPanel(panelId);
			_refCount--;
		});
	});

	return {
		/** True when WebGL refractive glass is active */
		enabled,

		/** CSS fallback class (applied when !enabled) */
		fallbackClass: enabled ? "" : "glass-css-fallback",
	};
}
