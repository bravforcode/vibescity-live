/**
 * HapticResonance.js — Sync haptic patterns with audio frequency
 * Engine Layer: navigator.vibrate. No Vue.
 *
 * Maps collision/dismiss physics events → vibrate waveforms.
 * Designed to feel like physical material resistance.
 */

const canVibrate = () =>
	typeof navigator !== "undefined" && "vibrate" in navigator;

export const HapticResonance = {
	/**
	 * Hard boundary collision thud.
	 * Pattern: hard hit (20ms) → brief gap (10ms) → soft echo (15ms)
	 * Mimics collision physics: v_rebound = -e * v_impact
	 */
	thud() {
		if (!canVibrate()) return;
		navigator.vibrate([20, 10, 15]);
	},

	/**
	 * Light snap (tooltip, card select).
	 */
	snap() {
		if (!canVibrate()) return;
		navigator.vibrate([8]);
	},

	/**
	 * Swipe dismiss — fade out vibration
	 * Decreasing pattern mirrors dismissal audio frequency sweep.
	 */
	dismiss() {
		if (!canVibrate()) return;
		navigator.vibrate([15, 5, 8, 5, 4]);
	},

	/**
	 * Velocity-driven swipe feedback.
	 * Fast swipe → short sharp buzz; slow → long gentle hum.
	 * @param {number} velocity — px/ms
	 */
	swipe(velocity) {
		if (!canVibrate()) return;
		const duration = Math.max(4, Math.min(30, (1 - velocity / 12) * 30));
		navigator.vibrate([Math.round(duration)]);
	},

	/**
	 * Resonant frequency pattern — synced to audio oscillator Hz.
	 * Converts audio frequency to vibrate pulse pattern.
	 * @param {number} freq — Hz (e.g. 60 for thud, 300 for snap)
	 */
	resonant(freq) {
		if (!canVibrate()) return;
		// Period in ms
		const periodMs = Math.round(1000 / freq);
		// 3 pulses of half-period on, half-period off
		const halfPeriod = Math.max(2, Math.round(periodMs / 2));
		navigator.vibrate([
			halfPeriod,
			halfPeriod,
			halfPeriod,
			halfPeriod,
			halfPeriod,
		]);
	},

	/**
	 * Cancel any ongoing vibration.
	 */
	cancel() {
		if (!canVibrate()) return;
		navigator.vibrate(0);
	},
};
