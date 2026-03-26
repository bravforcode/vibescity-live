/**
 * GranularSynth.js — Velocity-driven procedural audio synthesis
 * Engine Layer: Web Audio API. No Vue, no DOM except AudioContext.
 *
 * Maps gesture velocity → frequency / filter cutoff / duration / gain.
 * All sounds synthesized in real-time, zero file I/O.
 *
 * Reuses sharedCtx from useSpatialFeedback (module-level singleton).
 */

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

export class GranularSynth {
	/**
	 * @param {AudioContext} ctx — shared AudioContext
	 */
	constructor(ctx) {
		this._ctx = ctx;
		this._pool = []; // pre-allocated OscillatorNode pool (size 4)
		this._active = 0;
		this._noiseBuffer = null;
		this._masterGain = ctx.createGain();
		this._masterGain.gain.value = 1.0;
		this._masterGain.connect(ctx.destination);
		this._buildNoiseBuffer();
	}

	// ─── Noise buffer ─────────────────────────────────────────────

	_buildNoiseBuffer() {
		const duration = 0.2; // 200ms
		const sr = this._ctx.sampleRate;
		this._noiseBuffer = this._ctx.createBuffer(1, sr * duration, sr);
		const data = this._noiseBuffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) {
			data[i] = Math.random() * 2 - 1;
		}
	}

	// ─── Velocity → sound parameters ─────────────────────────────

	/**
	 * Play swipe sound driven by gesture velocity.
	 * Slow swipe → deep bass hum. Fast flick → high crystalline snap.
	 *
	 * Velocity mapping (px/ms):
	 *   freq:       lerp(80, 2400, v/12)
	 *   cutoff:     lerp(200, 8000, v/12)
	 *   gain:       lerp(0.02, 0.15, v/8)
	 *   duration:   lerp(200, 30, v/12) ms
	 *
	 * @param {number} velocity — px/ms
	 */
	playSwipe(velocity) {
		const ctx = this._ctx;
		if (!ctx || ctx.state === "closed") return;
		if (ctx.state === "suspended") ctx.resume();

		const t = Math.min(velocity / 12, 1.0);
		const freq = lerp(80, 2400, t);
		const cutoff = lerp(200, 8000, t);
		const gain = lerp(0.02, 0.15, t);
		const duration = lerp(0.2, 0.03, t);
		const now = ctx.currentTime;

		// Oscillator
		const osc = ctx.createOscillator();
		osc.type = t > 0.6 ? "triangle" : "sine";
		osc.frequency.setValueAtTime(freq, now);
		osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + duration);

		// Filter
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(cutoff, now);
		filter.Q.value = 2.0;

		// Gain envelope: linear attack → exp decay
		const gainNode = ctx.createGain();
		gainNode.gain.setValueAtTime(0, now);
		gainNode.gain.linearRampToValueAtTime(gain, now + 0.005);
		gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

		osc.connect(filter).connect(gainNode).connect(this._masterGain);
		osc.start(now);
		osc.stop(now + duration + 0.01);
	}

	/**
	 * Play collision thud when drawer/modal hits boundary.
	 * 60Hz sine + 15ms noise burst + hard haptic.
	 */
	playCollision() {
		const ctx = this._ctx;
		if (!ctx || ctx.state === "closed") return;
		if (ctx.state === "suspended") ctx.resume();

		const now = ctx.currentTime;

		// Thud: 60Hz sine, 40ms
		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(60, now);

		const gainOsc = ctx.createGain();
		gainOsc.gain.setValueAtTime(0.2, now);
		gainOsc.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

		osc.connect(gainOsc).connect(this._masterGain);
		osc.start(now);
		osc.stop(now + 0.05);

		// Noise burst: 15ms, bandpass 100-300Hz
		if (!this._noiseBuffer) return;
		const noise = ctx.createBufferSource();
		noise.buffer = this._noiseBuffer;

		const bp = ctx.createBiquadFilter();
		bp.type = "bandpass";
		bp.frequency.value = 200;
		bp.Q.value = 2.0;

		const gainNoise = ctx.createGain();
		gainNoise.gain.setValueAtTime(0.18, now);
		gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

		noise.connect(bp).connect(gainNoise).connect(this._masterGain);
		noise.start(now);
		noise.stop(now + 0.02);
	}

	/**
	 * Play dismiss sound: descending sine (600→200Hz, 120ms).
	 * @param {number} velocity — swipe-out velocity for pitch scaling
	 */
	playDismiss(velocity = 3) {
		const ctx = this._ctx;
		if (!ctx || ctx.state === "closed") return;
		if (ctx.state === "suspended") ctx.resume();

		const t = Math.min(velocity / 8, 1.0);
		const startFreq = lerp(400, 700, t);
		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(startFreq, now);
		osc.frequency.exponentialRampToValueAtTime(160, now + 0.12);

		const gainNode = ctx.createGain();
		gainNode.gain.setValueAtTime(0.1, now);
		gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

		osc.connect(gainNode).connect(this._masterGain);
		osc.start(now);
		osc.stop(now + 0.13);
	}

	/**
	 * Play snap sound: short triangle thud.
	 */
	playSnap() {
		const ctx = this._ctx;
		if (!ctx || ctx.state === "closed") return;
		if (ctx.state === "suspended") ctx.resume();

		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(300, now);
		osc.frequency.exponentialRampToValueAtTime(100, now + 0.012);

		const gainNode = ctx.createGain();
		gainNode.gain.setValueAtTime(0.12, now);
		gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

		osc.connect(gainNode).connect(this._masterGain);
		osc.start(now);
		osc.stop(now + 0.015);
	}

	/**
	 * Set master volume (0..1).
	 */
	setVolume(v) {
		this._masterGain.gain.setTargetAtTime(v, this._ctx.currentTime, 0.01);
	}
}
