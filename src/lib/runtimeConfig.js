const LOCALHOST_PATTERN = /(localhost|127\.0\.0\.1)/i;
const PLACEHOLDER_PATTERN = /<[^>]+>/; // Detects <api-app>, <your-key>, etc.
const IS_E2E = import.meta.env?.VITE_E2E === "true";
const IS_LOCAL_HOST =
	typeof window !== "undefined" &&
	LOCALHOST_PATTERN.test(window.location.hostname);

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const sanitize = (value) => {
	if (typeof value !== "string") return "";
	return value.trim();
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
	return trimTrailingSlash(
		requireClientEnv("VITE_API_URL", {
			message: "VITE_API_URL is required for API calls.",
		}),
	);
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
	const ws = sanitize(import.meta.env.VITE_WS_URL);

	// Empty check
	if (!ws) {
		if (import.meta.env.DEV) {
			console.warn("⚠️ VITE_WS_URL not set - realtime features disabled");
		}
		return "";
	}

	// Placeholder check (critical for production safety)
	if (PLACEHOLDER_PATTERN.test(ws)) {
		console.warn(
			`⚠️ VITE_WS_URL contains placeholder: ${ws} - realtime disabled`,
		);
		return "";
	}

	// Protocol check
	if (!ws.startsWith("ws://") && !ws.startsWith("wss://")) {
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
		console.warn(
			"⚠️ VITE_WS_URL points to localhost in production - realtime disabled",
		);
		return "";
	}

	return ws;
};
