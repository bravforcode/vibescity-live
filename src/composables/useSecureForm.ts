import { ref } from "vue";
import { unwrapApiEnvelope } from "@/services/api/dashboardApiAdapter";
import { apiFetch, parseApiError } from "@/services/apiClient";

const CSRF_COOKIE_KEY = "csrf_token";

const readCookie = (name: string): string => {
	if (typeof document === "undefined") return "";
	const target = `${name}=`;
	return (
		document.cookie
			.split(";")
			.map((c) => c.trim())
			.find((c) => c.startsWith(target))
			?.slice(target.length) || ""
	);
};

export function useSecureForm() {
	const csrfToken = ref(readCookie(CSRF_COOKIE_KEY));
	const csrfLoaded = ref(false);

	const ensureCsrfToken = async () => {
		if (csrfToken.value) return csrfToken.value;
		const response = await apiFetch("/partner/csrf-token", {
			method: "GET",
			includeVisitor: true,
			refreshVisitorTokenIfNeeded: true,
			// @ts-expect-error
			useApiEnvelope: true,
		});
		if (!response.ok) {
			const error = await parseApiError(
				response,
				"Unable to initialize CSRF token",
			);
			throw new Error(error);
		}
		const payload = unwrapApiEnvelope(await response.json());
		csrfToken.value = String(
			payload?.data?.token || readCookie(CSRF_COOKIE_KEY) || "",
		);
		csrfLoaded.value = true;
		return csrfToken.value;
	};

	const submitSecure = async (
		endpoint: string,
		payload: unknown,
		{
			method = "POST",
			idempotencyKey = "",
		}: {
			method?: "POST" | "PUT" | "PATCH" | "DELETE";
			idempotencyKey?: string;
		} = {},
	) => {
		const token = await ensureCsrfToken();
		const response = await apiFetch(endpoint, {
			method,
			includeVisitor: true,
			refreshVisitorTokenIfNeeded: true,
			// @ts-expect-error
			useApiEnvelope: true,
			headers: {
				"X-CSRF-Token": token,
				...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
			},
			body: payload,
		});

		if (!response.ok) {
			const message = await parseApiError(
				response,
				"Secure form submission failed",
			);
			throw new Error(message);
		}
		return unwrapApiEnvelope(await response.json());
	};

	return { csrfToken, csrfLoaded, ensureCsrfToken, submitSecure };
}
