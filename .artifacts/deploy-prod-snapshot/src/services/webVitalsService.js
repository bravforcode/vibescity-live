import { analyticsService } from "./analyticsService";

const VITALS = new Set(["LCP", "INP", "CLS"]);
let initialized = false;
let sampledIn = false;
let frameBudgetMissCount = 0;
let longTaskCount = 0;
let rafMonitorId = null;
let longTaskObserver = null;
let lastFrameTs = 0;

const runtimeContext = {
	route: "",
	deviceTier: "",
	mapMode: "full",
};

const parseEnvFloat = (raw, fallback) => {
	const v = Number(raw);
	return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
};

const detectSampleRate = () => {
	if (import.meta.env.VITE_WEB_VITALS_SAMPLE_RATE) {
		return parseEnvFloat(import.meta.env.VITE_WEB_VITALS_SAMPLE_RATE, 0.1);
	}
	const mode = String(import.meta.env.MODE || "").toLowerCase();
	const isProd = mode === "production";
	const isStaging = mode.includes("staging") || mode.includes("preview");
	return isProd && !isStaging ? 0.1 : 1.0;
};

const getDeviceFormFactor = () => {
	if (typeof navigator === "undefined") return "desktop";
	const ua = (navigator.userAgent || "").toLowerCase();
	if (/mobile|android|iphone|ipad|ipod/.test(ua)) return "mobile";
	return "desktop";
};

const getConnectionType = () => {
	if (typeof navigator === "undefined") return "unknown";
	const connection =
		navigator.connection ||
		navigator.mozConnection ||
		navigator.webkitConnection;
	if (!connection) return "unknown";
	return connection.effectiveType || connection.type || "unknown";
};

const getDeviceTier = () => {
	if (typeof navigator === "undefined") return "unknown";
	const cores = Number(navigator.hardwareConcurrency || 0);
	const memory = Number(navigator.deviceMemory || 0);
	if (cores >= 8 && memory >= 8) return "high";
	if (cores >= 4 && memory >= 4) return "mid";
	return "low";
};

const getPathTemplate = () => {
	const path = String(window.location.pathname || "/");
	const parts = path.split("/").filter(Boolean);
	if (parts.length === 0) return "/";
	if (parts[0] === "th" || parts[0] === "en") parts.shift();
	if (parts[0] === "v" && parts[1]) return "/v/*";
	if (parts[0] === "venue" && parts[1]) return "/venue/*";
	if (parts[0] === "c" && parts[1]) return "/c/*";
	return `/${parts.join("/")}`;
};

const startFrameBudgetMonitor = () => {
	if (rafMonitorId !== null) return;
	const loop = (ts) => {
		if (lastFrameTs > 0 && ts - lastFrameTs > 50) {
			frameBudgetMissCount += 1;
		}
		lastFrameTs = ts;
		rafMonitorId = requestAnimationFrame(loop);
	};
	rafMonitorId = requestAnimationFrame(loop);
};

const startLongTaskObserver = () => {
	if (
		typeof PerformanceObserver === "undefined" ||
		!PerformanceObserver.supportedEntryTypes?.includes("longtask")
	) {
		return;
	}
	if (longTaskObserver) return;
	try {
		longTaskObserver = new PerformanceObserver((list) => {
			const entries = list.getEntries();
			if (entries?.length) {
				longTaskCount += entries.length;
			}
		});
		longTaskObserver.observe({ type: "longtask", buffered: true });
	} catch {
		longTaskObserver = null;
	}
};

const reportVital = (metricName, value) => {
	if (!VITALS.has(metricName)) return;
	if (!Number.isFinite(value)) return;
	analyticsService.trackWebVital({
		metric_name: metricName,
		value,
		path_template: getPathTemplate(),
		device_form_factor: getDeviceFormFactor(),
		connection_type: getConnectionType(),
		route: runtimeContext.route || getPathTemplate(),
		deviceTier: runtimeContext.deviceTier || getDeviceTier(),
		mapMode: runtimeContext.mapMode || "full",
		frameBudgetMissCount,
		longTaskCount,
	});
};

const observeLcp = () => {
	let lastLcp = null;
	const observer = new PerformanceObserver((list) => {
		const entries = list.getEntries();
		lastLcp = entries[entries.length - 1];
	});
	observer.observe({ type: "largest-contentful-paint", buffered: true });

	const flush = () => {
		if (lastLcp?.startTime) reportVital("LCP", lastLcp.startTime);
		observer.disconnect();
	};
	document.addEventListener(
		"visibilitychange",
		() => {
			if (document.visibilityState === "hidden") flush();
		},
		{ once: true },
	);
};

const observeCls = () => {
	let cls = 0;
	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			if (!entry.hadRecentInput) cls += entry.value;
		}
	});
	observer.observe({ type: "layout-shift", buffered: true });

	document.addEventListener(
		"visibilitychange",
		() => {
			if (document.visibilityState === "hidden") {
				reportVital("CLS", cls);
				observer.disconnect();
			}
		},
		{ once: true },
	);
};

const observeInp = () => {
	if (!PerformanceObserver.supportedEntryTypes?.includes("event")) return;
	let maxDuration = 0;
	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			if (entry.duration > maxDuration) {
				maxDuration = entry.duration;
			}
		}
	});
	observer.observe({ type: "event", durationThreshold: 40, buffered: true });
	document.addEventListener(
		"visibilitychange",
		() => {
			if (document.visibilityState === "hidden") {
				if (maxDuration > 0) reportVital("INP", maxDuration);
				observer.disconnect();
			}
		},
		{ once: true },
	);
};

export const webVitalsService = {
	setContext(next = {}) {
		if (next?.route != null) {
			runtimeContext.route = String(next.route || "");
		}
		if (next?.deviceTier != null) {
			runtimeContext.deviceTier = String(next.deviceTier || "");
		}
		if (next?.mapMode != null) {
			runtimeContext.mapMode = String(next.mapMode || "full");
		}
		if (Number.isFinite(next?.frameBudgetMissCount)) {
			frameBudgetMissCount = Number(next.frameBudgetMissCount);
		}
		if (Number.isFinite(next?.longTaskCount)) {
			longTaskCount = Number(next.longTaskCount);
		}
	},
	init() {
		if (initialized) return;
		initialized = true;
		sampledIn = Math.random() <= detectSampleRate();
		if (!sampledIn) return;
		if (
			typeof window === "undefined" ||
			typeof PerformanceObserver === "undefined"
		)
			return;
		runtimeContext.route = getPathTemplate();
		runtimeContext.deviceTier = getDeviceTier();
		startFrameBudgetMonitor();
		startLongTaskObserver();

		try {
			observeLcp();
			observeCls();
			observeInp();
		} catch {
			// fail-open
		}
	},
	getSnapshot() {
		return {
			enabled: initialized && sampledIn,
			route: runtimeContext.route || getPathTemplate(),
			deviceTier: runtimeContext.deviceTier || getDeviceTier(),
			mapMode: runtimeContext.mapMode || "full",
			frameBudgetMissCount,
			longTaskCount,
		};
	},
};
