import { useUserPreferencesStore } from "../store/userPreferencesStore";

/**
 * useSpatialFeedback — Zero-latency synthesized audio + haptic feedback
 *
 * Uses AudioContext oscillators to produce procedural interaction sounds.
 * No file loading, no network requests, instant playback.
 *
 * Sound library:
 *  - click  : 6ms sine blip (900→600Hz sweep)
 *  - woosh  : 80ms noise burst shaped by velocity
 *  - snap   : 12ms triangle thud (300Hz)
 *  - dismiss: 120ms descending sine (600→200Hz)
 */

let sharedCtx = null;
let noiseBuffer = null;

const getContext = () => {
	if (sharedCtx && sharedCtx.state !== "closed") return sharedCtx;
	const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
	if (!Ctx) return null;
	sharedCtx = new Ctx();
	return sharedCtx;
};

const ensureNoiseBuffer = (ctx) => {
	if (noiseBuffer) return noiseBuffer;
	const length = ctx.sampleRate * 0.15; // 150ms of noise
	noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = noiseBuffer.getChannelData(0);
	for (let i = 0; i < length; i++) {
		data[i] = Math.random() * 2 - 1;
	}
	return noiseBuffer;
};

const prefersReducedMotion =
	typeof window !== "undefined"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

export function useSpatialFeedback() {
	const prefs = useUserPreferencesStore();

	const isEnabled = () => {
		return (
			prefs.isSoundEnabled !== false &&
			!prefersReducedMotion &&
			(navigator.userActivation?.hasBeenActive ?? true)
		);
	};

	const isHapticsEnabled = () => {
		return (
			typeof navigator !== "undefined" &&
			"vibrate" in navigator &&
			prefs.isHapticsEnabled !== false &&
			(navigator.userActivation?.hasBeenActive ?? true)
		);
	};

	/**
	 * Short click blip — pin tap, button press
	 */
	const playClick = () => {
		if (!isEnabled()) return;
		const ctx = getContext();
		if (!ctx) return;
		if (ctx.state === "suspended") ctx.resume();

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(900, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.006);
		gain.gain.setValueAtTime(0.08, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.006);

		osc.connect(gain).connect(ctx.destination);
		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.008);
	};

	/**
	 * Woosh — velocity-scaled noise burst for swipe gestures
	 * @param {number} velocityPxMs - absolute velocity in px/ms
	 */
	const playWoosh = (velocityPxMs = 0.5) => {
		if (!isEnabled()) return;
		const ctx = getContext();
		if (!ctx) return;
		if (ctx.state === "suspended") ctx.resume();

		const buf = ensureNoiseBuffer(ctx);
		const src = ctx.createBufferSource();
		const gain = ctx.createGain();
		const filter = ctx.createBiquadFilter();

		src.buffer = buf;

		// Velocity maps to volume and filter cutoff
		const v = Math.min(2, Math.max(0.2, velocityPxMs));
		const volume = 0.03 + v * 0.02;
		const cutoff = 800 + v * 1200;
		const duration = 0.04 + v * 0.04;

		filter.type = "lowpass";
		filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
		filter.Q.setValueAtTime(1, ctx.currentTime);

		gain.gain.setValueAtTime(volume, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

		src.connect(filter).connect(gain).connect(ctx.destination);
		src.start(ctx.currentTime);
		src.stop(ctx.currentTime + duration + 0.01);
	};

	/**
	 * Snap — drawer snaps back to open position
	 */
	const playSnap = () => {
		if (!isEnabled()) return;
		const ctx = getContext();
		if (!ctx) return;
		if (ctx.state === "suspended") ctx.resume();

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(300, ctx.currentTime);
		gain.gain.setValueAtTime(0.06, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.012);

		osc.connect(gain).connect(ctx.destination);
		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.015);
	};

	/**
	 * Dismiss — descending tone when drawer is dismissed
	 */
	const playDismiss = () => {
		if (!isEnabled()) return;
		const ctx = getContext();
		if (!ctx) return;
		if (ctx.state === "suspended") ctx.resume();

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(600, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.12);
		gain.gain.setValueAtTime(0.05, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

		osc.connect(gain).connect(ctx.destination);
		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.14);
	};

	/**
	 * Haptic micro-pulse — for pin clicks, swipe commits
	 * @param {"tap"|"snap"|"dismiss"} type
	 */
	const haptic = (type = "tap") => {
		if (!isHapticsEnabled()) return;
		const patterns = {
			tap: [8],
			snap: [12, 20, 8],
			dismiss: [15, 30, 10],
		};
		navigator.vibrate(patterns[type] || patterns.tap);
	};

	return {
		playClick,
		playWoosh,
		playSnap,
		playDismiss,
		haptic,
		isEnabled,
	};
}
