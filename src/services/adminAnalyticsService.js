import { getSupabaseEdgeBaseUrl } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabase";

const TRANSIENT_ERROR_PATTERNS = [
	"schema cache",
	"upstream request timeout",
	"service unavailable",
	"temporarily unavailable",
	"network error",
	"failed to fetch",
	"gateway timeout",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientStatus = (status) =>
	status === 429 || status === 408 || status === 425 || status >= 500;

const isTransientMessage = (message) => {
	const lower = String(message || "").toLowerCase();
	return TRANSIENT_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
};

const extractErrorMessage = (payload, fallback) => {
	if (typeof payload === "string" && payload.trim()) return payload.trim();
	if (payload && typeof payload === "object") {
		const candidates = [
			payload.error,
			payload.message,
			payload.msg,
			payload.details,
			payload.hint,
		];
		for (const candidate of candidates) {
			if (typeof candidate === "string" && candidate.trim()) {
				return candidate.trim();
			}
		}
	}
	return fallback;
};

const parseJsonSafe = async (res) => {
	try {
		return await res.json();
	} catch {
		try {
			return await res.text();
		} catch {
			return null;
		}
	}
};

const requestWithRetry = async (
	run,
	{ maxAttempts = 3, baseDelayMs = 350 } = {},
) => {
	let lastError;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			return await run();
		} catch (error) {
			lastError = error;
			const status = Number(error?.status) || 0;
			const message = String(error?.message || error || "");
			const shouldRetry =
				attempt < maxAttempts &&
				(isTransientStatus(status) || isTransientMessage(message));
			if (!shouldRetry) break;
			await sleep(baseDelayMs * attempt);
		}
	}
	throw lastError;
};

const getHeaders = async () => {
	const {
		data: { session },
	} = await supabase.auth.getSession();

	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${session?.access_token || ""}`,
	};
};

const requestJson = async (url, init = {}, fallbackMessage) =>
	requestWithRetry(async () => {
		const res = await fetch(url, init);
		if (!res.ok) {
			const payload = await parseJsonSafe(res);
			const message = extractErrorMessage(payload, fallbackMessage);
			const error = new Error(message);
			error.status = res.status;
			throw error;
		}
		return await res.json();
	});

const requestBlob = async (url, init = {}, fallbackMessage) =>
	requestWithRetry(async () => {
		const res = await fetch(url, init);
		if (!res.ok) {
			const payload = await parseJsonSafe(res);
			const message = extractErrorMessage(payload, fallbackMessage);
			const error = new Error(message);
			error.status = res.status;
			throw error;
		}
		return await res.blob();
	});

export const adminAnalyticsService = {
	async getUsageDashboard(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		return await requestJson(
			`${edgeUrl}/admin-analytics-dashboard`,
			{
				method: "POST",
				headers,
				body: JSON.stringify(filters),
			},
			"Failed to fetch analytics dashboard",
		);
	},

	async exportUsage(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		return await requestBlob(
			`${edgeUrl}/admin-analytics-export`,
			{
				method: "POST",
				headers,
				body: JSON.stringify(filters),
			},
			"Failed to export analytics",
		);
	},
};
