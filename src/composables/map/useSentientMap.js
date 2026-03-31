import { onUnmounted, watch } from "vue";

// ══════════════════════════════════════════════════════════════════════════════
// RUNTIME CONFIG — Hard Defaults (Remote Override + Local > Hard Fallback)
// ══════════════════════════════════════════════════════════════════════════════

const HARD_DEFAULTS = {
	enabled: true,
	killSwitch: false,
	debug: false,
	mode: "balanced", // 'control' | 'balanced' | 'aggressive' | 'ultra'
	radar: {
		baseRadiusPx: 70,
		maxRadiusPx: 120,
		sweetSpotY: 0.55, // % from top; center-biased (less sweet-spot drift)
	},
	velocity: {
		lowThreshold: 0.5, // px/ms below = precision mode
		medThreshold: 2.0,
		highThreshold: 5.0,
		skipThreshold: 8.0, // skip spatial query entirely
	},
	stability: {
		lockDwellMs: 800, // require longer dwell before auto-select
		openRadiusPx: 55, // tighter: must be very close to pin to auto-open
		exitRadiusPx: 110, // hysteresis: proportional to smaller openRadius
		leaveDwellMs: 800, // must stay outside exitRadius for this long
		reopenCooldownMs: 3000, // after modal close
		sameVenueRetriggerBlockMs: 5000, // block same-venue re-auto-open
	},
	autoOpen: {
		baseDelayMs: 1500,
		afterManualTapMultiplier: 2.0, // 1500 * 2 = 3000ms after manual tap
		adaptiveMin: 1000,
		adaptiveMax: 3500,
	},
	snap: {
		thresholdPx: 50,
		durationMs: 400,
		easing: (t) => t * (2 - t), // ease-out quad
		hapticMs: 10,
	},
	prefetch: {
		topNCandidates: 3,
		staleTimeMs: 30_000,
	},
	drawerLock: {
		lockGesturesDuringOpen: true,
		maxLockMs: 800,
	},
	persistence: {
		keyPrefix: "vcsentient_v1_",
		standardTtlMs: 86_400_000, // 24 hours
	},
};

function mergeDeep(base, override) {
	if (!override || typeof override !== "object") return base;
	const result = { ...base };
	for (const key of Object.keys(override)) {
		if (
			typeof base[key] === "object" &&
			!Array.isArray(base[key]) &&
			typeof override[key] === "object"
		) {
			result[key] = mergeDeep(base[key], override[key]);
		} else if (override[key] !== undefined) {
			result[key] = override[key];
		}
	}
	return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// FSM STATES
// ══════════════════════════════════════════════════════════════════════════════

const FSM = Object.freeze({
	IDLE: "IDLE",
	TRACKING: "TRACKING",
	CANDIDATE_LOCKING: "CANDIDATE_LOCKING",
	PREFETCHING: "PREFETCHING",
	SNAPPING: "SNAPPING",
	PIN_PULSE: "PIN_PULSE",
	DRAWER_OPENING: "DRAWER_OPENING",
	DRAWER_OPEN: "DRAWER_OPEN",
	COOLDOWN: "COOLDOWN",
});

// ══════════════════════════════════════════════════════════════════════════════
// SEEN DATABASE (localStorage with versioning + TTL)
// ══════════════════════════════════════════════════════════════════════════════

function createSeenDb(persistCfg) {
	const { keyPrefix, standardTtlMs } = persistCfg;

	const parseEntry = (raw) => {
		try {
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object") return null;
			if (!parsed.seenAt || !parsed.type) return null;
			return parsed;
		} catch {
			return null;
		}
	};

	const key = (venueId) => `${keyPrefix}${venueId}`;

	return {
		markSeen(venueId, type = "standard") {
			try {
				localStorage.setItem(
					key(venueId),
					JSON.stringify({
						venueId: String(venueId),
						seenAt: Date.now(),
						type,
					}),
				);
			} catch {
				// storage quota or private mode — fail silently
			}
		},

		isSuppressed(venueId, isLive = false) {
			if (isLive) return false; // LIVE venues bypass suppression
			try {
				const raw = localStorage.getItem(key(venueId));
				if (!raw) return false;
				const entry = parseEntry(raw);
				if (!entry) return false;
				const age = Date.now() - Number(entry.seenAt);
				return age < standardTtlMs;
			} catch {
				return false;
			}
		},

		clearExpired() {
			try {
				const keysToDelete = [];
				for (let i = 0; i < localStorage.length; i++) {
					const k = localStorage.key(i);
					if (!k?.startsWith(keyPrefix)) continue;
					const raw = localStorage.getItem(k);
					const entry = parseEntry(raw);
					if (!entry) {
						keysToDelete.push(k);
						continue;
					}
					if (Date.now() - Number(entry.seenAt) >= standardTtlMs) {
						keysToDelete.push(k);
					}
				}
				for (const k of keysToDelete) {
					localStorage.removeItem(k);
				}
			} catch {
				// silently ignore
			}
		},
	};
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSABLE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * useSentientMap — Predictive intent engine with anti-flicker FSM for Mapbox.
 * Detects user intent near venues, manages stable lock windows, and auto-opens
 * drawer with morphing reveal (pin pulse → snap → drawer).
 *
 * @param {Ref<mapboxgl.Map|null>} mapRef
 * @param {Ref<boolean>} isMapReadyRef
 * @param {Ref<HTMLElement|null>} mapContainerRef
 * @param {Ref<Array>} shopsRef — rendered venue list
 * @param {Ref<string|number|null>} highlightedShopIdRef — currently open drawer venue ID
 * @param {Function} emitFn — Vue emit from parent (select-shop, open-detail)
 * @param {Object} options
 *   @param {Object} options.config — remote config overrides
 *   @param {Function} options.prefetchFn — (venueId, signal?) => Promise [Vue Query prefetch wrapper]
 *   @param {string} options.pinSourceId — Mapbox source ID; default "pins_source"
 *   @param {string} options.pinLayerId — Mapbox layer ID; default "unclustered-pins"
 */
export function useSentientMap(
	mapRef,
	isMapReadyRef,
	mapContainerRef,
	shopsRef,
	highlightedShopIdRef,
	emitFn,
	options = {},
) {
	// ─── CONFIG ──────────────────────────────────────────────────────────────
	let cfg = mergeDeep(HARD_DEFAULTS, options.config ?? {});
	const PIN_SOURCE_ID = options.pinSourceId ?? "pins_source";

	// ─── KILL SWITCH CHECK ───────────────────────────────────────────────────
	const isEnabled = () => cfg.enabled && !cfg.killSwitch;

	// ─── FSM STATE ───────────────────────────────────────────────────────────
	let state = FSM.IDLE;
	let lockedCandidate = null; // { id, lng, lat, shop, isLive }
	let topCandidate = null; // current best candidate this frame
	let candidateTopSince = 0; // timestamp when topCandidate first became top

	// ─── VELOCITY TRACKING ───────────────────────────────────────────────────
	let lastCenterPx = null; // { x, y } in screen px
	let lastMoveTs = 0;
	let currentVelocity = 0; // px/ms, smoothed
	const velocityVectors = []; // [{ vx, vy, t }] for trajectory prediction
	let isDragging = false;

	// ─── TIMERS (all cancellable) ────────────────────────────────────────────
	let lockDwellTimer = null;
	let leaveDwellTimer = null;
	let autoOpenTimer = null;
	let cooldownTimer = null;
	let drawerLockTimer = null;
	let rafHandle = null;
	let lastRadarRunAt = 0;
	const RADAR_INTERVAL_MS = 100; // 10 Hz

	// ─── SESSION STATE ───────────────────────────────────────────────────────
	let hasManualTapInSession = false;
	let lastOpenedId = null; // last venue that was auto-opened
	let lastOpenedAt = 0;
	let cooldownEndAt = 0;
	let lastLeaveId = null; // last venue that left exitRadius
	let lastLeaveAt = 0;
	const prefetchInflight = new Map(); // venueId → AbortController

	// ─── INTENT ENGINE ───────────────────────────────────────────────────────
	const attentionMap = new Map(); // venueId → attention score (session)
	const acceptanceLog = []; // [{ accepted: bool, ts: number }]
	let adaptiveDelay = cfg.autoOpen.baseDelayMs;
	let predictedNextIds = []; // top-N trajectory predictions

	// ─── PERSISTENCE ─────────────────────────────────────────────────────────
	const seenDb = createSeenDb(cfg.persistence);
	seenDb.clearExpired(); // cleanup old entries on init

	// ─── DEBUG HELPER ─────────────────────────────────────────────────────────
	const dbg = (event, data) => {
		if (!cfg.debug) return;
		if (typeof window !== "undefined") {
			window.__sentientMap ??= {};
			window.__sentientMap.lastEvent = { event, data, state, ts: Date.now() };
		}
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// VELOCITY COMPUTATION
	// ══════════════════════════════════════════════════════════════════════════════

	const updateVelocity = (center) => {
		if (!mapRef.value || !mapContainerRef.value) return;
		const px = mapRef.value.project(center);
		const now = performance.now();

		if (lastCenterPx && lastMoveTs) {
			const dt = now - lastMoveTs;
			if (dt > 0 && dt < 500) {
				// ignore stale diffs
				const dx = px.x - lastCenterPx.x;
				const dy = px.y - lastCenterPx.y;
				const rawV = Math.sqrt(dx * dx + dy * dy) / dt;

				// Exponential moving average (α=0.3 for smoothing)
				currentVelocity = 0.3 * rawV + 0.7 * currentVelocity;

				// Store velocity vector for trajectory prediction
				velocityVectors.push({ vx: dx / dt, vy: dy / dt, t: now });
				if (velocityVectors.length > 8) velocityVectors.shift();
			}
		}

		lastCenterPx = { x: px.x, y: px.y };
		lastMoveTs = now;
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// TRAJECTORY PREDICTION (ultra mode)
	// ══════════════════════════════════════════════════════════════════════════════

	const predictFutureCenter = (lookaheadMs = 300) => {
		if (velocityVectors.length < 2) return null;
		const recent = velocityVectors.slice(-3);
		const avgVx = recent.reduce((s, v) => s + v.vx, 0) / recent.length;
		const avgVy = recent.reduce((s, v) => s + v.vy, 0) / recent.length;

		if (!lastCenterPx) return null;
		return {
			x: lastCenterPx.x + avgVx * lookaheadMs,
			y: lastCenterPx.y + avgVy * lookaheadMs,
		};
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// CANDIDATE SCORING
	// ══════════════════════════════════════════════════════════════════════════════

	const scoreCandidates = (candidates, _center, dynamicRadiusPx) => {
		if (!mapRef.value || !mapContainerRef.value) return null;

		const vpH = mapContainerRef.value.clientHeight || 800;
		const vpW = mapContainerRef.value.clientWidth || 400;
		const sweepCx = vpW / 2;
		const sweepCy = vpH * cfg.radar.sweetSpotY;

		// Predicted center for ultra mode
		const predictedPx = cfg.mode === "ultra" ? predictFutureCenter(300) : null;
		const evalCx = predictedPx ? (sweepCx + predictedPx.x) / 2 : sweepCx;
		const evalCy = predictedPx ? (sweepCy + predictedPx.y) / 2 : sweepCy;

		let best = null;
		let bestScore = -Infinity;

		const scored = [];

		for (const shop of candidates) {
			const lng = Number(shop?.lng ?? shop?.longitude ?? 0);
			const lat = Number(shop?.lat ?? shop?.latitude ?? 0);
			if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

			let px;
			try {
				px = mapRef.value.project([lng, lat]);
			} catch {
				continue;
			}

			const dx = px.x - evalCx;
			const dy = px.y - evalCy;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (dist > dynamicRadiusPx) continue;

			// Distance score (dominant)
			const distScore = Math.max(0, 1 - dist / dynamicRadiusPx) * 3.0;

			// Sweet-spot vertical bias
			const yRatio = px.y / vpH;
			const yBias = 1 - Math.abs(yRatio - cfg.radar.sweetSpotY) * 2;
			const sweetScore = Math.max(0, yBias) * 1.5;

			// Tier bonus (higher tier venues get priority)
			const tier = Number(
				shop?.tier ?? shop?.venue_tier ?? shop?.priority ?? 0,
			);
			const tierScore = Math.min(Math.max(tier, 0), 3) * 0.3;

			// Stability bonus (same as current locked/top candidate)
			const stabilityScore =
				lockedCandidate?.id === String(shop.id)
					? 0.8
					: topCandidate?.id === String(shop.id)
						? 0.4
						: 0;

			// Heading consistency (if candidate is in direction of travel)
			let headingScore = 0;
			if (velocityVectors.length >= 2 && dist > 5) {
				const recent = velocityVectors.slice(-2);
				const avgVx = recent.reduce((s, v) => s + v.vx, 0) / recent.length;
				const avgVy = recent.reduce((s, v) => s + v.vy, 0) / recent.length;
				const speed = Math.sqrt(avgVx * avgVx + avgVy * avgVy);
				if (speed > 0.01) {
					const dot = (dx * avgVx + dy * avgVy) / (dist * speed);
					// dot > 0 means venue is ahead of current movement
					headingScore = Math.max(0, -dot) * 0.4; // reward venues in direction
				}
			}

			// Attention heatmap bonus
			const attention = attentionMap.get(String(shop.id)) ?? 0;
			const attentionBonus = Math.min(attention, 5) * 0.1;

			// Recency penalty (recently shown venues ranked lower)
			const recencyPenalty = lastOpenedId === String(shop.id) ? 0.5 : 0;

			const totalScore =
				distScore +
				sweetScore +
				tierScore +
				stabilityScore +
				headingScore +
				attentionBonus -
				recencyPenalty;

			scored.push({ ...shop, _score: totalScore, _distPx: dist });

			if (totalScore > bestScore) {
				bestScore = totalScore;
				best = { ...shop, _score: totalScore, _distPx: dist };
			}
		}

		// Update predicted next IDs for prefetch
		predictedNextIds = scored
			.sort((a, b) => b._score - a._score)
			.slice(0, cfg.prefetch.topNCandidates)
			.map((s) => String(s.id));

		return best;
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// DYNAMIC RADIUS
	// ══════════════════════════════════════════════════════════════════════════════

	const getDynamicRadius = () => {
		const v = currentVelocity;
		const { lowThreshold, medThreshold } = cfg.velocity;
		const { baseRadiusPx, maxRadiusPx } = cfg.radar;

		if (v <= lowThreshold) return baseRadiusPx;
		if (v <= medThreshold) {
			const t = (v - lowThreshold) / (medThreshold - lowThreshold);
			return baseRadiusPx + (maxRadiusPx - baseRadiusPx) * t * 0.5;
		}
		return maxRadiusPx;
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// ATTENTION HEATMAP UPDATE
	// ══════════════════════════════════════════════════════════════════════════════

	const tickAttention = (venueId) => {
		if (!venueId) return;
		const current = attentionMap.get(String(venueId)) ?? 0;
		attentionMap.set(String(venueId), current + 1);
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// PIN FEATURE STATE (via setFeatureState)
	// ══════════════════════════════════════════════════════════════════════════════

	const setPinFeatureState = (venueId, stateObj) => {
		if (!mapRef.value || venueId == null) return;
		const rawId = String(venueId);
		const featureId = /^\d+$/.test(rawId) ? Number(rawId) : rawId;

		try {
			mapRef.value.setFeatureState(
				{ source: PIN_SOURCE_ID, id: featureId },
				stateObj,
			);
		} catch {
			// layer may not be ready; ignore silently
		}
	};

	const clearPinPulse = (venueId) => {
		setPinFeatureState(venueId, { sentient_pulse: false });
	};

	const triggerPinPulse = (venueId) => {
		setPinFeatureState(venueId, { sentient_pulse: true });
		dbg("pin_pulse_started", { venueId });
		// Clear after animation duration
		setTimeout(() => clearPinPulse(venueId), 1200);
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// PREFETCH (zero-latency at t=0ms)
	// ══════════════════════════════════════════════════════════════════════════════

	const prefetchVenue = (venueId) => {
		const id = String(venueId);
		if (prefetchInflight.has(id)) return; // dedupe

		dbg("prefetch_started", { venueId: id });

		const ctrl = new AbortController();
		prefetchInflight.set(id, ctrl);

		// Call parent-provided prefetch function if available
		if (typeof options.prefetchFn === "function") {
			Promise.resolve(options.prefetchFn(id, ctrl.signal))
				.then(() => {
					if (!ctrl.signal.aborted) {
						dbg("prefetch_ready", { venueId: id });
					}
				})
				.catch(() => {
					// aborted or error — silently ignore
				})
				.finally(() => {
					prefetchInflight.delete(id);
				});
		} else {
			// No prefetch function — cleanup immediately
			prefetchInflight.delete(id);
		}
	};

	const abortPrefetch = (venueId) => {
		const id = String(venueId);
		const ctrl = prefetchInflight.get(id);
		if (ctrl) {
			ctrl.abort();
			prefetchInflight.delete(id);
			dbg("prefetch_aborted", { venueId: id });
		}
	};

	const abortAllPrefetch = () => {
		for (const [id, ctrl] of prefetchInflight) {
			ctrl.abort();
			dbg("prefetch_aborted", { venueId: id });
		}
		prefetchInflight.clear();
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// DRAWER GESTURE LOCK
	// ══════════════════════════════════════════════════════════════════════════════

	const lockMapGestures = () => {
		if (!mapRef.value || !cfg.drawerLock.lockGesturesDuringOpen) return;

		try {
			mapRef.value.scrollZoom.disable();
			mapRef.value.dragPan.disable();
			mapRef.value.touchZoomRotate.disable();
		} catch {
			// ignore if methods not available
		}

		// Safety unlock fallback
		drawerLockTimer = setTimeout(() => {
			unlockMapGestures();
		}, cfg.drawerLock.maxLockMs);
	};

	const unlockMapGestures = () => {
		if (drawerLockTimer) {
			clearTimeout(drawerLockTimer);
			drawerLockTimer = null;
		}
		if (!mapRef.value) return;
		try {
			mapRef.value.scrollZoom.enable();
			mapRef.value.dragPan.enable();
			mapRef.value.touchZoomRotate.enable();
		} catch {
			// ignore
		}
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// MICRO-GRAVITY SNAP (soft snap with haptic feedback)
	// ══════════════════════════════════════════════════════════════════════════════

	const trySnap = (candidate) => {
		if (!mapRef.value || !candidate) return false;
		if (!mapContainerRef.value) return false;

		let px;
		try {
			px = mapRef.value.project([candidate.lng, candidate.lat]);
		} catch {
			return false;
		}

		const vpW = mapContainerRef.value.clientWidth || 400;
		const vpH = mapContainerRef.value.clientHeight || 800;
		const centerX = vpW / 2;
		const centerY = vpH / 2; // snap to true center

		const dx = px.x - centerX;
		const dy = px.y - centerY;
		const distPx = Math.sqrt(dx * dx + dy * dy);

		if (distPx > cfg.snap.thresholdPx) return false;

		state = FSM.SNAPPING;
		dbg("snap_started", { venueId: candidate.id, distPx });

		mapRef.value.easeTo({
			center: [candidate.lng, candidate.lat],
			duration: cfg.snap.durationMs,
			easing: cfg.snap.easing,
		});

		mapRef.value.once("moveend", () => {
			if (state !== FSM.SNAPPING) return;
			dbg("snap_completed", { venueId: candidate.id });

			// Haptic feedback on snap complete
			if (typeof navigator?.vibrate === "function") {
				try {
					navigator.vibrate(cfg.snap.hapticMs);
				} catch {}
			}

			// Proceed to pin pulse then drawer open
			proceedToOpen(candidate);
		});

		return true;
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// OPEN VENUE DRAWER (morphing reveal: pin pulse → drawer)
	// ══════════════════════════════════════════════════════════════════════════════

	const proceedToOpen = (candidate) => {
		if (!candidate) return;

		// Final guard: re-check FSM state, suppression, cooldown
		if (state === FSM.DRAWER_OPEN || state === FSM.DRAWER_OPENING) {
			dbg("auto_open_suppressed_reentry", { venueId: candidate.id });
			return;
		}

		if (Date.now() < cooldownEndAt) {
			dbg("auto_open_suppressed_cooldown", { venueId: candidate.id });
			return;
		}

		if (seenDb.isSuppressed(candidate.id, candidate.isLive)) {
			dbg("auto_open_suppressed_seen", { venueId: candidate.id });
			return;
		}

		state = FSM.PIN_PULSE;
		triggerPinPulse(candidate.id);

		// Small delay to let pin animate before drawer opens
		setTimeout(() => {
			if (!lockedCandidate || lockedCandidate.id !== candidate.id) return;
			if (state !== FSM.PIN_PULSE) return;

			state = FSM.DRAWER_OPENING;
			dbg("drawer_open_started", { venueId: candidate.id });

			lockMapGestures();

			// Track acceptance
			lastOpenedId = candidate.id;
			lastOpenedAt = Date.now();

			// Mark as seen
			seenDb.markSeen(candidate.id, candidate.isLive ? "live" : "standard");

			// Emit to parent — sentient-select triggers the guarded once-per-shop detail flow
			const shop = candidate.shop ?? {
				id: candidate.id,
				lat: candidate.lat,
				lng: candidate.lng,
			};
			emitFn("sentient-select", shop);
		}, 150);
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// AUTO-OPEN TIMER (start at t=0ms for zero-latency prefetch)
	// ══════════════════════════════════════════════════════════════════════════════

	const getAutoOpenDelay = () => {
		const base = hasManualTapInSession
			? cfg.autoOpen.baseDelayMs * cfg.autoOpen.afterManualTapMultiplier
			: cfg.autoOpen.baseDelayMs;

		return (
			Math.min(
				Math.max(adaptiveDelay, cfg.autoOpen.adaptiveMin),
				cfg.autoOpen.adaptiveMax,
			) || base
		);
	};

	const startAutoOpenTimer = (candidate) => {
		clearAutoOpenTimer();

		// Start prefetch IMMEDIATELY (t=0ms for zero latency)
		prefetchVenue(candidate.id);

		// Prefetch top-N predicted candidates too
		for (const id of predictedNextIds) {
			if (id !== candidate.id) prefetchVenue(id);
		}

		const delay = getAutoOpenDelay();
		autoOpenTimer = setTimeout(() => {
			if (!isEnabled()) return;
			if (lockedCandidate?.id !== candidate.id) return;
			if (state !== FSM.CANDIDATE_LOCKING && state !== FSM.PREFETCHING) return;
			if (currentVelocity > cfg.velocity.lowThreshold * 2) {
				dbg("radar_skipped_velocity", {
					velocity: currentVelocity,
				});
				return;
			}
			if (Date.now() < cooldownEndAt) {
				dbg("auto_open_suppressed_cooldown", {
					venueId: candidate.id,
				});
				return;
			}
			if (seenDb.isSuppressed(candidate.id, candidate.isLive)) {
				dbg("auto_open_suppressed_seen", {
					venueId: candidate.id,
				});
				return;
			}

			// Try snap first, snap handler calls proceedToOpen on completion
			const snapped = trySnap(candidate);
			if (!snapped) {
				proceedToOpen(candidate);
			}
		}, delay);
	};

	const clearAutoOpenTimer = () => {
		if (autoOpenTimer) {
			clearTimeout(autoOpenTimer);
			autoOpenTimer = null;
		}
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// FSM TRANSITION LOGGING
	// ══════════════════════════════════════════════════════════════════════════════

	const transitionTo = (newState, data) => {
		state = newState;
		dbg(`transition_${newState}`, data);
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// MAIN RADAR LOOP (RAF-throttled at ~100ms)
	// ══════════════════════════════════════════════════════════════════════════════

	const runRadar = () => {
		// Kill-switch / disabled
		if (!isEnabled()) {
			rafHandle = requestAnimationFrame(runRadar);
			return;
		}

		// Not ready
		if (!isMapReadyRef?.value || !mapRef?.value) {
			rafHandle = requestAnimationFrame(runRadar);
			return;
		}

		// Drawer is open — suppress radar entirely
		if (state === FSM.DRAWER_OPEN || state === FSM.DRAWER_OPENING) {
			rafHandle = requestAnimationFrame(runRadar);
			return;
		}

		// Throttle to RADAR_INTERVAL_MS
		const now = performance.now();
		if (now - lastRadarRunAt < RADAR_INTERVAL_MS) {
			rafHandle = requestAnimationFrame(runRadar);
			return;
		}
		lastRadarRunAt = now;

		// Skip expensive work at very high velocity
		if (currentVelocity > cfg.velocity.skipThreshold) {
			dbg("radar_skipped_velocity", { velocity: currentVelocity });
			if (state !== FSM.IDLE && state !== FSM.COOLDOWN) {
				resetToTracking();
			}
			rafHandle = requestAnimationFrame(runRadar);
			return;
		}

		// Get shops list
		const shops = shopsRef.value;
		if (!shops?.length) {
			rafHandle = requestAnimationFrame(runRadar);
			return;
		}

		// Run scoring — use idle scheduling for >500 pins
		const runScoring = () => {
			const center = mapRef.value?.getCenter?.();
			if (!center) return;
			const radius = getDynamicRadius();
			const newTop = scoreCandidates(shops, center, radius);
			processRadarResult(newTop, now);
		};

		if (shops.length > 500 && typeof requestIdleCallback === "function") {
			requestIdleCallback(runScoring, { timeout: 50 });
		} else {
			runScoring();
		}

		rafHandle = requestAnimationFrame(runRadar);
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// PROCESS RADAR RESULT → FSM UPDATES
	// ══════════════════════════════════════════════════════════════════════════════

	const processRadarResult = (newTop, now) => {
		// ─── Cooldown state ──────────────────────────────────────────────────
		if (state === FSM.COOLDOWN) return;

		// ─── No candidate found ───────────────────────────────────────────────
		if (!newTop) {
			if (topCandidate) {
				// Was tracking, now lost
				checkLeaveCondition(topCandidate, now);
			}
			if (
				state === FSM.TRACKING ||
				state === FSM.CANDIDATE_LOCKING ||
				state === FSM.PREFETCHING
			) {
				resetToTracking();
			}
			topCandidate = null;
			return;
		}

		const newId = String(newTop.id);

		// ─── Update attention heatmap ─────────────────────────────────────────
		tickAttention(newId);

		// ─── Candidate changed ───────────────────────────────────────────────
		if (!topCandidate || topCandidate.id !== newId) {
			dbg("candidate_unlocked", { prev: topCandidate?.id, next: newId });

			// Abort prefetch for old candidate if different
			if (topCandidate && topCandidate.id !== newId) {
				abortPrefetch(topCandidate.id);
			}

			topCandidate = {
				id: newId,
				lng: Number(newTop.lng ?? newTop.longitude ?? 0),
				lat: Number(newTop.lat ?? newTop.latitude ?? 0),
				isLive: Boolean(
					newTop.is_live ||
						String(newTop.status || "").toUpperCase() === "LIVE",
				),
				shop: newTop,
			};
			candidateTopSince = now;

			if (lockDwellTimer) {
				clearTimeout(lockDwellTimer);
				lockDwellTimer = null;
			}

			// Transition to TRACKING
			if (state === FSM.IDLE) transitionTo(FSM.TRACKING);

			// Start lock dwell window
			lockDwellTimer = setTimeout(() => {
				if (!isEnabled()) return;
				if (topCandidate?.id !== newId) return;
				if (state === FSM.DRAWER_OPEN || state === FSM.DRAWER_OPENING) return;

				// Check if this venue is suppressed by same-venue retrigger block
				const timeSinceLastOpen = now - lastOpenedAt;
				const sameVenueBlock =
					newId === lastOpenedId &&
					timeSinceLastOpen < cfg.stability.sameVenueRetriggerBlockMs;
				if (sameVenueBlock) {
					dbg("auto_open_suppressed_reentry", { venueId: newId });
					return;
				}

				// Check distance for open radius
				if (mapRef.value && mapContainerRef.value) {
					let px;
					try {
						px = mapRef.value.project([topCandidate.lng, topCandidate.lat]);
					} catch {
						return;
					}
					const vpW = mapContainerRef.value.clientWidth || 400;
					const vpH = mapContainerRef.value.clientHeight || 800;
					const dx = px.x - vpW / 2;
					const dy = px.y - vpH / 2;
					const dist = Math.sqrt(dx * dx + dy * dy);

					if (dist > cfg.stability.openRadiusPx) return;
				}

				dbg("candidate_locked", { venueId: newId });
				lockedCandidate = topCandidate;
				transitionTo(FSM.CANDIDATE_LOCKING);
				startAutoOpenTimer(topCandidate);
			}, cfg.stability.lockDwellMs);

			return;
		}

		// ─── Same candidate still top ────────────────────────────────────────
		// Ensure leave dwell timer is cleared
		if (leaveDwellTimer) {
			clearTimeout(leaveDwellTimer);
			leaveDwellTimer = null;
		}
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// LEAVE DETECTION (hysteresis: must leave exitRadiusPx for leaveDwellMs)
	// ══════════════════════════════════════════════════════════════════════════════

	const checkLeaveCondition = (leavingCandidate, _now) => {
		if (!leavingCandidate) return;
		if (!mapRef.value || !mapContainerRef.value) return;

		let px;
		try {
			px = mapRef.value.project([leavingCandidate.lng, leavingCandidate.lat]);
		} catch {
			return;
		}

		const vpW = mapContainerRef.value.clientWidth || 400;
		const vpH = mapContainerRef.value.clientHeight || 800;
		const dx = px.x - vpW / 2;
		const dy = px.y - vpH / 2;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (dist > cfg.stability.exitRadiusPx) {
			// Start leave dwell timer
			if (!leaveDwellTimer) {
				leaveDwellTimer = setTimeout(() => {
					leaveDwellTimer = null;
					lastLeaveId = leavingCandidate.id;
					lastLeaveAt = Date.now();
					dbg("candidate_unlocked", {
						venueId: leavingCandidate.id,
						reason: "leave_dwell",
					});
					if (lockedCandidate?.id === leavingCandidate.id) {
						lockedCandidate = null;
						clearAutoOpenTimer();
						abortPrefetch(leavingCandidate.id);
					}
				}, cfg.stability.leaveDwellMs);
			}
		}
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// RESET TO TRACKING
	// ══════════════════════════════════════════════════════════════════════════════

	const resetToTracking = () => {
		clearAutoOpenTimer();
		if (lockDwellTimer) {
			clearTimeout(lockDwellTimer);
			lockDwellTimer = null;
		}
		if (leaveDwellTimer) {
			clearTimeout(leaveDwellTimer);
			leaveDwellTimer = null;
		}

		if (lockedCandidate) {
			abortPrefetch(lockedCandidate.id);
			lockedCandidate = null;
		}

		if (state !== FSM.COOLDOWN && state !== FSM.DRAWER_OPEN) {
			transitionTo(FSM.TRACKING);
		}
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// MAP EVENT HANDLERS
	// ══════════════════════════════════════════════════════════════════════════════

	const onMapMove = (e) => {
		if (!isEnabled()) return;
		const center = mapRef.value?.getCenter?.();
		if (center) updateVelocity(center);
		isDragging = e?.originalEvent != null; // null on programmatic moves
	};

	const onMapMoveEnd = () => {
		if (!isEnabled()) return;
		// Decay velocity on stop
		setTimeout(() => {
			currentVelocity = currentVelocity * 0.1; // rapid decay
		}, 50);

		isDragging = false;
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// PUBLIC API: Manual pin tap signal
	// ══════════════════════════════════════════════════════════════════════════════

	const onManualPinTap = () => {
		hasManualTapInSession = true;
		// Double the adaptive delay for the rest of the session
		adaptiveDelay = Math.min(
			cfg.autoOpen.baseDelayMs * cfg.autoOpen.afterManualTapMultiplier,
			cfg.autoOpen.adaptiveMax,
		);
		dbg("manual_pin_tap", { newDelay: adaptiveDelay });
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// PUBLIC API: Drawer closed
	// ══════════════════════════════════════════════════════════════════════════════

	const onDrawerClosed = (venueId) => {
		unlockMapGestures();

		if (state === FSM.DRAWER_OPEN || state === FSM.DRAWER_OPENING) {
			dbg("drawer_closed", { venueId });

			// Track rejection for adaptive delay
			if (venueId) {
				const timeOpen = Date.now() - lastOpenedAt;
				const accepted = timeOpen > 3000; // heuristic: >3s = interested
				acceptanceLog.push({ accepted, ts: Date.now() });
				if (acceptanceLog.length > 20) acceptanceLog.shift();
				updateAdaptiveDelay();
			}

			// Enter cooldown
			cooldownEndAt = Date.now() + cfg.stability.reopenCooldownMs;
			transitionTo(FSM.COOLDOWN);

			cooldownTimer = setTimeout(() => {
				cooldownTimer = null;
				if (state === FSM.COOLDOWN) {
					transitionTo(FSM.IDLE);
					topCandidate = null;
					lockedCandidate = null;
				}
			}, cfg.stability.reopenCooldownMs);
		}
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// PUBLIC API: Drawer fully opened (animation complete)
	// ══════════════════════════════════════════════════════════════════════════════

	const onDrawerOpened = (venueId) => {
		unlockMapGestures();
		transitionTo(FSM.DRAWER_OPEN, { venueId });
		dbg("drawer_open_completed", { venueId });
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// ADAPTIVE DELAY (learns from user acceptance)
	// ══════════════════════════════════════════════════════════════════════════════

	const updateAdaptiveDelay = () => {
		if (acceptanceLog.length < 3) return;
		const recent = acceptanceLog.slice(-10);
		const acceptanceRate =
			recent.filter((e) => e.accepted).length / recent.length;

		// Higher acceptance → shorter delay. Lower → longer.
		const base = cfg.autoOpen.baseDelayMs;
		const { adaptiveMin, adaptiveMax } = cfg.autoOpen;
		adaptiveDelay = base - (acceptanceRate - 0.5) * (adaptiveMax - adaptiveMin);
		adaptiveDelay = Math.min(Math.max(adaptiveDelay, adaptiveMin), adaptiveMax);
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// SETUP / CLEANUP
	// ══════════════════════════════════════════════════════════════════════════════

	let isSetup = false;

	const setup = () => {
		if (isSetup || !mapRef.value) return;
		isSetup = true;

		mapRef.value.on("move", onMapMove);
		mapRef.value.on("moveend", onMapMoveEnd);

		// Start RAF loop
		rafHandle = requestAnimationFrame(runRadar);
		dbg("sentient_map_init", { cfg });
	};

	const destroy = () => {
		if (rafHandle) {
			cancelAnimationFrame(rafHandle);
			rafHandle = null;
		}
		clearAutoOpenTimer();
		if (lockDwellTimer) {
			clearTimeout(lockDwellTimer);
			lockDwellTimer = null;
		}
		if (leaveDwellTimer) {
			clearTimeout(leaveDwellTimer);
			leaveDwellTimer = null;
		}
		if (cooldownTimer) {
			clearTimeout(cooldownTimer);
			cooldownTimer = null;
		}
		if (drawerLockTimer) {
			clearTimeout(drawerLockTimer);
			drawerLockTimer = null;
		}

		abortAllPrefetch();
		unlockMapGestures();

		if (mapRef.value && isSetup) {
			try {
				mapRef.value.off("move", onMapMove);
				mapRef.value.off("moveend", onMapMoveEnd);
			} catch {}
		}

		isSetup = false;
		state = FSM.IDLE;
	};

	// ──────────────────────────────────────────────────────────────────────────────
	// WATCHERS: Auto-setup on map ready + detect drawer state changes
	// ──────────────────────────────────────────────────────────────────────────────

	const stopWatch = watch(
		isMapReadyRef,
		(ready) => {
			if (ready && mapRef.value && !isSetup) {
				// Defer one tick to ensure map is stable
				requestAnimationFrame(setup);
			}
			if (!ready && isSetup) {
				destroy();
			}
		},
		{ immediate: true },
	);

	// Watch highlightedShopId: detect when drawer is actually closed (id goes null)
	const stopHighlightWatch = watch(highlightedShopIdRef, (newId, oldId) => {
		if (oldId != null && newId == null) {
			// Drawer was closed
			onDrawerClosed(oldId);
		}
		if (newId != null && oldId == null) {
			// Drawer opened (may be from manual tap or auto)
			onDrawerOpened(newId);
		}
	});

	onUnmounted(() => {
		stopWatch();
		stopHighlightWatch();
		destroy();
	});

	// ══════════════════════════════════════════════════════════════════════════════
	// HOT UPDATE CONFIG (remote flags)
	// ══════════════════════════════════════════════════════════════════════════════

	const updateConfig = (remoteCfg) => {
		if (!remoteCfg || typeof remoteCfg !== "object") return;
		cfg = mergeDeep(cfg, remoteCfg);
		dbg("config_updated", cfg);
	};

	// ══════════════════════════════════════════════════════════════════════════════
	// RETURN PUBLIC API
	// ══════════════════════════════════════════════════════════════════════════════

	return {
		// State accessors (for debug)
		getFsmState: () => state,
		getLockedCandidate: () => lockedCandidate,
		isEnabled,

		// Public API
		onManualPinTap,
		onDrawerClosed,
		onDrawerOpened,
		destroy,
		updateConfig,
	};
}
