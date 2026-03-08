export const API_VERSION_CONTRACT = Object.freeze({
	version: "v1",
	deprecatedAt: null,
	sunsetAt: null,
});

export const isApiEnvelope = (payload) =>
	Boolean(
		payload &&
			typeof payload === "object" &&
			!Array.isArray(payload) &&
			Object.hasOwn(payload, "data") &&
			Object.hasOwn(payload, "meta"),
	);

export const unwrapApiEnvelope = (payload) => {
	if (!isApiEnvelope(payload)) {
		return {
			data: payload,
			meta: {
				version: API_VERSION_CONTRACT.version,
				requestId: "",
				timestamp: new Date().toISOString(),
				deprecatedAt: API_VERSION_CONTRACT.deprecatedAt,
				sunsetAt: API_VERSION_CONTRACT.sunsetAt,
			},
			errors: [],
		};
	}

	const errors = Array.isArray(payload.errors) ? payload.errors : [];
	return {
		data: payload.data,
		meta: {
			version:
				payload?.meta?.version ||
				payload?.meta?.apiVersion ||
				API_VERSION_CONTRACT.version,
			requestId: String(
				payload?.meta?.requestId || payload?.meta?.request_id || "",
			),
			timestamp: String(payload?.meta?.timestamp || new Date().toISOString()),
			deprecatedAt: payload?.meta?.deprecatedAt || null,
			sunsetAt: payload?.meta?.sunsetAt || null,
		},
		errors,
	};
};

export const toApiEnvelope = (data, overrides = {}) => ({
	data,
	meta: {
		version: overrides.version || API_VERSION_CONTRACT.version,
		requestId: overrides.requestId || "",
		timestamp: overrides.timestamp || new Date().toISOString(),
		deprecatedAt: overrides.deprecatedAt ?? API_VERSION_CONTRACT.deprecatedAt,
		sunsetAt: overrides.sunsetAt ?? API_VERSION_CONTRACT.sunsetAt,
	},
	errors: Array.isArray(overrides.errors) ? overrides.errors : [],
});
