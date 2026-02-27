import { apiFetch, parseApiError } from "./apiClient";
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
	if (!response.ok) {
		if (response.status === 404) {
			throw new Error(
				"Partner API endpoint not found. Deploy backend with /api/v1/partner routes.",
			);
		}
		if (response.status === 401) {
			throw new Error("Visitor session expired. Please refresh and try again.");
		}
		if (response.status === 402) {
			throw new Error(
				"Partner subscription is required before this action can be used.",
			);
		}
		const message = await parseApiError(response, fallback);
		throw new Error(message);
	}
	return response.json();
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
				},
			);
			return parseJson(response, "Unable to load partner dashboard");
		}, "Unable to load partner dashboard");
	},

	async upsertProfile({ displayName, referralCode }) {
		return safePartnerCall(async () => {
			const visitorId = await ensureVisitorContext();
			const response = await apiFetch("/partner/profile", {
				method: "POST",
				includeVisitor: true,
				refreshVisitorTokenIfNeeded: true,
				body: {
					visitor_id: visitorId,
					display_name: String(displayName || "").trim(),
					referral_code: sanitizeCode(referralCode) || null,
				},
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
			const response = await apiFetch("/partner/bank", {
				method: "POST",
				includeVisitor: true,
				refreshVisitorTokenIfNeeded: true,
				body: {
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
				},
			});
			return parseJson(response, "Unable to save payout settings");
		}, "Unable to save payout settings");
	},
};
