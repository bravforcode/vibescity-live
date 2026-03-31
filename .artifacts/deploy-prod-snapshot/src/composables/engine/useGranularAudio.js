/**
 * useGranularAudio.js — Vue bridge for GranularSynth + HapticResonance
 * Composable Layer: Vue 3.
 *
 * Hooks into gesture velocity from spring physics to drive sound.
 * Reuses existing sharedCtx from useSpatialFeedback.
 * Respects user sound/haptics preferences.
 */

import { GranularSynth } from "@/engine/audio/GranularSynth.js";
import { HapticResonance } from "@/engine/audio/HapticResonance.js";
import { useUserPreferencesStore } from "@/store/userPreferencesStore.js";

// Module-level singleton (one AudioContext, one GranularSynth)
let _synth = null;

const getContext = () => {
	const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
	if (!Ctx) return null;
	// Reuse any existing AudioContext from useSpatialFeedback
	if (typeof window !== "undefined" && window.__vcAudioCtx) {
		return window.__vcAudioCtx;
	}
	const ctx = new Ctx();
	if (typeof window !== "undefined") window.__vcAudioCtx = ctx;
	return ctx;
};

const getSynth = () => {
	if (_synth) return _synth;
	const ctx = getContext();
	if (!ctx) return null;
	_synth = new GranularSynth(ctx);
	return _synth;
};

const prefersReducedMotion =
	typeof window !== "undefined"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

export function useGranularAudio() {
	const prefs = useUserPreferencesStore();

	const isEnabled = () =>
		prefs.isSoundEnabled !== false &&
		(navigator.userActivation?.hasBeenActive ?? true);

	const isHapticsEnabled = () =>
		prefs.isHapticsEnabled !== false &&
		"vibrate" in navigator &&
		(navigator.userActivation?.hasBeenActive ?? true);

	/**
	 * Swipe start/during — modulate sound by current velocity.
	 * Call this continuously during gesture.
	 * @param {number} velocity — px/ms
	 */
	const onSwipe = (velocity) => {
		if (!isEnabled()) return;
		// Throttle: only play every 80ms to avoid audio clicks
		const now = performance.now();
		if (onSwipe._last && now - onSwipe._last < 80) return;
		onSwipe._last = now;

		const synth = getSynth();
		synth?.playSwipe(velocity);

		if (isHapticsEnabled()) {
			HapticResonance.swipe(velocity);
		}
	};

	/**
	 * Swipe released → snap back to rest.
	 */
	const onSnap = () => {
		if (!isEnabled()) return;
		getSynth()?.playSnap();
		if (isHapticsEnabled()) HapticResonance.snap();
	};

	/**
	 * Swipe dismissed element.
	 * @param {number} velocity — final velocity at release
	 */
	const onDismiss = (velocity = 3) => {
		if (!isEnabled()) return;
		getSynth()?.playDismiss(velocity);
		if (isHapticsEnabled()) HapticResonance.dismiss();
	};

	/**
	 * Drawer/modal hit boundary.
	 * Hard physical thud sound + haptic.
	 */
	const onCollision = () => {
		if (!isEnabled()) return;
		getSynth()?.playCollision();
		if (isHapticsEnabled()) {
			HapticResonance.thud();
		}
	};

	/**
	 * Set global volume multiplier.
	 * Called during reduced-motion preference or focus/blur.
	 * @param {number} v — 0..1
	 */
	const setVolume = (v) => {
		if (prefersReducedMotion) v = v * 0.3;
		getSynth()?.setVolume(v);
	};

	return {
		onSwipe,
		onSnap,
		onDismiss,
		onCollision,
		setVolume,
	};
}
