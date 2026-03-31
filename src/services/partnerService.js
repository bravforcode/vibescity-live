import i18n from "@/i18n.js";
import { isFrontendOnlyDevMode } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabase";
import { ApiClientError, apiFetch, parseApiError } from "./apiClient";
import { bootstrapVisitor, getOrCreateVisitorId } from "./visitorIdentity";

const API_SOURCE = "api";
const FALLBACK_SOURCE = "supabase_fallback";
const LOCAL_FALLBACK_SOURCE = "local_fallback";
const LOCAL_DEV_HOST_PATTERN = /^(localhost|127\.0\.0\.1)$/i;
const VERIFIED_ORDER_STATUSES = new Set(["verified", "paid"]);
const PARTNER_READ_TTL_MS = 60_000;
const partnerReadCache = new Map();

const shouldShortCircuitPartnerReadsInLocalDev = () =>
	import.meta.env.DEV &&
	typeof window !== "undefined" &&
	LOCAL_DEV_HOST_PATTERN.test(window.location.hostname) &&
	import.meta.env.VITE_API_PROXY_DEV !== "true";

const sanitizeCode = (value) =>
	String(value || "")
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, "")
		.toUpperCase()
		.slice(0, 24);

const ensureVisitorContext = async ({ allowBootstrapFailure = false } = {}) => {
	const visitorId = getOrCreateVisitorId();
	try {
		await bootstrapVisitor();
	} catch (error) {
		if (!allowBootstrapFailure) throw error;
	}
	return visitorId;
};

const withSource = (payload, source) => ({
	...(payload || {}),
	source,
});

const buildPartnerError = (message, fallback) => {
	const text = String(message || "").trim();
	if (!text) return fallback;
	const lowered = text.toLowerCase();
	if (
		lowered.includes("failed to fetch") ||
		lowered.includes("networkerror") ||
		lowered.includes("load failed") ||
		lowered.includes("cors")
	) {
		return "Partner API unreachable right now. Showing fallback data where possible.";
	}
	return text;
};

const buildPartnerServiceError = (code, message, options = {}) => {
	const error = new Error(String(message || "Partner service error"));
	error.name = "PartnerServiceError";
	error.code = String(code || "UNKNOWN");
	error.status = Number(options.status || 0);
	error.timeout = options.timeout === true;
	error.source = options.source || "";
	if (options.cause) error.cause = options.cause;
	return error;
};

const getCacheKey = (kind, visitorId) =>
	`${kind}:${String(visitorId || "anon")}`;

const readCachedPayload = (kind, visitorId) => {
	const hit = partnerReadCache.get(getCacheKey(kind, visitorId));
	if (!hit) return null;
	if (Date.now() - hit.cachedAt > PARTNER_READ_TTL_MS) {
		partnerReadCache.delete(getCacheKey(kind, visitorId));
		return null;
	}
	return hit.payload || null;
};

const writeCachedPayload = (kind, visitorId, payload) => {
	if (!payload) return payload;
	partnerReadCache.set(getCacheKey(kind, visitorId), {
		cachedAt: Date.now(),
		payload,
	});
	return payload;
};

const clearPartnerReadCache = (visitorId = "") => {
	const normalizedVisitorId = String(visitorId || "").trim();
	if (!normalizedVisitorId) {
		partnerReadCache.clear();
		return;
	}
	for (const key of [...partnerReadCache.keys()]) {
		if (key.endsWith(`:${normalizedVisitorId}`)) {
			partnerReadCache.delete(key);
		}
	}
};

const isNetworkLikeError = (error) => {
	const message = String(error?.message || "").toLowerCase();
	return (
		message.includes("failed to fetch") ||
		message.includes("networkerror") ||
		message.includes("load failed") ||
		message.includes("cors") ||
		message.includes("preflight")
	);
};

const fallbackEligible = (error) => {
	const status = Number(error?.status || 0);
	return status === 404 || status >= 500 || isNetworkLikeError(error);
};

const normalizePartnerValue = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

const matchesPartnerValue = (value) => {
	const normalized = normalizePartnerValue(value);
	return Boolean(normalized) && normalized.includes("partner_program");
};

const parseDateUtc = (value) => {
	if (!value) return null;
	const text = String(value).trim();
	if (!text) return null;
	const normalized = text.endsWith("Z") ? `${text.slice(0, -1)}+00:00` : text;
	const dt = new Date(normalized);
	return Number.isNaN(dt.getTime()) ? null : dt;
};

const fetchRowsByVisitor = async (
	table,
	selectExpr,
	visitorId,
	{ orderBy = "created_at", limit = 25, cutoffIso = null } = {},
) => {
	const columns = ["visitor_id", "visitor_id_uuid"];
	let lastError = null;
	let querySucceeded = false;

	for (const column of columns) {
		try {
			let query = supabase
				.from(table)
				.select(selectExpr)
				.eq(column, visitorId)
				.order(orderBy, { ascending: false })
				.limit(limit);

			if (cutoffIso) query = query.gte("created_at", cutoffIso);

			const { data, error } = await query;
			if (error) {
				lastError = error;
				continue;
			}
			querySucceeded = true;
			const rows = Array.isArray(data) ? data : [];
			if (rows.length > 0) return rows;
		} catch (error) {
			lastError = error;
		}
	}

	if (lastError && !querySucceeded) {
		throw lastError;
	}

	return [];
};

const fetchLatestSubscription = async (visitorId) => {
	const rows = await fetchRowsByVisitor(
		"subscriptions",
		"id,status,current_period_start,current_period_end,plan_code,metadata,created_at,updated_at",
		visitorId,
		{
			orderBy: "updated_at",
			limit: 25,
		},
	);
	return (
		rows.find((row) =>
			matchesPartnerValue(row?.plan_code || row?.metadata?.plan_code),
		) || null
	);
};

const fetchLatestPartnerOrder = async (visitorId) => {
	const rows = await fetchRowsByVisitor(
		"orders",
		"id,status,sku,metadata,created_at,updated_at",
		visitorId,
		{
			orderBy: "created_at",
			limit: 25,
		},
	);
	return (
		rows.find((row) =>
			[row?.sku, row?.metadata?.sku, row?.metadata?.plan_code].some(
				matchesPartnerValue,
			),
		) || null
	);
};

const fetchPartnerOrders90d = async (visitorId) => {
	const cutoffIso = new Date(
		Date.now() - 90 * 24 * 60 * 60 * 1000,
	).toISOString();
	const rows = await fetchRowsByVisitor(
		"orders",
		"id,status,amount,sku,metadata,created_at,updated_at",
		visitorId,
		{
			orderBy: "created_at",
			limit: 80,
			cutoffIso,
		},
	);
	return rows
		.filter((row) =>
			[row?.sku, row?.metadata?.sku, row?.metadata?.plan_code].some(
				matchesPartnerValue,
			),
		)
		.slice(0, 12);
};

const fetchPartnerProfileFallback = async (visitorId) => {
	const { data, error } = await supabase
		.from("partners")
		.select(
			"id,name,referral_code,status,metadata,created_at,updated_at,visitor_id",
		)
		.eq("visitor_id", visitorId)
		.order("created_at", { ascending: false })
		.limit(1);
	if (error) throw error;
	return Array.isArray(data) && data.length > 0 ? data[0] : null;
};

const buildLocalFallbackStatus = () => ({
	has_access: false,
	status: "inactive",
	current_period_end: null,
});

const buildLocalPartnerDashboardFallback = () =>
	withSource(
		{
			status: buildLocalFallbackStatus(),
			summary: {
				total_orders: 0,
				verified_orders: 0,
				total_paid_thb: 0,
				canonical_sku: "partner_program",
				canonical_plan_code: "partner_program",
			},
			profile: null,
			orders: [],
		},
		LOCAL_FALLBACK_SOURCE,
	);

const createHttpError = (message, status, code = "") => {
	const error = new Error(message);
	error.status = Number(status || 0);
	error.code = code || "";
	return error;
};

const resolvePartnerStatusFallback = async (visitorId) => {
	const now = new Date();
	const subscription = await fetchLatestSubscription(visitorId);
	if (subscription) {
		const rawStatus = String(subscription?.status || "inactive")
			.trim()
			.toLowerCase();
		const periodEnd = parseDateUtc(subscription?.current_period_end);
		let hasAccess =
			(rawStatus === "active" || rawStatus === "trialing") &&
			(!periodEnd || periodEnd > now);
		let status = rawStatus;
		if (rawStatus === "active" && periodEnd && periodEnd <= now) {
			hasAccess = false;
			status = "expired";
		}
		return {
			has_access: hasAccess,
			status,
			current_period_end: subscription?.current_period_end || null,
		};
	}

	const latestOrder = await fetchLatestPartnerOrder(visitorId);
	if (latestOrder) {
		const orderStatus = String(latestOrder?.status || "")
			.trim()
			.toLowerCase();
		if (orderStatus === "pending" || orderStatus === "pending_review") {
			return {
				has_access: false,
				status: "pending",
				current_period_end: null,
			};
		}
	}

	return buildLocalFallbackStatus();
};

const buildPartnerDashboardFallback = async (visitorId) => {
	try {
		const [status, orders, profile] = await Promise.all([
			resolvePartnerStatusFallback(visitorId),
			fetchPartnerOrders90d(visitorId),
			fetchPartnerProfileFallback(visitorId),
		]);

		const verifiedOrders = orders.filter((row) =>
			VERIFIED_ORDER_STATUSES.has(
				String(row?.status || "")
					.trim()
					.toLowerCase(),
			),
		);
		const totalPaid = verifiedOrders.reduce(
			(sum, row) => sum + Number(row?.amount || 0),
			0,
		);

		return withSource(
			{
				status,
				summary: {
					total_orders: orders.length,
					verified_orders: verifiedOrders.length,
					total_paid_thb: Number(totalPaid.toFixed(2)),
					canonical_sku: "partner_program",
					canonical_plan_code: "partner_program",
				},
				profile,
				orders,
			},
			FALLBACK_SOURCE,
		);
	} catch {
		return withSource(
			{
				status: buildLocalFallbackStatus(),
				summary: {
					total_orders: 0,
					verified_orders: 0,
					total_paid_thb: 0,
					canonical_sku: "partner_program",
					canonical_plan_code: "partner_program",
				},
				profile: null,
				orders: [],
			},
			LOCAL_FALLBACK_SOURCE,
		);
	}
};

const parseJson = async (response, fallback) => {
	if (!response.ok) {
		if (response.status === 404) {
			throw createHttpError(
				"ERR_PARTNER_API_MISSING",
				response.status,
				"RPC_404",
			);
		}
		if (response.status === 401) {
			throw createHttpError(
				i18n.global.t("auto.k_f212afc7"),
				response.status,
				"TOKEN_EXPIRED",
			);
		}
		if (response.status === 402) {
			throw createHttpError(
				"ERR_PARTNER_SUB_REQUIRED",
				response.status,
				"SUBSCRIPTION_REQUIRED",
			);
		}
		const message = await parseApiError(response, fallback);
		throw createHttpError(message, response.status, "RPC_ERROR");
	}
	return withSource(await response.json(), API_SOURCE);
};

const normalizePartnerServiceError = (error, fallbackMessage) => {
	if (error?.name === "PartnerServiceError") return error;
	if (error instanceof ApiClientError && error.timeout) {
		return buildPartnerServiceError("TIMEOUT", fallbackMessage, {
			status: error.status,
			timeout: true,
			cause: error,
		});
	}
	const status = Number(error?.status || 0);
	if (status === 401) {
		return buildPartnerServiceError(
			"TOKEN_EXPIRED",
			error?.message || i18n.global.t("auto.k_f212afc7"),
			{ status, cause: error },
		);
	}
	if (status >= 500) {
		return buildPartnerServiceError(
			"RPC_500",
			buildPartnerError(error?.message, fallbackMessage),
			{ status, cause: error },
		);
	}
	if (isNetworkLikeError(error)) {
		return buildPartnerServiceError(
			"NETWORK_FAIL",
			buildPartnerError(error?.message, fallbackMessage),
			{ status, cause: error },
		);
	}
	if (String(error?.code || "").toUpperCase() === "API_TIMEOUT") {
		return buildPartnerServiceError("TIMEOUT", fallbackMessage, {
			status,
			timeout: true,
			cause: error,
		});
	}
	return buildPartnerServiceError(
		status >= 500 ? "RPC_500" : "NETWORK_FAIL",
		buildPartnerError(error?.message, fallbackMessage),
		{ status, cause: error },
	);
};

const safePartnerCall = async (operation, fallbackMessage) => {
	try {
		return await operation();
	} catch (error) {
		throw normalizePartnerServiceError(error, fallbackMessage);
	}
};

const safePartnerRead = async (operation, fallbackMessage, fallbackLoader) => {
	try {
		return await operation();
	} catch (error) {
		if (!fallbackEligible(error)) {
			throw normalizePartnerServiceError(error, fallbackMessage);
		}
		return fallbackLoader();
	}
};

export const partnerService = {
	sanitizeCode,
	clearCache(visitorId) {
		clearPartnerReadCache(visitorId);
	},

	async getStatus({ force = false } = {}) {
		const visitorId = await ensureVisitorContext({
			allowBootstrapFailure: true,
		});
		if (!force) {
			const cached = readCachedPayload("status", visitorId);
			if (cached) return cached;
		}
		if (isFrontendOnlyDevMode() || shouldShortCircuitPartnerReadsInLocalDev()) {
			return writeCachedPayload(
				"status",
				visitorId,
				withSource(buildLocalFallbackStatus(), LOCAL_FALLBACK_SOURCE),
			);
		}

		const payload = await safePartnerRead(
			async () => {
				const response = await apiFetch(
					`/partner/status?visitor_id=${encodeURIComponent(visitorId)}`,
					{
						method: "GET",
						includeVisitor: true,
						refreshVisitorTokenIfNeeded: true,
					},
				);
				return parseJson(response, "Unable to load partner status");
			},
			"Unable to load partner status",
			async () => {
				try {
					return withSource(
						await resolvePartnerStatusFallback(visitorId),
						FALLBACK_SOURCE,
					);
				} catch {
					return withSource(buildLocalFallbackStatus(), LOCAL_FALLBACK_SOURCE);
				}
			},
		);
		return writeCachedPayload("status", visitorId, payload);
	},

	async getDashboard({ force = false } = {}) {
		const visitorId = await ensureVisitorContext({
			allowBootstrapFailure: true,
		});
		if (!force) {
			const cached = readCachedPayload("dashboard", visitorId);
			if (cached) return cached;
		}
		if (isFrontendOnlyDevMode() || shouldShortCircuitPartnerReadsInLocalDev()) {
			return writeCachedPayload(
				"dashboard",
				visitorId,
				buildLocalPartnerDashboardFallback(),
			);
		}

		const payload = await safePartnerRead(
			async () => {
				const response = await apiFetch(
					`/partner/dashboard?visitor_id=${encodeURIComponent(visitorId)}`,
					{
						method: "GET",
						includeVisitor: true,
						refreshVisitorTokenIfNeeded: true,
					},
				);
				return parseJson(response, "Unable to load partner dashboard");
			},
			"Unable to load partner dashboard",
			async () => buildPartnerDashboardFallback(visitorId),
		);
		return writeCachedPayload("dashboard", visitorId, payload);
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
