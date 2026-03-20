import { getSupabaseEdgeBaseUrl, requireClientEnv } from "../lib/runtimeConfig";
import { isAbortLikeError } from "../utils/networkErrorUtils";

const DEFAULT_TIMEOUT_MS = 2500;

const buildAbortSignal = (timeoutMs, parentSignal) => {
	const controller = new AbortController();
	let timeoutId = null;
	let removeParentAbort = null;

	const abortWith = (reason) => {
		if (!controller.signal.aborted) {
			controller.abort(reason);
		}
	};

	if (parentSignal) {
		if (parentSignal.aborted) {
			abortWith(parentSignal.reason);
		} else {
			const onAbort = () => abortWith(parentSignal.reason);
			parentSignal.addEventListener("abort", onAbort, { once: true });
			removeParentAbort = () =>
				parentSignal.removeEventListener("abort", onAbort);
		}
	}

	if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
		timeoutId = setTimeout(() => {
			const timeoutError = new Error("Edge function request timed out");
			timeoutError.name = "AbortError";
			abortWith(timeoutError);
		}, timeoutMs);
	}

	return {
		signal: controller.signal,
		cleanup: () => {
			if (timeoutId) clearTimeout(timeoutId);
			removeParentAbort?.();
		},
	};
};

const parseEdgeResponse = async (response) => {
	try {
		return await response.json();
	} catch {
		try {
			return await response.text();
		} catch {
			return null;
		}
	}
};

const toEdgeError = (response, payload) => {
	const message =
		(typeof payload === "object" && payload?.error) ||
		(typeof payload === "string" && payload) ||
		`Edge function request failed with status ${response.status}`;
	const error = new Error(message);
	error.name = "EdgeFunctionError";
	error.status = response.status;
	error.payload = payload;
	return error;
};

export const invokePublicEdgeFunction = async (
	functionName,
	{ body, headers = {}, timeout = DEFAULT_TIMEOUT_MS, signal } = {},
) => {
	const edgeBaseUrl = getSupabaseEdgeBaseUrl();
	const anonKey = requireClientEnv("VITE_SUPABASE_ANON_KEY", {
		message: "VITE_SUPABASE_ANON_KEY is required for Edge Function calls.",
	});
	const { signal: requestSignal, cleanup } = buildAbortSignal(timeout, signal);

	try {
		const response = await fetch(
			`${edgeBaseUrl}/${encodeURIComponent(functionName)}`,
			{
				method: "POST",
				headers: {
					apikey: anonKey,
					Authorization: `Bearer ${anonKey}`,
					"Content-Type": "application/json",
					...headers,
				},
				body: JSON.stringify(body ?? {}),
				signal: requestSignal,
			},
		);
		const payload = await parseEdgeResponse(response);

		if (!response.ok) {
			return {
				data: null,
				error: toEdgeError(response, payload),
			};
		}

		return { data: payload, error: null };
	} catch (error) {
		if (isAbortLikeError(error)) {
			throw error;
		}
		return { data: null, error };
	} finally {
		cleanup();
	}
};
