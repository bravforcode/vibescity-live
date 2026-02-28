import { createClient } from "@supabase/supabase-js";
import { getNetworkOnlineState } from "../services/networkState";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SCHEMA_CACHE_ERROR_CODE = "PGRST002";
const SCHEMA_CACHE_MESSAGE = "schema cache";
const SCHEMA_CACHE_WARN_INTERVAL_MS = 15_000;
const SCHEMA_CACHE_BROWNOUT_MS = 8_000;
const SCHEMA_CACHE_RETRY_MAX_ATTEMPTS = 3;
const SCHEMA_CACHE_RETRY_BASE_DELAY_MS = 220;
const SCHEMA_CACHE_RETRY_MAX_DELAY_MS = 1_200;
const OFFLINE_STATUS_CODE =
	Number(import.meta.env.VITE_OFFLINE_HTTP_STATUS) || 503;
const OFFLINE_ERROR_CODE = "VIBECITY_OFFLINE";
const RETRYABLE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const RETRYABLE_READONLY_RPCS = new Set([
	"get_map_pins",
	"get_feed_cards",
	"search_venues",
	"search_venues_v2",
	"get_local_ads",
	"get_venue_stats",
	"get_daily_checkin_status",
	"get_lucky_wheel_status",
]);

let schemaCacheBrownoutUntil = 0;
let lastSchemaCacheWarnAt = 0;

const toErrorMessage = (value) => String(value || "").toLowerCase();

export const isSupabaseSchemaCacheError = (errorLike) => {
	const code = String(
		errorLike?.code || errorLike?.error?.code || "",
	).toUpperCase();
	const message = toErrorMessage(
		errorLike?.message || errorLike?.error?.message || errorLike,
	);
	return (
		code === SCHEMA_CACHE_ERROR_CODE || message.includes(SCHEMA_CACHE_MESSAGE)
	);
};

const sleep = (ms, signal) =>
	new Promise((resolve, reject) => {
		if (!Number.isFinite(ms) || ms <= 0) {
			resolve();
			return;
		}

		const timerId = setTimeout(() => {
			if (signal && onAbort) {
				signal.removeEventListener("abort", onAbort);
			}
			resolve();
		}, ms);

		const onAbort = () => {
			clearTimeout(timerId);
			signal?.removeEventListener("abort", onAbort);
			const abortError = new Error("AbortError");
			abortError.name = "AbortError";
			reject(abortError);
		};

		if (signal) {
			if (signal.aborted) {
				onAbort();
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
		}
	});

const parseRpcNameFromUrl = (url) => {
	if (!url) return "";
	const match = String(url).match(/\/rest\/v1\/rpc\/([^/?#]+)/i);
	return (match?.[1] || "").toLowerCase();
};

const getRequestMeta = (input, init = {}) => {
	const requestUrl =
		typeof input === "string" ? input : String(input?.url || "");
	const method =
		String(
			init?.method || (typeof input === "object" && input?.method) || "GET",
		).toUpperCase() || "GET";
	return {
		url: requestUrl,
		method,
		rpcName: parseRpcNameFromUrl(requestUrl),
	};
};

const getSupabaseOrigin = () => {
	try {
		return new URL(String(supabaseUrl || "")).origin;
	} catch {
		return "";
	}
};

const isSupabaseRequest = (requestUrl) => {
	const normalizedUrl = String(requestUrl || "");
	if (!normalizedUrl) return false;
	const supabaseOrigin = getSupabaseOrigin();
	if (supabaseOrigin && normalizedUrl.startsWith(supabaseOrigin)) return true;
	return normalizedUrl.includes("supabase.co");
};

const isOffline = () => {
	if (typeof navigator !== "undefined" && navigator.onLine === false) {
		return true;
	}
	return !getNetworkOnlineState();
};

const buildOfflineResponse = (meta) => {
	const body = JSON.stringify({
		code: OFFLINE_ERROR_CODE,
		message: "Network offline. Request queued or deferred.",
		method: meta?.method || "GET",
		url: meta?.url || "",
	});
	return new Response(body, {
		status: OFFLINE_STATUS_CODE,
		headers: {
			"Content-Type": "application/json",
		},
	});
};

const isSchemaCacheRetryableRequest = ({ method, rpcName }) => {
	if (RETRYABLE_HTTP_METHODS.has(method)) return true;
	if (method === "POST" && rpcName) {
		return RETRYABLE_READONLY_RPCS.has(rpcName);
	}
	return false;
};

const extractSchemaCachePayload = async (response) => {
	if (!response || typeof response.clone !== "function") return null;
	try {
		return await response.clone().json();
	} catch {
		try {
			const text = await response.clone().text();
			return { message: text };
		} catch {
			return null;
		}
	}
};

const warnSchemaCacheRetry = (meta, attempt) => {
	if (!import.meta.env.DEV) return;
	const now = Date.now();
	if (now - lastSchemaCacheWarnAt < SCHEMA_CACHE_WARN_INTERVAL_MS) return;
	lastSchemaCacheWarnAt = now;
	const scope = meta?.rpcName
		? `rpc:${meta.rpcName}`
		: `${meta?.method || "GET"} ${meta?.url || ""}`;
	console.warn(
		`⚠️ Supabase schema cache unavailable (${scope}) — retrying (${attempt}/${SCHEMA_CACHE_RETRY_MAX_ATTEMPTS})`,
	);
};

const createSupabaseFetch = () => {
	const nativeFetch = globalThis.fetch.bind(globalThis);

	return async (input, init = {}) => {
		const meta = getRequestMeta(input, init);
		const canRetry = isSchemaCacheRetryableRequest(meta);
		const maxAttempts = canRetry ? SCHEMA_CACHE_RETRY_MAX_ATTEMPTS : 1;
		let attempt = 0;

		while (attempt < maxAttempts) {
			if (isSupabaseRequest(meta.url) && isOffline()) {
				return buildOfflineResponse(meta);
			}

			if (canRetry && schemaCacheBrownoutUntil > Date.now()) {
				const waitMs = Math.min(300, schemaCacheBrownoutUntil - Date.now());
				if (waitMs > 0) {
					await sleep(waitMs, init?.signal).catch(() => {});
				}
			}

			let response;
			try {
				response = await nativeFetch(input, init);
			} catch (fetchError) {
				if (isSupabaseRequest(meta.url)) {
					if (import.meta.env.DEV) {
						console.error("[supabase] Network request failed:", fetchError);
					}
					return buildOfflineResponse(meta);
				}
				throw fetchError;
			}
			if (response.ok || !canRetry) return response;

			const payload = await extractSchemaCachePayload(response);
			if (!isSupabaseSchemaCacheError(payload)) return response;

			attempt += 1;
			schemaCacheBrownoutUntil = Date.now() + SCHEMA_CACHE_BROWNOUT_MS;
			if (attempt >= maxAttempts) return response;

			warnSchemaCacheRetry(meta, attempt + 1);
			const delayMs = Math.min(
				SCHEMA_CACHE_RETRY_MAX_DELAY_MS,
				SCHEMA_CACHE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
			);
			await sleep(delayMs, init?.signal);
		}

		return nativeFetch(input, init);
	};
};

if (!supabaseUrl || !supabaseAnonKey) {
	const missing = [
		!supabaseUrl && "VITE_SUPABASE_URL",
		!supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
	]
		.filter(Boolean)
		.join(", ");
	throw new Error(
		`Missing required env vars: ${missing}. Check your .env file.`,
	);
}

const getVisitorHeader = () => {
	try {
		const vid = globalThis.localStorage?.getItem("vibe_visitor_id");
		return vid ? { vibe_visitor_id: vid } : {};
	} catch {
		return {};
	}
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	global: {
		headers: getVisitorHeader(),
		fetch: createSupabaseFetch(),
	},
});
