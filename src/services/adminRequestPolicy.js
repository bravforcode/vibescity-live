import { supabase } from "../lib/supabase";
import { isTransientNetworkError } from "../utils/networkErrorUtils";
import {
	computeBackoffDelayMs,
	shouldRetryResource,
	waitForBackoff,
} from "../utils/retryPolicy";

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const parseJsonSafe = async (response) => {
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

const extractErrorMessage = (payload, fallbackMessage) => {
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
	return fallbackMessage;
};

const buildHttpError = ({
	payload,
	status,
	fallbackMessage,
	unauthorizedMessage,
}) => {
	let message = extractErrorMessage(payload, fallbackMessage);
	if (
		status === 401 &&
		unauthorizedMessage &&
		String(message).toLowerCase() === "unauthorized"
	) {
		message = unauthorizedMessage;
	}

	const error = new Error(message);
	error.status = status;
	error.payload = payload;
	return error;
};

const isRetriableAdminError = (error) => {
	const status = Number(error?.status || 0);
	if (TRANSIENT_HTTP_STATUSES.has(status)) return true;
	return isTransientNetworkError(error);
};

const requestWithAdminPolicy = async (run) => {
	let attempt = 0;

	while (true) {
		try {
			return await run(attempt);
		} catch (error) {
			if (
				isRetriableAdminError(error) &&
				shouldRetryResource({ resourceType: "adminApi", attempt })
			) {
				await waitForBackoff(
					computeBackoffDelayMs({ resourceType: "adminApi", attempt }),
				);
				attempt += 1;
				continue;
			}
			throw error;
		}
	}
};

export const getAdminAuthHeaders = async (headers = {}) => {
	const {
		data: { session },
	} = await supabase.auth.getSession();

	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${session?.access_token || ""}`,
		...headers,
	};
};

export const requestAdminJson = async ({
	url,
	init = {},
	fallbackMessage,
	unauthorizedMessage,
}) =>
	requestWithAdminPolicy(async () => {
		const response = await fetch(url, init);
		if (!response.ok) {
			const payload = await parseJsonSafe(response);
			throw buildHttpError({
				payload,
				status: response.status,
				fallbackMessage,
				unauthorizedMessage,
			});
		}
		return await response.json();
	});

export const requestAdminBlob = async ({
	url,
	init = {},
	fallbackMessage,
	unauthorizedMessage,
}) =>
	requestWithAdminPolicy(async () => {
		const response = await fetch(url, init);
		if (!response.ok) {
			const payload = await parseJsonSafe(response);
			throw buildHttpError({
				payload,
				status: response.status,
				fallbackMessage,
				unauthorizedMessage,
			});
		}
		return await response.blob();
	});
