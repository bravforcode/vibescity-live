import i18n from "@/i18n.js";

const LOCALHOST_PATTERN = /(localhost|127\.0\.0\.1|\[::1\]|::1)/i;
const PLACEHOLDER_PATTERN = /<[^>]+>/; // Detects <api-app>, <your-key>, etc.

const normalizeHostname = (value) =>
	String(value ?? "")
		.trim()
		.replace(/^\[/, "")
		.replace(/\]$/, "")
		.toLowerCase();

const parseIpv4Hostname = (value) => {
	const normalized = normalizeHostname(value);
	if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return null;
	const octets = normalized.split(".").map((segment) => Number(segment));
	return octets.every((segment) => Number.isInteger(segment) && segment <= 255)
		? octets
		: null;
};

const isLoopbackBrowserHostname = (value) => {
	const normalized = normalizeHostname(value);
	if (!normalized) return false;
	if (normalized === "localhost" || normalized === "::1") return true;
	const octets = parseIpv4Hostname(normalized);
	return Array.isArray(octets) ? octets[0] === 127 : false;
};

export const isLocalBrowserHostname = (value) => {
	const normalized = normalizeHostname(value);
	if (!normalized) return false;
	if (isLoopbackBrowserHostname(normalized)) return true;
	if (normalized.endsWith(".local")) return true;
	const octets = parseIpv4Hostname(normalized);
	if (!Array.isArray(octets)) return false;
	const [first, second] = octets;
	if (first === 10) return true;
	if (first === 192 && second === 168) return true;
	if (first === 172 && second >= 16 && second <= 31) return true;
	if (first === 169 && second === 254) return true;
	return false;
};

export const isPublicBrowserHostname = (value) => {
	const normalized = normalizeHostname(value);
	if (!normalized) return false;
	return !isLocalBrowserHostname(normalized);
};

export const getCurrentBrowserHostname = () =>
	typeof window !== "undefined"
		? normalizeHostname(window.location?.hostname)
		: "";

const parseEnvBoolean = (value) => {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return null;
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	return null;
};

const IS_E2E = import.meta.env?.VITE_E2E === "true";
const API_DEV_PROXY_ENABLED = import.meta.env?.VITE_API_PROXY_DEV === "true";
const VISITOR_BOOTSTRAP_DEV_ENABLED =
	import.meta.env?.VITE_VISITOR_BOOTSTRAP_DEV === "true";
const DIRECTIONS_DEV_ENABLED = import.meta.env?.VITE_DIRECTIONS_DEV === "true";
const WS_REQUIRED = import.meta.env?.VITE_WS_REQUIRED === "true";
const WS_DEV_AUTOCONNECT = import.meta.env?.VITE_WS_DEV_AUTOCONNECT === "true";
const WS_CONFIG_DEBUG = import.meta.env?.VITE_WS_CONFIG_DEBUG === "true";
const LOCAL_DEV_REAL_GEO_ENABLED = parseEnvBoolean(
	import.meta.env?.VITE_LOCAL_DEV_REAL_GEO,
);
const IS_LOCAL_HOST = isLocalBrowserHostname(getCurrentBrowserHostname());

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const sanitize = (value) => {
	if (typeof value !== "string") return "";
	return value.trim();
};

const getDevApiProxyBaseUrl = () => {
	if (typeof window === "undefined") return "";
	return `${trimTrailingSlash(window.location.origin)}/api`;
};

const rewriteLocalhostHostnameForDev = (rawValue) => {
	if (!import.meta.env.DEV) return rawValue;
	if (typeof window === "undefined") return rawValue;

	const currentHost = getCurrentBrowserHostname();
	if (!currentHost || isLoopbackBrowserHostname(currentHost)) return rawValue;

	try {
		const url = new URL(rawValue);
		if (isLoopbackBrowserHostname(url.hostname)) {
			url.hostname = currentHost;
			return url.toString();
		}
	} catch {
		// ignore
	}

	return rawValue;
};

const shouldPreferDevApiProxy = (rawValue) => {
	if (!import.meta.env.DEV || typeof window === "undefined") return false;
	if (!API_DEV_PROXY_ENABLED) return false;
	if (!isLocalBrowserHostname(window.location.hostname)) return false;

	const value = sanitize(rawValue);
	if (!value) return true;
	if (value.startsWith("/")) return false;

	try {
		const url = new URL(
			rewriteLocalhostHostnameForDev(value),
			window.location.origin,
		);
		const sameOrigin = url.origin === window.location.origin;
		const localTarget = isLocalBrowserHostname(url.hostname);
		return !sameOrigin && !localTarget;
	} catch {
		return false;
	}
};

/**
 * Validates URL format and checks for placeholder patterns
 * @param {string} value - URL to validate
 * @param {string} name - Env var name for error messages
 * @returns {{valid: boolean, reason?: string}}
 */
const validateUrl = (value, name) => {
	if (!value) return { valid: false, reason: "empty" };
	if (PLACEHOLDER_PATTERN.test(value)) {
		return {
			valid: false,
			reason: `${name} contains placeholder value: ${value}`,
		};
	}
	return { valid: true };
};

const resolveExplicitApiBaseUrl = () => {
	const explicit = import.meta.env.VITE_API_URL;
	if (explicit) {
		return trimTrailingSlash(rewriteLocalhostHostnameForDev(explicit));
	}

	const raw = requireClientEnv("VITE_API_URL", {
		message: "VITE_API_URL is required for API calls.",
	});
	return trimTrailingSlash(rewriteLocalhostHostnameForDev(raw));
};

export const getSiteOrigin = (options = {}) => {
	const { allowDevWindowFallback = false } = options;
	const explicit =
		sanitize(import.meta.env?.VITE_SITE_ORIGIN) ||
		sanitize(import.meta.env?.SITE_ORIGIN);

	if (explicit) {
		const check = validateUrl(explicit, "VITE_SITE_ORIGIN");
		if (!check.valid) {
			throw new Error(check.reason);
		}
		return trimTrailingSlash(explicit);
	}

	if (
		allowDevWindowFallback &&
		import.meta.env.DEV &&
		typeof window !== "undefined"
	) {
		return trimTrailingSlash(window.location.origin);
	}

	return "https://vibescity.live";
};

export const requireClientEnv = (name, options = {}) => {
	const { allowLocalhostInProd = false, message = `${name} is required` } =
		options;

	const rawValue = sanitize(import.meta.env?.[name]);
	if (!rawValue) {
		throw new Error(message);
	}

	// Check for placeholder patterns
	const urlCheck = validateUrl(rawValue, name);
	if (!urlCheck.valid) {
		throw new Error(urlCheck.reason);
	}

	if (
		import.meta.env.PROD &&
		!allowLocalhostInProd &&
		!IS_E2E &&
		!IS_LOCAL_HOST &&
		LOCALHOST_PATTERN.test(rawValue)
	) {
		const errStr = `ERR_LOCALHOST_PROD: ${name}`;
		throw new Error(errStr);
	}

	return rawValue;
};

export const getApiBaseUrl = () => {
	const directBase = resolveExplicitApiBaseUrl();
	if (shouldPreferDevApiProxy(directBase)) {
		return getDevApiProxyBaseUrl();
	}
	if (!directBase && shouldPreferDevApiProxy("")) {
		return getDevApiProxyBaseUrl();
	}
	return directBase;
};

export const getApiV1BaseUrl = () => {
	const base = getApiBaseUrl();
	if (base.endsWith("/api/v1")) return base;
	if (base.endsWith("/api")) return `${base}/v1`;
	return `${base}/api/v1`;
};

export const shouldAvoidCrossOriginApiOnPublicHost = ({
	baseUrl = getApiV1BaseUrl(),
	currentOrigin = typeof window !== "undefined" ? window.location.origin : "",
	currentHostname = typeof window !== "undefined"
		? window.location.hostname
		: "",
	isProd = import.meta.env.PROD,
} = {}) => {
	if (!isProd || !currentOrigin || !currentHostname) return false;
	if (!isPublicBrowserHostname(currentHostname)) return false;

	try {
		const parsed = new URL(baseUrl, currentOrigin);
		return parsed.origin !== currentOrigin;
	} catch {
		return false;
	}
};

export const getDirectApiBaseUrl = () => resolveExplicitApiBaseUrl();

export const isFrontendOnlyDevMode = () =>
	!IS_E2E &&
	IS_LOCAL_HOST &&
	!API_DEV_PROXY_ENABLED &&
	!VISITOR_BOOTSTRAP_DEV_ENABLED &&
	!DIRECTIONS_DEV_ENABLED;

export const shouldBypassDirectBrowserSupabaseReads = () =>
	isFrontendOnlyDevMode() ||
	(typeof window !== "undefined" &&
		import.meta.env.PROD &&
		isPublicBrowserHostname(window.location.hostname));

export const shouldPreferRealLocalDevLocation = () =>
	isFrontendOnlyDevMode() && LOCAL_DEV_REAL_GEO_ENABLED !== false;

export const shouldUseDeterministicLocalDevLocation = () =>
	isFrontendOnlyDevMode() && LOCAL_DEV_REAL_GEO_ENABLED === false;

export const getSupabaseEdgeBaseUrl = () => {
	const explicitEdge = sanitize(import.meta.env.VITE_SUPABASE_EDGE_URL);
	if (explicitEdge) {
		const check = validateUrl(explicitEdge, "VITE_SUPABASE_EDGE_URL");
		if (!check.valid) {
			if (import.meta.env.DEV) console.warn(`⚠️ ${check.reason}`);
			// Fall through to construct from VITE_SUPABASE_URL
		} else {
			if (
				import.meta.env.PROD &&
				!IS_E2E &&
				!IS_LOCAL_HOST &&
				LOCALHOST_PATTERN.test(explicitEdge)
			) {
				throw new Error("ERR_EDGE_LOCALHOST");
			}
			return trimTrailingSlash(explicitEdge);
		}
	}

	const supabaseBase = trimTrailingSlash(
		requireClientEnv("VITE_SUPABASE_URL", {
			message:
				"VITE_SUPABASE_EDGE_URL or VITE_SUPABASE_URL is required for Edge Functions.",
		}),
	);

	return `${supabaseBase}/functions/v1`;
};

/**
 * Get WebSocket URL - FAIL-OPEN for optional realtime features
 * Returns empty string if invalid/missing (app continues without realtime)
 */
export const getWebSocketUrl = () => {
	// E2E strict lane should not attempt realtime connections.
	if (IS_E2E) return "";

	const ws = sanitize(import.meta.env.VITE_WS_URL);

	// Empty check
	if (!ws) {
		if (WS_REQUIRED) {
			throw new Error(i18n.global.t("auto.k_fd5265d"));
		}
		if (import.meta.env.DEV && WS_CONFIG_DEBUG) {
			console.warn("⚠️ VITE_WS_URL not set - realtime features disabled");
		}
		return "";
	}

	// In local localhost dev, keep realtime opt-in to avoid noisy failed sockets
	// when the frontend runs without the matching backend websocket service.
	if (import.meta.env.DEV && IS_LOCAL_HOST && !WS_DEV_AUTOCONNECT) {
		return "";
	}

	// Placeholder check (critical for production safety)
	if (PLACEHOLDER_PATTERN.test(ws)) {
		if (WS_REQUIRED) {
			throw new Error(i18n.global.t("auto.k_d8841bbf"));
		}
		if (WS_CONFIG_DEBUG)
			console.warn(
				`⚠️ VITE_WS_URL contains placeholder: ${ws} - realtime disabled`,
			);
		return "";
	}

	// Protocol check
	if (!ws.startsWith("ws://") && !ws.startsWith("wss://")) {
		if (WS_REQUIRED) {
			throw new Error(i18n.global.t("auto.k_98debb2f"));
		}
		if (WS_CONFIG_DEBUG)
			console.warn(
				`⚠️ VITE_WS_URL has invalid protocol: ${ws} - realtime disabled`,
			);
		return "";
	}

	// Localhost in production check
	if (
		import.meta.env.PROD &&
		!IS_E2E &&
		!IS_LOCAL_HOST &&
		LOCALHOST_PATTERN.test(ws)
	) {
		if (WS_REQUIRED) {
			throw new Error(i18n.global.t("auto.k_b6b54c57"));
		}
		if (WS_CONFIG_DEBUG)
			console.warn(
				"⚠️ VITE_WS_URL points to localhost in production - realtime disabled",
			);
		return "";
	}

	return rewriteLocalhostHostnameForDev(ws);
};
