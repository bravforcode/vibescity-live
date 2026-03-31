/**
 * capabilities.js — Runtime feature detection
 * Engine Layer: Pure JS, no Vue deps.
 *
 * Check once at boot, export frozen caps object.
 * All engine modules gate themselves on these flags.
 */

const detect = () => {
	const canvas =
		typeof document !== "undefined" ? document.createElement("canvas") : null;

	// WebGL 2 + float texture support
	let webgl2 = false;
	let floatTextures = false;
	if (canvas) {
		const gl = canvas.getContext("webgl2");
		if (gl) {
			webgl2 = true;
			floatTextures = !!gl.getExtension("EXT_color_buffer_float");
		}
	}

	// SharedArrayBuffer requires crossOriginIsolated (COOP + COEP headers)
	const sharedArrayBuffer =
		typeof SharedArrayBuffer !== "undefined" &&
		(typeof self !== "undefined" ? (self.crossOriginIsolated ?? false) : false);

	// Web Audio API
	const audioContext =
		typeof AudioContext !== "undefined" ||
		typeof webkitAudioContext !== "undefined";

	// Haptics
	const vibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

	// View Transitions API (for dolly zoom FLIP)
	const viewTransition =
		typeof document !== "undefined" && "startViewTransition" in document;

	// OffscreenCanvas (canvas virtualization)
	const offscreenCanvas = typeof OffscreenCanvas !== "undefined";

	// ImageDecoder API (predictive texture warm)
	const imageDecoder = typeof ImageDecoder !== "undefined";

	return Object.freeze({
		webgl2,
		floatTextures,
		sharedArrayBuffer,
		audioContext,
		vibrate,
		viewTransition,
		offscreenCanvas,
		imageDecoder,
	});
};

export const caps = detect();

/**
 * Log capability summary (dev only)
 */
export const logCaps = () => {
	if (import.meta.env.DEV) {
		console.groupCollapsed("[VibeCity Engine] Capabilities");
		Object.entries(caps).forEach(([k, v]) => {
			console.log(`  ${v ? "✅" : "❌"} ${k}`);
		});
		console.groupEnd();
	}
};
