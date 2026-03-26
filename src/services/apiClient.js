import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import { isAbortLikeError } from "../utils/networkErrorUtils";
import { unwrapApiEnvelope } from "./api/dashboardApiAdapter";
import {
	bootstrapVisitor,
	getOrCreateVisitorId,
	getVisitorToken,
	isVisitorTokenExpired,
} from "./visitorIdentity";

const LOCAL_DEV_HOST_PATTERN = /^(localhost|127\.0\.0\.1)$/i;

export class ApiClientError extends Error {
	constructor(message, options = {}) {
		super(message, options.cause ? { cause: options.cause } : undefined);
		this.name = "ApiClientError";
		this.status = options.status || 0;
		this.code = options.code || "API_ERROR";
		this.path = options.path || "";
		this.timeout = options.timeout || false;
		if (options.cause) this.cause = options.cause;
		const isAbort = isAbortLikeError(options.cause);
		this.retriable =
			options.retriable !== undefined
				? options.retriable
				: !isAbort && (this.status >= 500 || this.status === 0);
	}
}

export const isAbortLikeApiError = (error) =>
	error instanceof ApiClientError
		? isAbortLikeError(error.cause || error)
		: isAbortLikeError(error);

export const isRetriableApiError = (error) => {
	if (error instanceof ApiClientError) {
		return error.retriable;
	}
	return typeof error?.status === "number"
		? error.status >= 500 || error.status === 0
		: false;
};

const getAdminSecret = () => {
	try {
		return sessionStorage.getItem("vibe_admin_secret") || "";
	} catch {
		return "";
	}
};

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

const isLocalDevBrowser = () =>
	import.meta.env.DEV &&
	typeof window !== "undefined" &&
	LOCAL_DEV_HOST_PATTERN.test(window.location.hostname);

const isLocalDevProxyMode = () =>
	isLocalDevBrowser() && import.meta.env.VITE_API_PROXY_DEV === "true";

const getLocalProxyApiV1BaseUrl = () =>
	isLocalDevProxyMode() ? `${window.location.origin}/api/v1` : "";

const shouldRetryViaLocalProxy = (baseUrl, error) => {
	if (!isLocalDevProxyMode()) return false;
	if (isAbortLikeError(error)) return false;

	try {
		const original = new URL(baseUrl, window.location.origin);
		return original.origin !== window.location.origin;
	} catch {
		return false;
	}
};

const resolvePreferredBaseUrl = (baseUrl) => {
	if (!isLocalDevProxyMode()) return baseUrl;

	try {
		const original = new URL(baseUrl, window.location.origin);
		const proxyBaseUrl = getLocalProxyApiV1BaseUrl();
		if (proxyBaseUrl && original.origin !== window.location.origin) {
			return proxyBaseUrl;
		}
	} catch {
		// ignore and keep original baseUrl
	}

	return baseUrl;
};

const shouldRetryAgainstDirectApi = (
	preferredBaseUrl,
	originalBaseUrl,
	response,
) => {
	if (!isLocalDevProxyMode()) return false;
	if (!response || typeof response.status !== "number") return false;
	if (preferredBaseUrl === originalBaseUrl) return false;
	return [404, 502, 503, 504].includes(response.status);
};

const DEFAULT_TIMEOUT_MS = 15_000;

export const apiFetch = async (
	path,
	{
		baseUrl = getApiV1BaseUrl(),
		method = "GET",
		headers = {},
		body,
		includeVisitor = true,
		includeAdminSecret = false,
		refreshVisitorTokenIfNeeded = false,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		...rest
	} = {},
) => {
	const finalHeaders = { ...headers };

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

	if (includeAdminSecret) {
		const adminSecret = getAdminSecret();
		if (adminSecret) finalHeaders["X-Admin-Secret"] = adminSecret;
	}

	if (
		body !== undefined &&
		!(body instanceof FormData) &&
		!finalHeaders["Content-Type"]
	) {
		finalHeaders["Content-Type"] = "application/json";
	}
	const requestBody = buildBody(finalHeaders, body);

	let timeoutId;
	if (timeoutMs && !rest.signal) {
		const controller = new AbortController();
		timeoutId = setTimeout(() => {
			controller.abort(new DOMException("Request timed out", "TimeoutError"));
		}, timeoutMs);
		rest.signal = controller.signal;
	}
	const requestInit = {
		method,
		headers: finalHeaders,
		body: requestBody,
		...rest,
	};
	const preferredBaseUrl = resolvePreferredBaseUrl(baseUrl);

	try {
		const response = await fetch(`${preferredBaseUrl}${path}`, requestInit);
		if (shouldRetryAgainstDirectApi(preferredBaseUrl, baseUrl, response)) {
			return fetch(`${baseUrl}${path}`, requestInit);
		}
		return response;
	} catch (error) {
		if (shouldRetryViaLocalProxy(preferredBaseUrl, error)) {
			const proxyBaseUrl = getLocalProxyApiV1BaseUrl();
			if (proxyBaseUrl && proxyBaseUrl !== preferredBaseUrl) {
				return fetch(`${proxyBaseUrl}${path}`, requestInit);
			}
		}
		if (error.name === "TimeoutError") {
			throw new ApiClientError(error.message, {
				code: "API_TIMEOUT",
				timeout: true,
				retriable: true,
				path,
			});
		}
		throw error;
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
};

export const parseApiError = async (response, fallbackMessage) => {
	if (response instanceof ApiClientError) return response.message;
	const payload = await response.json().catch(() => ({}));
	return payload?.detail || payload?.error || fallbackMessage;
};

export const parseApiJson = async (response, fallbackMessage) => {
	const payload = await response.json().catch(() => ({}));

	if (!response.ok) {
		const errorMessage =
			payload?.errors?.[0]?.message ||
			payload?.detail ||
			payload?.error ||
			fallbackMessage;
		throw new ApiClientError(errorMessage, {
			status: response.status,
			code: payload?.errors?.[0]?.code || "API_ERROR",
		});
	}

	return unwrapApiEnvelope(payload);
};
