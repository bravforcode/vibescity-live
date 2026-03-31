const CAPABILITY_TTL_MS = 5 * 60 * 1000;
const CAPABILITY_PROBE_TIMEOUT_MS = 5000;
const CAPABILITY_PROBE_ENABLED =
	import.meta.env.VITE_SUPABASE_CAPABILITY_PROBE !== "false";
const CAPABILITY_DEBUG =
	import.meta.env.VITE_SUPABASE_CAPABILITY_DEBUG === "true";

const sanitize = (value) =>
	typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";

const DEFAULT_WHEN_UNKNOWN = !import.meta.env.DEV;

const state = {
	fetchedAt: 0,
	probed: false,
	rpcs: new Set(),
	tables: new Set(),
	inFlight: null,
};

const getSupabaseEnv = () => {
	const url = sanitize(import.meta.env.VITE_SUPABASE_URL || "");
	const anonKey = sanitize(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
	return { url, anonKey };
};

const extractPathName = (path) => {
	if (!path || typeof path !== "string") return "";
	return path.replace(/^\//, "").split("?")[0];
};

const applyOpenApiPaths = (paths) => {
	const nextRpcs = new Set();
	const nextTables = new Set();

	for (const rawPath of Object.keys(paths || {})) {
		const normalizedPath = extractPathName(rawPath);
		if (!normalizedPath) continue;

		const segments = normalizedPath.split("/").filter(Boolean);
		if (!segments.length) continue;

		if (segments[0] === "rpc") {
			const fnName = segments[1];
			if (fnName) nextRpcs.add(fnName);
			continue;
		}

		const tableName = segments[0];
		if (!tableName.startsWith(":")) {
			nextTables.add(tableName);
		}
	}

	state.rpcs = nextRpcs;
	state.tables = nextTables;
	state.probed = true;
	state.fetchedAt = Date.now();
};

const hasFreshSnapshot = () =>
	state.probed && Date.now() - state.fetchedAt < CAPABILITY_TTL_MS;

const fetchOpenApiSchema = async () => {
	const { url, anonKey } = getSupabaseEnv();
	if (!url || !anonKey) {
		return null;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(new Error("capability_probe_timeout")),
		CAPABILITY_PROBE_TIMEOUT_MS,
	);

	try {
		const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
			method: "GET",
			headers: {
				apikey: anonKey,
				Authorization: `Bearer ${anonKey}`,
				Accept: "application/openapi+json, application/json",
			},
			signal: controller.signal,
			cache: "no-store",
		});

		if (!res.ok) {
			return null;
		}

		const payload = await res.json().catch(() => null);
		if (!payload || typeof payload !== "object") return null;
		return payload;
	} finally {
		clearTimeout(timeoutId);
	}
};

export const ensureSupabaseCapabilities = async ({ force = false } = {}) => {
	if (!CAPABILITY_PROBE_ENABLED) {
		return {
			probed: false,
			rpcs: state.rpcs,
			tables: state.tables,
		};
	}

	if (!force && hasFreshSnapshot()) {
		return {
			probed: state.probed,
			rpcs: state.rpcs,
			tables: state.tables,
		};
	}

	if (state.inFlight) {
		return state.inFlight;
	}

	state.inFlight = (async () => {
		try {
			const payload = await fetchOpenApiSchema();
			if (payload?.paths && typeof payload.paths === "object") {
				applyOpenApiPaths(payload.paths);
			} else {
				state.fetchedAt = Date.now();
			}
		} catch (error) {
			if (CAPABILITY_DEBUG && import.meta.env.DEV) {
				console.debug("[supabaseCapabilities] probe failed:", error);
			}
			state.fetchedAt = Date.now();
		} finally {
			state.inFlight = null;
		}

		return {
			probed: state.probed,
			rpcs: state.rpcs,
			tables: state.tables,
		};
	})();

	return state.inFlight;
};

export const hasSupabaseRpc = async (
	fnName,
	{ force = false, defaultWhenUnknown = DEFAULT_WHEN_UNKNOWN } = {},
) => {
	const normalized = String(fnName || "").trim();
	if (!normalized) return false;

	const snapshot = await ensureSupabaseCapabilities({ force });
	if (!snapshot.probed) return defaultWhenUnknown;
	return snapshot.rpcs.has(normalized);
};

export const hasSupabaseTable = async (
	tableName,
	{ force = false, defaultWhenUnknown = DEFAULT_WHEN_UNKNOWN } = {},
) => {
	const normalized = String(tableName || "").trim();
	if (!normalized) return false;

	const snapshot = await ensureSupabaseCapabilities({ force });
	if (!snapshot.probed) return defaultWhenUnknown;
	return snapshot.tables.has(normalized);
};

export const defaultSupabaseCapabilityFallback = DEFAULT_WHEN_UNKNOWN;
