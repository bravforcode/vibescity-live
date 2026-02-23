const LOCALHOST_PATTERN = /(localhost|127\.0\.0\.1)/i;
const PLACEHOLDER_PATTERN = /<[^>]+>/; // Detects <api-app>, <your-key>, etc.
const IS_E2E = import.meta.env?.VITE_E2E === "true";
const WS_REQUIRED = import.meta.env?.VITE_WS_REQUIRED === "true";
const WS_DEV_AUTOCONNECT = import.meta.env?.VITE_WS_DEV_AUTOCONNECT !== "false";
const WS_CONFIG_DEBUG = import.meta.env?.VITE_WS_CONFIG_DEBUG === "true";
const IS_LOCAL_HOST =
	typeof window !== "undefined" &&
	LOCALHOST_PATTERN.test(window.location.hostname);

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const sanitize = (value) => {
	if (typeof value !== "string") return "";
	return value.trim();
};

const rewriteLocalhostHostnameForDev = (rawValue) => {
	if (!import.meta.env.DEV) return rawValue;
	if (typeof window === "undefined") return rawValue;

	const currentHost = sanitize(window.location?.hostname);
	if (!currentHost || LOCALHOST_PATTERN.test(currentHost)) return rawValue;

	try {
		const url = new URL(rawValue);
		if (LOCALHOST_PATTERN.test(url.hostname)) {
			url.hostname = currentHost;
			return url.toString();
		}
	} catch {
		// ignore
	}

	return rawValue;
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

	return "https://vibecity.live";
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
		throw new Error(
			`${name} points to localhost in production. Configure a public endpoint.`,
		);
	}

	return rawValue;
};

export const getApiBaseUrl = () => {
	// Prefer static access for bundler compatibility
	const explicit = import.meta.env.VITE_API_URL;
	if (explicit) {
		return trimTrailingSlash(rewriteLocalhostHostnameForDev(explicit));
	}

	const raw = requireClientEnv("VITE_API_URL", {
		message: "VITE_API_URL is required for API calls.",
	});
	return trimTrailingSlash(rewriteLocalhostHostnameForDev(raw));
};

export const getApiV1BaseUrl = () => {
	const base = getApiBaseUrl();
	return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
};

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
				throw new Error(
					"VITE_SUPABASE_EDGE_URL points to localhost in production.",
				);
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
			throw new Error("VITE_WS_URL is required when VITE_WS_REQUIRED=true");
		}
		if (import.meta.env.DEV && WS_CONFIG_DEBUG) {
			console.warn("⚠️ VITE_WS_URL not set - realtime features disabled");
		}
		return "";
	}

	// In local dev, only auto-connect WS when explicitly enabled.
	if (
		import.meta.env.DEV &&
		LOCALHOST_PATTERN.test(ws) &&
		!WS_DEV_AUTOCONNECT
	) {
		return "";
	}

	// Placeholder check (critical for production safety)
	if (PLACEHOLDER_PATTERN.test(ws)) {
		if (WS_REQUIRED) {
			throw new Error(`VITE_WS_URL contains placeholder value: ${ws}`);
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
			throw new Error(`VITE_WS_URL has invalid protocol: ${ws}`);
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
			throw new Error("VITE_WS_URL points to localhost in production");
		}
		if (WS_CONFIG_DEBUG)
			console.warn(
				"⚠️ VITE_WS_URL points to localhost in production - realtime disabled",
			);
		return "";
	}

	return rewriteLocalhostHostnameForDev(ws);
};
