import { analyticsService } from "./analyticsService";

const VITALS = new Set(["LCP", "INP", "CLS"]);
let initialized = false;

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
	const ua = (navigator.userAgent || "").toLowerCase();
	if (/mobile|android|iphone|ipad|ipod/.test(ua)) return "mobile";
	return "desktop";
};

const getConnectionType = () => {
	const connection =
		navigator.connection ||
		navigator.mozConnection ||
		navigator.webkitConnection;
	if (!connection) return "unknown";
	return connection.effectiveType || connection.type || "unknown";
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

const reportVital = (metricName, value) => {
	if (!VITALS.has(metricName)) return;
	if (!Number.isFinite(value)) return;
	analyticsService.trackWebVital({
		metric_name: metricName,
		value,
		path_template: getPathTemplate(),
		device_form_factor: getDeviceFormFactor(),
		connection_type: getConnectionType(),
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
	init() {
		if (initialized) return;
		initialized = true;
		if (Math.random() > detectSampleRate()) return;
		if (
			typeof window === "undefined" ||
			typeof PerformanceObserver === "undefined"
		)
			return;

		try {
			observeLcp();
			observeCls();
			observeInp();
		} catch {
			// fail-open
		}
	},
};
