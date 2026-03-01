/**
 * useCanvasVirtualizer.js — Vue bridge for CanvasVirtualizer
 * Composable Layer: Vue 3.
 *
 * Positions an overlay canvas above the target container.
 * Provides reactive setItems API.
 */

import { onMounted, onUnmounted, ref, watch } from "vue";
import { CanvasVirtualizer } from "@/engine/rendering/CanvasVirtualizer.js";

/**
 * @param {import('vue').Ref<HTMLElement>} containerRef
 * @param {object} opts
 */
export function useCanvasVirtualizer(containerRef, opts = {}) {
	const canvas = ref(null);
	let _viz = null;
	let _canvas = null;

	onMounted(() => {
		const container = containerRef.value;
		if (!container) return;

		_canvas = document.createElement("canvas");
		_canvas.style.cssText = [
			"position:absolute",
			"inset:0",
			"pointer-events:none",
			"z-index:10",
		].join(";");

		const rect = container.getBoundingClientRect();
		_canvas.width = rect.width;
		_canvas.height = rect.height;

		container.style.position = "relative";
		container.appendChild(_canvas);
		canvas.value = _canvas;

		_viz = new CanvasVirtualizer(_canvas, opts);
		_viz.start();

		// Resize observer
		const ro = new ResizeObserver((entries) => {
			const e = entries[0];
			_canvas.width = e.contentRect.width;
			_canvas.height = e.contentRect.height;
			_viz?._dirty && _viz._render();
		});
		ro.observe(container);

		onUnmounted(() => {
			ro.disconnect();
			_viz?.destroy();
			_canvas?.remove();
		});
	});

	const setItems = (items) => _viz?.setItems(items);
	const burstParticles = (x, y, count, colors) =>
		_viz?.burstParticles(x, y, count, colors);

	return { canvas, setItems, burstParticles };
}
