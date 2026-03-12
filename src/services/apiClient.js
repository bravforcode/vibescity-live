import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import { unwrapApiEnvelope } from "./api/dashboardApiAdapter";
import {
	bootstrapVisitor,
	getOrCreateVisitorId,
	getVisitorToken,
	isVisitorTokenExpired,
} from "./visitorIdentity";

export class ApiClientError extends Error {
	constructor(message, options = {}) {
		super(message);
		this.name = "ApiClientError";
		this.status = options.status || 0;
		this.code = options.code || "API_ERROR";
		this.path = options.path || "";
		this.timeout = options.timeout || false;
		this.retriable =
			options.retriable !== undefined
				? options.retriable
				: this.status >= 500 || this.status === 0;
	}
}

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

	let timeoutId;
	if (timeoutMs && !rest.signal) {
		const controller = new AbortController();
		timeoutId = setTimeout(() => {
			controller.abort(new DOMException("Request timed out", "TimeoutError"));
		}, timeoutMs);
		rest.signal = controller.signal;
	}

	try {
		const response = await fetch(`${baseUrl}${path}`, {
			method,
			headers: finalHeaders,
			body: buildBody(finalHeaders, body),
			...rest,
		});
		return response;
	} catch (error) {
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
