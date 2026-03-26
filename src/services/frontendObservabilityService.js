import { analyticsService } from "./analyticsService";

const DEDUPE_WINDOW_MS = 5000;
const recentEventMap = new Map();

const asObject = (value) =>
	value && typeof value === "object" && !Array.isArray(value) ? value : {};

const dedupeKeyFor = (eventType, metadata = {}) =>
	`${eventType}:${metadata.reason || ""}:${metadata.phase || ""}:${metadata.route || ""}`;

const shouldEmit = (eventType, metadata = {}) => {
	const now = Date.now();
	const key = dedupeKeyFor(eventType, metadata);
	const prev = Number(recentEventMap.get(key) || 0);
	if (now - prev < DEDUPE_WINDOW_MS) return false;
	recentEventMap.set(key, now);
	return true;
};

const sanitizeMetadata = (metadata = {}) => {
	const safe = {};
	for (const [key, value] of Object.entries(asObject(metadata))) {
		if (value === undefined || value === null) continue;
		if (typeof value === "number" || typeof value === "boolean") {
			safe[key] = value;
			continue;
		}
		const str = String(value).trim();
		if (!str) continue;
		safe[key] = str.slice(0, 160);
	}
	return safe;
};

const emit = async (eventType, metadata = {}) => {
	if (!shouldEmit(eventType, metadata)) return;
	try {
		await analyticsService.trackEvent(eventType, sanitizeMetadata(metadata));
	} catch {
		// fail-open
	}
};

export const frontendObservabilityService = {
	reportMapLifecycle(eventType, metadata = {}) {
		return emit(`map_${String(eventType || "unknown")}`, {
			...metadata,
			source: "map",
		});
	},
	reportServiceWorker(eventType, metadata = {}) {
		return emit(`sw_${String(eventType || "unknown")}`, {
			...metadata,
			source: "service_worker",
		});
	},
	reportFrontendGuardrail(eventType, metadata = {}) {
		return emit(`guardrail_${String(eventType || "unknown")}`, {
			...metadata,
			source: "frontend_guardrail",
		});
	},
	reportPartnerRoute(eventType, metadata = {}) {
		return emit(`partner_${String(eventType || "unknown")}`, {
			...metadata,
			source: "partner_route",
		});
	},
	/**
	 * Track map performance metrics after first map idle event.
	 * Called once per session via requestIdleCallback from MapLibreContainer.
	 * All values are optional — missing fields are omitted from the payload.
	 *
	 * @param {{ fcp?: number, lcp?: number, mapInteractive?: number, parseOverhead?: number, sentientLoadTime?: number, heatmapLoadTime?: number, chunkSizeBytes?: number }} metrics
	 */
	trackMapPerformance(metrics = {}) {
		const payload = {
			fcp_ms:
				typeof metrics.fcp === "number" ? Math.round(metrics.fcp) : undefined,
			lcp_ms:
				typeof metrics.lcp === "number" ? Math.round(metrics.lcp) : undefined,
			map_interactive_ms:
				typeof metrics.mapInteractive === "number"
					? Math.round(metrics.mapInteractive)
					: undefined,
			parse_overhead_ms:
				typeof metrics.parseOverhead === "number"
					? Math.round(metrics.parseOverhead)
					: undefined,
			sentient_load_ms:
				typeof metrics.sentientLoadTime === "number"
					? Math.round(metrics.sentientLoadTime)
					: undefined,
			heatmap_load_ms:
				typeof metrics.heatmapLoadTime === "number"
					? Math.round(metrics.heatmapLoadTime)
					: undefined,
			cpu_cores:
				typeof navigator !== "undefined"
					? (navigator.hardwareConcurrency ?? null)
					: null,
			memory_gb:
				typeof navigator !== "undefined"
					? (navigator.deviceMemory ?? null)
					: null,
		};

		// Strip undefined values so emit sanitizer receives a clean object
		const clean = Object.fromEntries(
			Object.entries(payload).filter(([, v]) => v !== undefined),
		);

		return emit("map_performance_metrics", { ...clean, source: "map" });
	},
};
