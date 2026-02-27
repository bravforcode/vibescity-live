import { getApiV1BaseUrl } from "../lib/runtimeConfig";

const VISITOR_ID_KEY = "vibe_visitor_id";
const VISITOR_TOKEN_KEY = "vibe_visitor_token";
const UUID_V4_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const base64UrlDecode = (value) => {
	try {
		const normalized = String(value || "")
			.replace(/-/g, "+")
			.replace(/_/g, "/");
		const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
		return atob(padded);
	} catch {
		return "";
	}
};

const base64UrlEncode = (value) =>
	btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const createFallbackToken = (visitorId, ttlSeconds = 3600) => {
	const now = Math.floor(Date.now() / 1000);
	const fallbackPayload = {
		vid: visitorId,
		iat: now,
		exp: now + ttlSeconds,
		v: 0,
	};
	return {
		token: `${base64UrlEncode(JSON.stringify(fallbackPayload))}.legacy`,
		expiresAt: fallbackPayload.exp,
	};
};

export const getOrCreateVisitorId = () => {
	const existing = localStorage.getItem(VISITOR_ID_KEY);
	if (existing && UUID_V4_PATTERN.test(existing)) return existing;
	const generated = (() => {
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.randomUUID === "function"
		) {
			return crypto.randomUUID();
		}
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.getRandomValues === "function"
		) {
			const bytes = new Uint8Array(16);
			crypto.getRandomValues(bytes);
			// RFC 4122 version 4 + variant bits.
			bytes[6] = (bytes[6] & 0x0f) | 0x40;
			bytes[8] = (bytes[8] & 0x3f) | 0x80;
			const hex = [...bytes]
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
			return [
				hex.slice(0, 8),
				hex.slice(8, 12),
				hex.slice(12, 16),
				hex.slice(16, 20),
				hex.slice(20, 32),
			].join("-");
		}
		return "00000000-0000-4000-8000-000000000000";
	})();
	localStorage.setItem(VISITOR_ID_KEY, generated);
	return generated;
};

export const getVisitorToken = () =>
	localStorage.getItem(VISITOR_TOKEN_KEY) || "";

export const setVisitorToken = (token) => {
	if (!token) {
		localStorage.removeItem(VISITOR_TOKEN_KEY);
		return;
	}
	localStorage.setItem(VISITOR_TOKEN_KEY, token);
};

export const getVisitorTokenPayload = (token) => {
	const target = token || getVisitorToken();
	if (!target.includes(".")) return null;
	const payloadPart = target.split(".", 1)[0];
	const payloadJson = base64UrlDecode(payloadPart);
	if (!payloadJson) return null;
	try {
		return JSON.parse(payloadJson);
	} catch {
		return null;
	}
};

export const isVisitorTokenExpired = (token) => {
	const target = token || getVisitorToken();
	if (!target || String(target).endsWith(".legacy")) return true;
	const payload = getVisitorTokenPayload(target);
	if (Number(payload?.v || 0) < 1) return true;
	if (!payload?.exp) return true;
	const now = Math.floor(Date.now() / 1000);
	// Refresh slightly early to avoid expiry race in-flight.
	return Number(payload.exp) <= now + 30;
};

export const bootstrapVisitor = async ({ forceRefresh = false } = {}) => {
	const visitorId = getOrCreateVisitorId();
	const currentToken = getVisitorToken();
	if (!forceRefresh && currentToken && !isVisitorTokenExpired(currentToken)) {
		return {
			visitorId,
			visitorToken: currentToken,
			expiresAt: getVisitorTokenPayload(currentToken)?.exp || null,
		};
	}

	// E2E runs should stay fully local to avoid cross-origin noise in console-gated tests.
	const isE2E =
		import.meta.env.VITE_E2E === "true" ||
		import.meta.env.VITE_E2E_MAP_REQUIRED === "true" ||
		import.meta.env.MODE === "e2e";
	if (isE2E) {
		const fallback = createFallbackToken(visitorId, 24 * 3600);
		setVisitorToken(fallback.token);
		return {
			visitorId,
			visitorToken: fallback.token,
			expiresAt: fallback.expiresAt,
			error: null,
		};
	}

	const v1Base = getApiV1BaseUrl();
	const legacyBase = v1Base.endsWith("/api/v1")
		? `${v1Base.slice(0, -3)}`
		: v1Base.replace("/v1", "");
	const baseCandidates = [...new Set([legacyBase, v1Base])];
	let lastError = null;
	let payload = null;

	for (const base of baseCandidates) {
		try {
			const response = await fetch(`${base}/visitor/bootstrap`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ visitor_id: visitorId }),
			});
			if (response.ok) {
				payload = await response.json();
				break;
			}
			const errorPayload = await response.json().catch(() => ({}));
			const detail = errorPayload?.detail || `HTTP ${response.status}`;
			lastError = new Error(detail);
			if (![404, 405].includes(response.status)) {
				break;
			}
		} catch (error) {
			lastError = error;
		}
	}

	if (!payload?.visitor_token) {
		// Compatibility fallback for older backends without visitor bootstrap.
		const fallback = createFallbackToken(visitorId);
		setVisitorToken(fallback.token);
		return {
			visitorId,
			visitorToken: fallback.token,
			expiresAt: fallback.expiresAt,
			error: lastError?.message || null,
		};
	}

	setVisitorToken(payload.visitor_token);
	return {
		visitorId,
		visitorToken: payload.visitor_token,
		expiresAt: payload.expires_at || null,
	};
};
