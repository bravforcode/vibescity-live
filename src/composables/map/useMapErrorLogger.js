import { BUILD_VERSION } from "@/utils/buildVersion";

const DEFAULT_DEDUPE_WINDOW_MS = 8000;

const buildErrorMessage = (error) => {
	if (!error) return "unknown_error";
	if (typeof error === "string") return error.slice(0, 300);
	return String(error.message || error.code || error).slice(0, 300);
};

export function useMapErrorLogger(options = {}) {
	const dedupeWindowMs = Number(
		options.dedupeWindowMs || DEFAULT_DEDUPE_WINDOW_MS,
	);
	const onTelemetry =
		typeof options.onTelemetry === "function" ? options.onTelemetry : null;
	const dedupeMap = new Map();

	const buildDedupeKey = (type, message, context = {}) => {
		const url = String(context.url || "").slice(0, 180);
		const layerId = String(context.layerId || "");
		const sourceId = String(context.sourceId || "");
		return `${String(type || "unknown")}::${message}::${url}::${layerId}::${sourceId}`;
	};

	const shouldSuppress = (type, error, context = {}) => {
		const message = buildErrorMessage(error);
		const key = buildDedupeKey(type, message, context);
		const now = Date.now();
		const lastSeen = Number(dedupeMap.get(key) || 0);
		if (lastSeen > 0 && now - lastSeen < dedupeWindowMs) {
			return true;
		}
		dedupeMap.set(key, now);
		return false;
	};

	const logMapError = (type, error, context = {}) => {
		if (shouldSuppress(type, error, context)) return false;
		const entry = {
			type: String(type || "unknown"),
			message: buildErrorMessage(error),
			url: String(context.url || ""),
			layerId: String(context.layerId || ""),
			sourceId: String(context.sourceId || ""),
			shopId: String(context.shopId || ""),
			zoom: Number(context.zoom ?? Number.NaN),
			lod: String(context.lod || ""),
			viewport: context.viewport || null,
			sessionId: String(context.sessionId || ""),
			buildVersion: BUILD_VERSION,
			timestamp: Date.now(),
		};

		if (import.meta.env.DEV) {
			console.warn(`[MapError:${entry.type}]`, entry.message, context);
		}

		try {
			onTelemetry?.(entry);
		} catch {
			// Never throw from logger.
		}
		return true;
	};

	return {
		logMapError,
		shouldSuppress,
	};
}
