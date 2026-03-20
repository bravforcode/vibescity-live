import { getApiV1BaseUrl } from "../lib/runtimeConfig";

const RUM_ENDPOINT_PATH = "/rum/beacon";
const SESSION_STORAGE_KEY = "vibecity_rum_session";
const MAX_QUEUE_SIZE = 80;
const MAX_DISABLED_BUFFER = 50;
const ENDPOINT_MISSING_STATUS_CODES = new Set([404, 405, 410]);
const PROBE_INTERVAL_MS = Number(
	import.meta.env.VITE_RUM_PROBE_INTERVAL_MS || 30000,
);
const PROBE_TIMEOUT_MS = Number(
	import.meta.env.VITE_RUM_PROBE_TIMEOUT_MS || 3000,
);

let initialized = false;
let sampledIn = false;
let sessionIdHash = "";
let queue = [];
let flushTimer = null;
let endpointUnavailable = false;
let endpointUnavailableStatus = 0;
let disabledBuffer = [];
let probeTimer = null;
let probeInFlight = false;

const context = {
	region_code: "th",
	carrier: "unknown",
	device_tier: "unknown",
	display_refresh_hz: 60,
};

const parseEnvFloat = (raw, fallback) => {
	const value = Number(raw);
	if (!Number.isFinite(value) || value < 0 || value > 1) return fallback;
	return value;
};

const detectSampleRate = () => {
	if (import.meta.env.VITE_RUM_SAMPLE_RATE) {
		return parseEnvFloat(import.meta.env.VITE_RUM_SAMPLE_RATE, 0.1);
	}
	const mode = String(import.meta.env.MODE || "").toLowerCase();
	const isProduction = mode === "production";
	const isStaging = mode.includes("staging") || mode.includes("preview");
	return isProduction && !isStaging ? 0.1 : 1;
};

const simpleHash = (raw) => {
	let hash = 2166136261;
	const input = String(raw || "");
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash +=
			(hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
	}
	return `fnv1a_${(hash >>> 0).toString(16)}`;
};

const sha256 = async (raw) => {
	if (
		typeof crypto === "undefined" ||
		!crypto.subtle ||
		typeof TextEncoder === "undefined"
	) {
		return simpleHash(raw);
	}
	try {
		const encoded = new TextEncoder().encode(String(raw || ""));
		const digest = await crypto.subtle.digest("SHA-256", encoded);
		const bytes = Array.from(new Uint8Array(digest));
		return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
	} catch {
		return simpleHash(raw);
	}
};

const getStoredSession = () => {
	if (typeof sessionStorage === "undefined") return "";
	const existing = String(
		sessionStorage.getItem(SESSION_STORAGE_KEY) || "",
	).trim();
	if (existing) return existing;
	const next = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
	sessionStorage.setItem(SESSION_STORAGE_KEY, next);
	return next;
};

const detectConnectionType = () => {
	if (typeof navigator === "undefined") return "unknown";
	const connection =
		navigator.connection ||
		navigator.mozConnection ||
		navigator.webkitConnection;
	if (!connection) return "unknown";
	return String(connection.effectiveType || connection.type || "unknown");
};

const detectDeviceTier = () => {
	if (typeof navigator === "undefined") return "unknown";
	const cores = Number(navigator.hardwareConcurrency || 0);
	const memory = Number(navigator.deviceMemory || 0);
	if (cores >= 8 && memory >= 8) return "A";
	if (cores >= 4 && memory >= 4) return "B";
	return "C";
};

const detectRefreshHz = () => {
	if (
		typeof window === "undefined" ||
		typeof requestAnimationFrame !== "function"
	) {
		return 60;
	}
	const ratio = Number(window.devicePixelRatio || 1);
	if (ratio >= 2.8) return 120;
	if (ratio >= 2.2) return 90;
	return 60;
};

const toNumber = (value, fallback = undefined) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const sanitizePayload = (payload = {}) => {
	const out = {};
	for (const [key, value] of Object.entries(payload)) {
		if (value === undefined || value === null) continue;
		if (typeof value === "number") {
			if (Number.isFinite(value)) out[key] = value;
			continue;
		}
		if (typeof value === "boolean") {
			out[key] = value;
			continue;
		}
		const str = String(value).trim();
		if (!str) continue;
		out[key] = str.slice(0, 120);
	}
	return out;
};

const pushDisabledBuffer = (payload = {}) => {
	if (!payload || typeof payload !== "object") return;
	disabledBuffer.push(payload);
	if (disabledBuffer.length > MAX_DISABLED_BUFFER) {
		disabledBuffer = disabledBuffer.slice(
			disabledBuffer.length - MAX_DISABLED_BUFFER,
		);
	}
};

const stopProbeTimer = () => {
	if (!probeTimer) return;
	clearInterval(probeTimer);
	probeTimer = null;
};

const createTimeoutSignal = (timeoutMs) => {
	if (typeof AbortController === "undefined") {
		return { signal: undefined, cleanup: () => {} };
	}
	const controller = new AbortController();
	const timer = setTimeout(
		() => {
			controller.abort();
		},
		Math.max(500, Number(timeoutMs || PROBE_TIMEOUT_MS)),
	);
	return {
		signal: controller.signal,
		cleanup: () => clearTimeout(timer),
	};
};

const flushDisabledBuffer = async () => {
	if (endpointUnavailable || disabledBuffer.length === 0) return;
	queue = [...disabledBuffer, ...queue].slice(0, MAX_QUEUE_SIZE);
	disabledBuffer = [];
	await flush();
};

const probeEndpoint = async () => {
	if (!endpointUnavailable) return;
	if (probeInFlight) return;
	probeInFlight = true;
	const endpoint = createEndpointUrl();
	const { signal, cleanup } = createTimeoutSignal(PROBE_TIMEOUT_MS);
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ beacons: [] }),
			signal,
		});
		const status = Number(response.status || 0);
		if (!ENDPOINT_MISSING_STATUS_CODES.has(status)) {
			endpointUnavailable = false;
			endpointUnavailableStatus = 0;
			stopProbeTimer();
			await flushDisabledBuffer();
		}
	} catch {
		// keep disabled
	} finally {
		cleanup();
		probeInFlight = false;
	}
};

const ensureProbeTimer = () => {
	if (!endpointUnavailable) return;
	if (probeTimer) return;
	probeTimer = setInterval(
		() => {
			void probeEndpoint();
		},
		Math.max(5000, PROBE_INTERVAL_MS),
	);
	void probeEndpoint();
};

const markEndpointUnavailable = (status = 0) => {
	if (endpointUnavailable) return;
	endpointUnavailable = true;
	endpointUnavailableStatus = Number(status || 0);
	for (const item of queue) {
		pushDisabledBuffer(item);
	}
	queue = [];
	ensureProbeTimer();
	if (import.meta.env.DEV) {
		console.warn(
			`RUM endpoint unavailable (${endpointUnavailableStatus || "unknown"}); disabling beacons for this session.`,
		);
	}
};

const queueBeacon = (payload = {}) => {
	if (!sampledIn || !sessionIdHash) return;
	if (typeof window === "undefined") return;
	const normalized = sanitizePayload({
		session_id_hash: sessionIdHash,
		region_code: context.region_code,
		carrier: context.carrier,
		device_tier: context.device_tier,
		display_refresh_hz: context.display_refresh_hz,
		connection_type: detectConnectionType(),
		...payload,
	});
	if (endpointUnavailable) {
		pushDisabledBuffer(normalized);
		ensureProbeTimer();
		return;
	}
	queue.push(normalized);
	if (queue.length > MAX_QUEUE_SIZE) {
		queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
	}
	if (!flushTimer) {
		flushTimer = window.setTimeout(() => {
			flushTimer = null;
			void flush();
		}, 1200);
	}
};

const createEndpointUrl = () => `${getApiV1BaseUrl()}${RUM_ENDPOINT_PATH}`;

const flush = async () => {
	if (endpointUnavailable) return;
	if (!queue.length) return;
	const batch = queue.slice(0, 12);
	queue = queue.slice(batch.length);
	const body = JSON.stringify({ beacons: batch });
	const endpoint = createEndpointUrl();
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
			keepalive: true,
		});
		if (!response.ok) {
			if (ENDPOINT_MISSING_STATUS_CODES.has(Number(response.status || 0))) {
				markEndpointUnavailable(response.status);
				return;
			}
			queue = [...batch, ...queue].slice(0, MAX_QUEUE_SIZE);
		}
	} catch {
		queue = [...batch, ...queue].slice(0, MAX_QUEUE_SIZE);
	}
};

const flushOnPageHide = () => {
	if (endpointUnavailable) return;
	if (!queue.length) return;
	const batch = queue.slice(0, 8);
	queue = queue.slice(batch.length);
	const endpoint = createEndpointUrl();
	const payload = JSON.stringify({ beacons: batch });
	try {
		if (navigator.sendBeacon) {
			const blob = new Blob([payload], { type: "application/json" });
			const ok = navigator.sendBeacon(endpoint, blob);
			if (!ok) queue = [...batch, ...queue].slice(0, MAX_QUEUE_SIZE);
			return;
		}
	} catch {
		// Fall through to fetch fallback.
	}
	void fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: payload,
		keepalive: true,
	}).catch(() => {
		queue = [...batch, ...queue].slice(0, MAX_QUEUE_SIZE);
	});
};

const bindBfcacheTracking = () => {
	window.addEventListener("pageshow", (event) => {
		queueBeacon({
			bfcache_hit: Boolean(event.persisted),
		});
	});
	window.addEventListener("pagehide", () => {
		flushOnPageHide();
	});
};

export const rumService = {
	async init() {
		if (initialized) return;
		initialized = true;
		sampledIn = Math.random() <= detectSampleRate();
		if (!sampledIn || typeof window === "undefined") return;
		const session = getStoredSession();
		sessionIdHash = await sha256(session);
		context.device_tier = detectDeviceTier();
		context.display_refresh_hz = detectRefreshHz();
		bindBfcacheTracking();
	},
	setContext(next = {}) {
		if (next.region_code) {
			context.region_code = String(next.region_code).trim().slice(0, 12);
		}
		if (next.carrier) {
			context.carrier = String(next.carrier).trim().slice(0, 40);
		}
		if (next.device_tier) {
			context.device_tier = String(next.device_tier).trim().slice(0, 8);
		}
		const refreshHz = toNumber(next.display_refresh_hz);
		if (Number.isFinite(refreshHz) && refreshHz > 0 && refreshHz < 300) {
			context.display_refresh_hz = Math.round(refreshHz);
		}
	},
	reportMetric(payload = {}) {
		queueBeacon(payload);
	},
	reportTouchLatency(ms) {
		queueBeacon({ touch_to_scroll_start_ms: toNumber(ms, 0) });
	},
	reportCoalescedPointerEvents(eventsPerFrame) {
		queueBeacon({
			coalesced_pointer_events_per_frame: toNumber(eventsPerFrame, 0),
		});
	},
	reportPrefetchHit(hit) {
		queueBeacon({ prefetch_hit: Boolean(hit) });
	},
	reportBatteryModeActive(active) {
		queueBeacon({ battery_mode_active: Boolean(active) });
	},
	reportLoafSample(durationMs) {
		queueBeacon({ loaf_ms_sampled: toNumber(durationMs, 0) });
	},
	async flushNow() {
		if (endpointUnavailable) {
			await probeEndpoint();
			return;
		}
		await flush();
	},
};
