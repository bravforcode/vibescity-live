import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import { unwrapApiEnvelope } from "./api/dashboardApiAdapter";
import {
	bootstrapVisitor,
	getOrCreateVisitorId,
	getVisitorToken,
	isVisitorTokenExpired,
} from "./visitorIdentity";

const DEFAULT_API_TIMEOUT_MS = Number(
	import.meta.env.VITE_API_TIMEOUT_MS || 8000,
);
const API_TIMEOUT_CODE = "API_TIMEOUT";
const API_NETWORK_ERROR_CODE = "API_NETWORK_ERROR";

const isFinitePositiveNumber = (value) =>
	Number.isFinite(Number(value)) && Number(value) > 0;

const resolveTimeoutMs = (value) => {
	const fallback = isFinitePositiveNumber(DEFAULT_API_TIMEOUT_MS)
		? Number(DEFAULT_API_TIMEOUT_MS)
		: 8000;
	if (!isFinitePositiveNumber(value)) return fallback;
	return Math.max(250, Math.min(60000, Number(value)));
};

export class ApiClientError extends Error {
	constructor(
		message,
		{
			code = API_NETWORK_ERROR_CODE,
			status = 0,
			retriable = false,
			timeout = false,
			cause = null,
			method = "GET",
			path = "",
			baseUrl = "",
			timeoutMs = 0,
		} = {},
	) {
		super(message);
		this.name = "ApiClientError";
		this.code = String(code || API_NETWORK_ERROR_CODE);
		this.status = Number(status || 0);
		this.retriable = Boolean(retriable);
		this.timeout = Boolean(timeout);
		this.method = String(method || "GET").toUpperCase();
		this.path = String(path || "");
		this.baseUrl = String(baseUrl || "");
		this.timeoutMs = Number(timeoutMs || 0);
		this.cause = cause || null;
	}
}

const buildBody = (headers, body) => {
	if (body === undefined) return undefined;
	if (body instanceof FormData) return body;
	const contentType = String(
		headers["Content-Type"] || headers["content-type"] || "",
	);
	if (contentType.includes("application/json") && typeof body !== "string") {
		return JSON.stringify(body);
	}
	return body;
};

const createTimedAbortSignal = ({ externalSignal, timeoutMs }) => {
	const timeoutTriggeredRef = { value: false };
	if (!isFinitePositiveNumber(timeoutMs)) {
		return {
			signal: externalSignal,
			cancel: () => {},
			timeoutTriggeredRef,
		};
	}

	const controller = new AbortController();
	let settled = false;
	let timerId = null;

	const abortFromExternal = () => {
		if (settled) return;
		settled = true;
		controller.abort(externalSignal?.reason);
	};

	if (externalSignal) {
		if (externalSignal.aborted) {
			abortFromExternal();
		} else {
			externalSignal.addEventListener("abort", abortFromExternal, {
				once: true,
			});
		}
	}

	timerId = setTimeout(() => {
		if (settled) return;
		timeoutTriggeredRef.value = true;
		settled = true;
		controller.abort(new DOMException("Request timed out", "TimeoutError"));
	}, Number(timeoutMs));

	const cancel = () => {
		if (timerId) {
			clearTimeout(timerId);
			timerId = null;
		}
		if (externalSignal) {
			externalSignal.removeEventListener("abort", abortFromExternal);
		}
		settled = true;
	};

	return { signal: controller.signal, cancel, timeoutTriggeredRef };
};

const toApiClientError = (error, context = {}) => {
	const status = Number(error?.status || error?.statusCode || 0);
	const timeout = Boolean(context.timeoutTriggeredRef?.value);
	const code = timeout ? API_TIMEOUT_CODE : API_NETWORK_ERROR_CODE;
	const defaultMessage = timeout
		? `Request timeout after ${context.timeoutMs}ms`
		: "Network request failed";
	const message = String(error?.message || defaultMessage);
	const retriable = timeout || status >= 500 || status === 0;

	return new ApiClientError(message, {
		code,
		status,
		retriable,
		timeout,
		cause: error,
		method: context.method,
		path: context.path,
		baseUrl: context.baseUrl,
		timeoutMs: context.timeoutMs,
	});
};

export const isRetriableApiError = (error) =>
	Boolean(error?.retriable) ||
	Boolean(error?.timeout) ||
	Number(error?.status || 0) >= 500;

export const apiFetch = async (
	path,
	{
		baseUrl = getApiV1BaseUrl(),
		method = "GET",
		headers = {},
		body,
		includeVisitor = true,
		refreshVisitorTokenIfNeeded = false,
		timeoutMs = resolveTimeoutMs(),
		requestId = "",
		idempotencyKey = "",
		csrfToken = "",
		useApiEnvelope = false,
		credentials = "include",
		signal: externalSignal,
		...rest
	} = {},
) => {
	const finalHeaders = { ...headers };
	const normalizedMethod = String(method || "GET").toUpperCase();
	const generatedRequestId =
		String(requestId || "").trim() ||
		(typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
	finalHeaders["X-Request-ID"] = generatedRequestId;
	if (useApiEnvelope) {
		finalHeaders["X-API-Envelope"] = "1";
	}
	if (
		idempotencyKey &&
		["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)
	) {
		finalHeaders["Idempotency-Key"] = String(idempotencyKey).trim();
	}
	if (
		csrfToken &&
		["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)
	) {
		finalHeaders["X-CSRF-Token"] = String(csrfToken).trim();
	}

	if (includeVisitor) {
		const visitorId = getOrCreateVisitorId();
		if (
			refreshVisitorTokenIfNeeded &&
			(!getVisitorToken() || isVisitorTokenExpired(getVisitorToken()))
		) {
			await bootstrapVisitor({ forceRefresh: true });
		}
		const visitorToken = getVisitorToken();
		finalHeaders["X-Visitor-Id"] = visitorId;
		if (visitorToken) finalHeaders["X-Visitor-Token"] = visitorToken;
	}

	if (
		body !== undefined &&
		!(body instanceof FormData) &&
		!finalHeaders["Content-Type"]
	) {
		finalHeaders["Content-Type"] = "application/json";
	}

	const timeoutValue = resolveTimeoutMs(timeoutMs);
	const { signal, cancel, timeoutTriggeredRef } = createTimedAbortSignal({
		externalSignal,
		timeoutMs: timeoutValue,
	});

	try {
		const response = await fetch(`${baseUrl}${path}`, {
			method,
			headers: finalHeaders,
			body: buildBody(finalHeaders, body),
			credentials,
			signal,
			...rest,
		});
		return response;
	} catch (error) {
		throw toApiClientError(error, {
			method,
			path,
			baseUrl,
			timeoutMs: timeoutValue,
			timeoutTriggeredRef,
		});
	} finally {
		cancel();
	}
};

export const parseApiError = async (response, fallbackMessage) => {
	if (response instanceof ApiClientError) {
		return response.message || fallbackMessage;
	}
	const payload = await response.json().catch(() => ({}));
	const unwrapped = unwrapApiEnvelope(payload);
	if (Array.isArray(unwrapped?.errors) && unwrapped.errors.length > 0) {
		const first = unwrapped.errors[0];
		if (typeof first === "string") return first;
		if (first && typeof first === "object") {
			return String(first.message || first.detail || fallbackMessage);
		}
	}
	return payload?.detail || payload?.error || fallbackMessage;
};

export const parseApiJson = async (
	response,
	fallbackMessage = "Unexpected API response",
) => {
	if (!response.ok) {
		const message = await parseApiError(response, fallbackMessage);
		const error = new Error(message);
		error.status = response.status;
		throw error;
	}
	const payload = await response.json().catch(() => ({}));
	return unwrapApiEnvelope(payload);
};
