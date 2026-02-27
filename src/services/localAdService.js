import { getSupabaseEdgeBaseUrl } from "@/lib/runtimeConfig";
import { supabase } from "@/lib/supabase";

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

/**
 * Service for managing geofenced local ads.
 * Provides CRUD + location-based retrieval through the Supabase `get_local_ads` RPC.
 */
class LocalAdService {
	async _authHeaders() {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${session?.access_token || ""}`,
		};
	}

	async _adminFetch(path = "", options = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await this._authHeaders();

		return await requestWithRetry(async () => {
			const res = await fetch(`${edgeUrl}/admin-local-ads${path}`, {
				...options,
				headers: {
					...headers,
					...(options.headers || {}),
				},
			});
			if (!res.ok) {
				const payload = await parseJsonSafe(res);
				const message = extractErrorMessage(
					payload,
					"Local Ads admin request failed",
				);
				const error = new Error(message);
				error.status = res.status;
				throw error;
			}
			return await res.json();
		});
	}

	/* ───────── read ───────── */

	/** Fetch ads that fall within range of a given lat/lng. */
	async getByLocation(lat, lng) {
		const { data, error } = await supabase.rpc("get_local_ads", {
			p_lat: lat,
			p_lng: lng,
		});
		if (error) throw error;
		return data || [];
	}

	/** Fetch all ads (admin). */
	async getAll() {
		const payload = await this._adminFetch("", { method: "GET" });
		return payload?.data || [];
	}

	/** Fetch a single ad by ID. */
	async getById(id) {
		const query = `?id=${encodeURIComponent(String(id || ""))}`;
		const payload = await this._adminFetch(query, { method: "GET" });
		return payload?.data || null;
	}

	/* ───────── write ───────── */

	/**
	 * Create a new ad.
	 * @param {{ title:string, description?:string, image_url?:string, link_url?:string, lat:number, lng:number, radius_km?:number, starts_at?:string, ends_at?:string }} payload
	 */
	async create(payload) {
		const data = await this._adminFetch("", {
			method: "POST",
			body: JSON.stringify(payload),
		});
		return data?.data || null;
	}

	/**
	 * Update an existing ad.
	 * @param {string} id
	 * @param {object} payload - fields to update; lat/lng handled like create.
	 */
	async update(id, payload) {
		const query = `?id=${encodeURIComponent(String(id || ""))}`;
		const data = await this._adminFetch(query, {
			method: "PATCH",
			body: JSON.stringify(payload),
		});
		return data?.data || null;
	}

	/** Toggle ad status between 'active' and 'paused'. */
	async toggleStatus(id, currentStatus) {
		const newStatus = currentStatus === "active" ? "paused" : "active";
		return this.update(id, { status: newStatus });
	}

	/** Delete an ad by ID. */
	async remove(id) {
		const query = `?id=${encodeURIComponent(String(id || ""))}`;
		await this._adminFetch(query, { method: "DELETE" });
		return true;
	}
}

export const localAdService = new LocalAdService();
