import i18n from "@/i18n.js";
import { createIdempotencyKey } from "@/utils/idempotencyKey";
import { apiFetch, parseApiError, parseApiJson } from "./apiClient";
import { subscribePayoutEvents } from "./payoutRealtimeService";
import { bootstrapVisitor, getOrCreateVisitorId } from "./visitorIdentity";

const sanitizeCode = (value) =>
	String(value || "")
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, "")
		.toUpperCase()
		.slice(0, 24);

const ensureVisitorContext = async () => {
	const visitorId = getOrCreateVisitorId();
	await bootstrapVisitor();
	return visitorId;
};

const readCookie = (name) => {
	try {
		const target = `${name}=`;
		return (
			document.cookie
				.split(";")
				.map((c) => c.trim())
				.find((c) => c.startsWith(target))
				?.slice(target.length) || ""
		);
	} catch {
		return "";
	}
};

let csrfTokenCache = "";

const ensureCsrfToken = async () => {
	if (csrfTokenCache) return csrfTokenCache;
	const response = await apiFetch("/partner/csrf-token", {
		method: "GET",
		includeVisitor: true,
		refreshVisitorTokenIfNeeded: true,
		useApiEnvelope: true,
	});
	const payload = await parseApiJson(
		response,
		"Unable to initialize CSRF token",
	);
	csrfTokenCache = String(
		payload?.data?.token || readCookie("csrf_token") || "",
	);
	return csrfTokenCache;
};

const buildPartnerError = (message, fallback) => {
	const text = String(message || "").trim();
	if (!text) return fallback;
	const lowered = text.toLowerCase();
	if (
		lowered.includes("failed to fetch") ||
		lowered.includes("networkerror") ||
		lowered.includes("load failed")
	) {
		return "Partner API unreachable (network/CORS). Please redeploy backend and allow visitor headers in CORS.";
	}
	return text;
};

const parseJson = async (response, fallback) => {
	try {
		const payload = await parseApiJson(response, fallback);
		return payload?.data;
	} catch (error) {
		if (response.status === 404) {
			throw new Error(i18n.global.t("auto.k_2029f684"));
		}
		if (response.status === 401) {
			throw new Error(i18n.global.t("auto.k_f212afc7"));
		}
		if (response.status === 402) {
			throw new Error(i18n.global.t("auto.k_c3414d6a"));
		}
		const message = await parseApiError(response, fallback);
		throw new Error(message || error?.message || fallback);
	}
};

const safePartnerCall = async (operation, fallbackMessage) => {
	try {
		return await operation();
	} catch (error) {
		throw new Error(buildPartnerError(error?.message, fallbackMessage));
	}
};

export const partnerService = {
	sanitizeCode,

	async getStatus() {
		return safePartnerCall(async () => {
			const visitorId = await ensureVisitorContext();
			const response = await apiFetch(
				`/partner/status?visitor_id=${encodeURIComponent(visitorId)}`,
				{
					method: "GET",
					includeVisitor: true,
					refreshVisitorTokenIfNeeded: true,
					useApiEnvelope: true,
				},
			);
			return parseJson(response, "Unable to load partner status");
		}, "Unable to load partner status");
	},

	async getDashboard() {
		return safePartnerCall(async () => {
			const visitorId = await ensureVisitorContext();
			const response = await apiFetch(
				`/partner/dashboard?visitor_id=${encodeURIComponent(visitorId)}`,
				{
					method: "GET",
					includeVisitor: true,
					refreshVisitorTokenIfNeeded: true,
					useApiEnvelope: true,
				},
			);
			return parseJson(response, "Unable to load partner dashboard");
		}, "Unable to load partner dashboard");
	},

	async upsertProfile({ displayName, referralCode }) {
		return safePartnerCall(async () => {
			const visitorId = await ensureVisitorContext();
			const csrfToken = await ensureCsrfToken();
			const body = {
				visitor_id: visitorId,
				display_name: String(displayName || "").trim(),
				referral_code: sanitizeCode(referralCode) || null,
			};
			const response = await apiFetch("/partner/profile", {
				method: "POST",
				includeVisitor: true,
				refreshVisitorTokenIfNeeded: true,
				useApiEnvelope: true,
				csrfToken,
				idempotencyKey: createIdempotencyKey(
					"/partner/profile",
					body,
					"partner",
				),
				body,
			});
			return parseJson(response, "Unable to save partner profile");
		}, "Unable to save partner profile");
	},

	async upsertBankSecrets({
		bankCode,
		accountName,
		accountNumber,
		promptpayId,
		bankCountry,
		currency,
		swiftCode,
		iban,
		routingNumber,
		bankName,
		branchName,
		accountType,
	}) {
		return safePartnerCall(async () => {
			const visitorId = await ensureVisitorContext();
			const csrfToken = await ensureCsrfToken();
			const body = {
				visitor_id: visitorId,
				bank_code: String(bankCode || "").toUpperCase(),
				account_name: String(accountName || "").trim(),
				account_number: String(accountNumber || "").trim() || null,
				promptpay_id: String(promptpayId || "").trim() || null,
				bank_country: String(bankCountry || "").trim() || null,
				currency:
					String(currency || "")
						.trim()
						.toUpperCase() || null,
				swift_code:
					String(swiftCode || "")
						.trim()
						.toUpperCase() || null,
				iban:
					String(iban || "")
						.trim()
						.toUpperCase() || null,
				routing_number: String(routingNumber || "").trim() || null,
				bank_name: String(bankName || "").trim() || null,
				branch_name: String(branchName || "").trim() || null,
				account_type: String(accountType || "").trim() || null,
			};
			const response = await apiFetch("/partner/bank", {
				method: "POST",
				includeVisitor: true,
				refreshVisitorTokenIfNeeded: true,
				useApiEnvelope: true,
				csrfToken,
				idempotencyKey: createIdempotencyKey("/partner/bank", body, "partner"),
				body,
			});
			return parseJson(response, "Unable to save payout settings");
		}, "Unable to save payout settings");
	},

	async requestPayout({ amount, currency = "THB", notes = "" }) {
		return safePartnerCall(async () => {
			const visitorId = await ensureVisitorContext();
			const csrfToken = await ensureCsrfToken();
			const body = {
				visitor_id: visitorId,
				amount: Number(amount || 0),
				currency: String(currency || "THB")
					.trim()
					.toUpperCase(),
				notes: String(notes || "").trim() || null,
			};
			const response = await apiFetch("/partner/payout/request", {
				method: "POST",
				includeVisitor: true,
				refreshVisitorTokenIfNeeded: true,
				useApiEnvelope: true,
				csrfToken,
				idempotencyKey: createIdempotencyKey(
					"/partner/payout/request",
					body,
					"payout",
				),
				body,
			});
			return parseJson(response, "Unable to request payout");
		}, "Unable to request payout");
	},

	subscribePayoutEvents({ onEvent, onError }) {
		const visitorId = getOrCreateVisitorId();
		return subscribePayoutEvents({
			visitorId,
			onEvent,
			onError,
		});
	},
};
