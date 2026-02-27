import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import {
	bootstrapVisitor,
	getOrCreateVisitorId,
	getVisitorToken,
	isVisitorTokenExpired,
} from "./visitorIdentity";

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

	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers: finalHeaders,
		body: buildBody(finalHeaders, body),
		...rest,
	});

	return response;
};

export const parseApiError = async (response, fallbackMessage) => {
	const payload = await response.json().catch(() => ({}));
	return payload?.detail || payload?.error || fallbackMessage;
};
