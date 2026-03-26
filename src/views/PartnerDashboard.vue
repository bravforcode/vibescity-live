<script setup lang="ts">
import generatePayload from "promptpay-qr";
import QrcodeVue from "qrcode.vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import ErrorBoundary from "@/components/ui/ErrorBoundary.vue";
import { usePermission } from "@/composables/usePermission";
import {
	emitPartnerSignupSuccess,
	onPartnerSignupSuccess,
} from "@/lib/appEvents";
import { frontendObservabilityService } from "@/services/frontendObservabilityService";
import { mask } from "@/utils/dataMasking";
import {
	PAYOUT_COUNTRY_OPTIONS,
	PAYOUT_CURRENCY_OPTIONS,
	THAI_BANK_OPTIONS,
} from "../constants/bankCatalog";
import { partnerService } from "../services/partnerService";
import { paymentService } from "../services/paymentService";
import {
	bootstrapVisitor,
	getOrCreateVisitorId,
} from "../services/visitorIdentity";
import { useFeatureFlagStore } from "../store/featureFlagStore";
import { useUserStore } from "../store/userStore";

const featureFlagStore = useFeatureFlagStore();
const userStore = useUserStore();
const router = useRouter();
const route = useRoute();

// Manual payment constants (same as MerchantRegister)
const PROMPTPAY_ID = "0113222743";
const BANK_NAME = "Kasikorn Bank (K-Bank)";
const BANK_ACCOUNT_DISPLAY = "011-3-22274-3";
const ACCOUNT_NAME = "Somchai Suwanwiang";
const PARTNER_PRICE = 899;
const ACCESS_STATES = Object.freeze({
	BOOT: "boot",
	FEATURE_FLAG_CHECK: "feature_flag_check",
	CONTEXT_RESOLVE: "context_resolve",
	ACCESS_CHECK: "access_check",
	GATED_ACCESS: "gated_access",
	FULL_ACCESS: "full_access",
	ERROR_OR_TIMEOUT: "error_or_timeout",
});
const ACCESS_ERROR_TYPES = Object.freeze({
	NETWORK_FAIL: "NETWORK_FAIL",
	TOKEN_EXPIRED: "TOKEN_EXPIRED",
	RPC_500: "RPC_500",
	TIMEOUT: "TIMEOUT",
	FEATURE_DISABLED: "FEATURE_DISABLED",
});
type AccessState = (typeof ACCESS_STATES)[keyof typeof ACCESS_STATES];
type AccessErrorType =
	(typeof ACCESS_ERROR_TYPES)[keyof typeof ACCESS_ERROR_TYPES];
const LOADING_ACCESS_STATES: AccessState[] = [
	ACCESS_STATES.BOOT,
	ACCESS_STATES.FEATURE_FLAG_CHECK,
	ACCESS_STATES.CONTEXT_RESOLVE,
	ACCESS_STATES.ACCESS_CHECK,
];
const RETRYABLE_ACCESS_ERRORS = new Set<AccessErrorType>([
	ACCESS_ERROR_TYPES.NETWORK_FAIL,
	ACCESS_ERROR_TYPES.RPC_500,
	ACCESS_ERROR_TYPES.TIMEOUT,
]);
const CONTEXT_RESOLVE_TIMEOUT_MS = 3000;
const ACCESS_CHECK_TIMEOUT_MS = 2000;
const ACCESS_BACKGROUND_RETRY_DELAY_MS = 1200;
const PAID_ORDER_STATUSES = new Set([
	"active",
	"paid",
	"succeeded",
	"verified",
	"complete",
	"completed",
]);

const buildFallbackStatus = () => ({
	has_access: false,
	status: "inactive",
	current_period_end: null,
	source: "local_fallback",
});

const buildFallbackSummary = () => ({
	total_orders: 0,
	verified_orders: 0,
	total_paid_thb: 0,
	canonical_sku: "partner_program",
	canonical_plan_code: "partner_program",
});

const paymentTab = ref("qr"); // "qr" | "bank"
const showManualPayment = ref(false);

const qrPayload = computed(() => {
	if (PARTNER_PRICE <= 0) return "";
	return generatePayload(PROMPTPAY_ID, { amount: PARTNER_PRICE });
});

const copyAccountNumber = async () => {
	try {
		await navigator.clipboard.writeText(BANK_ACCOUNT_DISPLAY.replace(/-/g, ""));
	} catch {
		// ignore
	}
};

const toggleRevenueReveal = () => {
	if (!canRevealSensitive.value) return;
	if (!isRevenueRevealed.value && typeof window !== "undefined") {
		const confirmed = window.confirm(
			"Reveal sensitive financial amount on this screen?",
		);
		if (!confirmed) return;
	}
	isRevenueRevealed.value = !isRevenueRevealed.value;
};

// Tab state for mobile forms
const activeTab = ref("profile"); // "profile" | "payout"

const isLoading = ref(true);
const errorMessage = ref("");
const accessState = ref<AccessState>(ACCESS_STATES.BOOT);
const accessErrorType = ref<AccessErrorType | "">("");
const accessErrorMessage = ref("");
const accessRetryScheduled = ref(false);
const isSavingProfile = ref(false);
const isSavingBank = ref(false);
const isStartingSubscription = ref(false);
const isRevenueRevealed = ref(false);

const visitorId = ref("");
const status = ref(buildFallbackStatus());
const summary = ref<any>(buildFallbackSummary());
const profile = ref<any>(null);
const orders = ref<any[]>([]);
let accessRetryTimer: number | null = null;
let removePartnerSignupListener = () => {};

const profileForm = reactive({
	displayName: "",
	referralCode: "",
});

const bankForm = reactive({
	bankCode: "KBANK",
	accountName: "",
	accountNumber: "",
	promptpayId: "",
	bankCountry: "TH",
	currency: "THB",
	swiftCode: "",
	iban: "",
	routingNumber: "",
	bankName: "",
	branchName: "",
	accountType: "savings",
});

const partnerEnabled = computed(() =>
	featureFlagStore.isEnabled("enable_partner_program"),
);
const { hasPermission: canViewFinancial } = usePermission("view:financial");
const { hasPermission: canEditBank } = usePermission("edit:bank");
const { hasPermission: canManageProfile } = usePermission("view:kpi");
const hasAccess = computed(() => Boolean(status.value?.has_access));
const statusLabel = computed(() =>
	String(status.value?.status || "inactive").toUpperCase(),
);
const canRevealSensitive = computed(
	() =>
		featureFlagStore.isEnabled("ff_sensitive_reveal") &&
		Boolean(canViewFinancial.value),
);
const totalPaidDisplay = computed(() =>
	isRevenueRevealed.value
		? formatMoney(summary.value?.total_paid_thb)
		: mask.revenue(summary.value?.total_paid_thb, "partner"),
);
const paywallReason = computed(() =>
	hasAccess.value
		? ""
		: "Unlock required: start Partner Program to use profile/bank actions.",
);
const bankOptions = computed(() => THAI_BANK_OPTIONS);
const countryOptions = computed(() => PAYOUT_COUNTRY_OPTIONS);
const currencyOptions = computed(() => PAYOUT_CURRENCY_OPTIONS);
const isThaiPayout = computed(() => bankForm.bankCountry === "TH");
const isFeatureDisabled = computed(
	() => accessErrorType.value === ACCESS_ERROR_TYPES.FEATURE_DISABLED,
);
const isTokenExpiredState = computed(
	() => accessErrorType.value === ACCESS_ERROR_TYPES.TOKEN_EXPIRED,
);
const showAccessErrorCard = computed(
	() =>
		accessState.value === ACCESS_STATES.ERROR_OR_TIMEOUT &&
		!isFeatureDisabled.value,
);
const showRetryButton = computed(() =>
	RETRYABLE_ACCESS_ERRORS.has(accessErrorType.value as AccessErrorType),
);

const referralLink = computed(() => {
	const code = String(
		profile.value?.referral_code || profileForm.referralCode || "",
	).trim();
	if (!code) return "";
	return `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
});

const formatMoney = (value: any) => {
	const num = Number(value || 0);
	return new Intl.NumberFormat("th-TH", {
		style: "currency",
		currency: "THB",
		maximumFractionDigits: 2,
	}).format(Number.isFinite(num) ? num : 0);
};

const formatDate = (value: any) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("th-TH", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const uniqueMessages = (messages: any[] = []) =>
	[
		...new Set(
			messages.map((message) => String(message || "").trim()).filter(Boolean),
		),
	].join(" ");

const setAccessState = (nextState: AccessState) => {
	accessState.value = nextState;
	isLoading.value = LOADING_ACCESS_STATES.includes(nextState);
};

const clearAccessRetryTimer = () => {
	if (!accessRetryTimer) return;
	clearTimeout(accessRetryTimer);
	accessRetryTimer = null;
	accessRetryScheduled.value = false;
};

const resetFallbackDashboardShell = () => {
	status.value = buildFallbackStatus();
	summary.value = buildFallbackSummary();
	profile.value = null;
	orders.value = [];
	hydrateFormsFromProfile();
};

const withTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
) =>
	new Promise<T>((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			reject({
				name: "PartnerAccessTimeoutError",
				code: ACCESS_ERROR_TYPES.TIMEOUT,
				timeout: true,
				message,
			});
		}, timeoutMs);

		Promise.resolve(promise)
			.then((value) => {
				clearTimeout(timeoutId);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timeoutId);
				reject(error);
			});
	});

const classifyAccessErrorType = (error: any): AccessErrorType => {
	const code = String(error?.code || "")
		.trim()
		.toUpperCase();
	const statusCode = Number(error?.status || 0);
	if (code === ACCESS_ERROR_TYPES.FEATURE_DISABLED) {
		return ACCESS_ERROR_TYPES.FEATURE_DISABLED;
	}
	if (
		code === ACCESS_ERROR_TYPES.TIMEOUT ||
		error?.timeout === true ||
		error?.name === "PartnerAccessTimeoutError"
	) {
		return ACCESS_ERROR_TYPES.TIMEOUT;
	}
	if (code === ACCESS_ERROR_TYPES.TOKEN_EXPIRED || statusCode === 401) {
		return ACCESS_ERROR_TYPES.TOKEN_EXPIRED;
	}
	if (code === ACCESS_ERROR_TYPES.RPC_500 || statusCode >= 500) {
		return ACCESS_ERROR_TYPES.RPC_500;
	}
	return ACCESS_ERROR_TYPES.NETWORK_FAIL;
};

const buildAccessErrorMessage = (type: string, error: any) => {
	if (type === ACCESS_ERROR_TYPES.TOKEN_EXPIRED) {
		return "Your session expired. Sign in again to manage Partner Program.";
	}
	if (type === ACCESS_ERROR_TYPES.RPC_500) {
		return String(
			error?.message || "Partner Program is temporarily unavailable.",
		);
	}
	if (type === ACCESS_ERROR_TYPES.TIMEOUT) {
		return "Partner Program is taking too long to respond. Retrying in the background.";
	}
	if (type === ACCESS_ERROR_TYPES.FEATURE_DISABLED) {
		return "Partner Program is temporarily disabled.";
	}
	return String(
		error?.message || "Partner Program could not be loaded right now.",
	);
};

const reportPartnerRouteState = (
	eventType: string,
	metadata: Record<string, any>,
) => {
	void frontendObservabilityService.reportPartnerRoute(eventType, {
		route: route.path,
		locale: String(route.params?.locale || "en"),
		...metadata,
	});
};

const randomReferralCode = () => {
	const base = "PARTNER";
	const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
	return partnerService.sanitizeCode(`${base}${suffix}`) || "VIBEPARTNER";
};

const hydrateFormsFromProfile = () => {
	profileForm.displayName = String(
		profile.value?.name || profileForm.displayName || "",
	).trim();
	profileForm.referralCode =
		partnerService.sanitizeCode(
			profile.value?.referral_code || profileForm.referralCode,
		) || randomReferralCode();

	const bank =
		profile.value && typeof profile.value.metadata === "object"
			? profile.value.metadata?.bank || {}
			: {};
	if (bank.bank_code) bankForm.bankCode = String(bank.bank_code).toUpperCase();
	if (bank.account_name) bankForm.accountName = String(bank.account_name);
	if (bank.bank_country) bankForm.bankCountry = String(bank.bank_country);
	if (bank.currency) bankForm.currency = String(bank.currency).toUpperCase();
	if (bank.swift_code) bankForm.swiftCode = String(bank.swift_code);
	if (bank.iban) bankForm.iban = String(bank.iban);
	if (bank.routing_number) bankForm.routingNumber = String(bank.routing_number);
	if (bank.bank_name) bankForm.bankName = String(bank.bank_name);
	if (bank.branch_name) bankForm.branchName = String(bank.branch_name);
	if (bank.account_type) bankForm.accountType = String(bank.account_type);
};

const resolveHomePath = () => {
	const locale = String(route.params?.locale || "")
		.trim()
		.toLowerCase();
	if (locale === "th" || locale === "en") {
		return `/${locale}`;
	}
	return "/en";
};

const exitPartnerDashboard = () => {
	void router.push(resolveHomePath());
};

const scheduleBackgroundRetry = () => {
	if (accessRetryScheduled.value || typeof window === "undefined") return;
	accessRetryScheduled.value = true;
	accessRetryTimer = window.setTimeout(() => {
		accessRetryTimer = null;
		accessRetryScheduled.value = false;
		void loadDashboard({
			force: true,
			reason: "background_retry",
			allowBackgroundRetry: false,
		});
	}, ACCESS_BACKGROUND_RETRY_DELAY_MS);
};

const handleAccessFailure = (
	error: any,
	{ reason = "unknown", allowBackgroundRetry = true } = {},
) => {
	const nextErrorType = classifyAccessErrorType(error);
	accessErrorType.value = nextErrorType;
	accessErrorMessage.value = buildAccessErrorMessage(nextErrorType, error);
	setAccessState(ACCESS_STATES.ERROR_OR_TIMEOUT);
	resetFallbackDashboardShell();
	reportPartnerRouteState("route_error", {
		reason,
		code: nextErrorType,
		message: accessErrorMessage.value,
	});
	if (nextErrorType === ACCESS_ERROR_TYPES.TIMEOUT && allowBackgroundRetry) {
		scheduleBackgroundRetry();
	}
};

const loadDashboard = async ({
	force = false,
	reason = "initial_load",
	allowBackgroundRetry = true,
} = {}) => {
	clearAccessRetryTimer();
	accessErrorType.value = "";
	accessErrorMessage.value = "";
	setAccessState(ACCESS_STATES.FEATURE_FLAG_CHECK);

	try {
		await featureFlagStore.refreshFlags({ force });
		if (!partnerEnabled.value) {
			resetFallbackDashboardShell();
			accessErrorType.value = ACCESS_ERROR_TYPES.FEATURE_DISABLED;
			accessErrorMessage.value = buildAccessErrorMessage(
				ACCESS_ERROR_TYPES.FEATURE_DISABLED,
				null,
			);
			setAccessState(ACCESS_STATES.GATED_ACCESS);
			reportPartnerRouteState("route_gated", {
				reason: "feature_disabled",
				source: "feature_flag",
			});
			return;
		}

		setAccessState(ACCESS_STATES.CONTEXT_RESOLVE);
		try {
			visitorId.value = getOrCreateVisitorId();
		} catch {
			visitorId.value = "anonymous";
		}

		const [bootstrapResult, authResult] = await withTimeout(
			Promise.allSettled([bootstrapVisitor(), userStore.refreshAuth()]),
			CONTEXT_RESOLVE_TIMEOUT_MS,
			"Partner context is taking too long to resolve.",
		);
		if (bootstrapResult.status === "rejected" && import.meta.env.DEV) {
			console.warn(
				"Partner bootstrap fallback engaged:",
				bootstrapResult.reason,
			);
		}
		if (authResult.status === "rejected") {
			throw authResult.reason;
		}

		setAccessState(ACCESS_STATES.ACCESS_CHECK);

		const [statusResult, dashboardResult] = await Promise.allSettled([
			withTimeout(
				partnerService.getStatus({ force }),
				ACCESS_CHECK_TIMEOUT_MS,
				"Partner status timed out.",
			),
			withTimeout(
				partnerService.getDashboard({ force }),
				ACCESS_CHECK_TIMEOUT_MS,
				"Partner dashboard timed out.",
			),
		]);

		const failureMessages: string[] = [];
		let nextStatus: any = null;
		let dashboardPayload: any = null;
		let fatalError: any = null;

		if (statusResult.status === "fulfilled") {
			nextStatus = statusResult.value || null;
		} else {
			fatalError = statusResult.reason;
			failureMessages.push(
				statusResult.reason?.message || "Unable to load partner status.",
			);
		}

		if (dashboardResult.status === "fulfilled") {
			dashboardPayload = dashboardResult.value || null;
		} else {
			fatalError ||= dashboardResult.reason;
			failureMessages.push(
				dashboardResult.reason?.message || "Unable to load partner dashboard.",
			);
		}

		if (!nextStatus && dashboardPayload?.status) {
			nextStatus = dashboardPayload.status;
		}

		if (!nextStatus && !dashboardPayload) {
			throw fatalError || new Error("Unable to resolve partner access.");
		}

		status.value = nextStatus || buildFallbackStatus();
		summary.value = dashboardPayload?.summary || buildFallbackSummary();
		profile.value = dashboardPayload?.profile || null;
		orders.value = Array.isArray(dashboardPayload?.orders)
			? dashboardPayload.orders
			: [];
		hydrateFormsFromProfile();

		errorMessage.value = uniqueMessages(failureMessages);
		if (hasAccess.value) {
			setAccessState(ACCESS_STATES.FULL_ACCESS);
			reportPartnerRouteState("route_loaded", {
				reason,
				state: ACCESS_STATES.FULL_ACCESS,
				source:
					status.value?.source || dashboardPayload?.source || "unknown_source",
			});
			return;
		}

		setAccessState(ACCESS_STATES.GATED_ACCESS);
		reportPartnerRouteState("route_gated", {
			reason,
			state: ACCESS_STATES.GATED_ACCESS,
			source:
				status.value?.source || dashboardPayload?.source || "unknown_source",
		});
	} catch (error) {
		handleAccessFailure(error, { reason, allowBackgroundRetry });
	}
};

const retryDashboardAccess = async () => {
	partnerService.clearCache(visitorId.value || "");
	await loadDashboard({
		force: true,
		reason: "manual_retry",
		allowBackgroundRetry: false,
	});
};

const refreshAfterPartnerSignup = async (source = "manual") => {
	partnerService.clearCache(visitorId.value || "");
	await userStore.refreshAuth();
	await loadDashboard({
		force: true,
		reason: `signup_success:${source}`,
		allowBackgroundRetry: false,
	});
};

const handleCheckoutReturn = async () => {
	const sessionId = String(route.query?.session_id || "").trim();
	if (!sessionId) return;
	try {
		const orderStatus = await paymentService.getOrderStatus(sessionId);
		const normalized = String(orderStatus?.status || "")
			.trim()
			.toLowerCase();
		if (PAID_ORDER_STATUSES.has(normalized)) {
			emitPartnerSignupSuccess({
				userId: userStore.userId || undefined,
				tier: "partner_program",
				source: "checkout",
			});
		}
	} catch {
		// Non-blocking: the normal dashboard refresh path still runs.
	} finally {
		const nextQuery = { ...route.query };
		delete nextQuery.session_id;
		delete nextQuery.sessionId;
		if (
			Object.keys(nextQuery).length !== Object.keys(route.query || {}).length
		) {
			void router.replace({ query: nextQuery });
		}
	}
};

const createOrUpdateProfile = async () => {
	if (!canManageProfile.value) {
		errorMessage.value = "Permission denied for profile update.";
		return;
	}
	if (!hasAccess.value) {
		await startPartnerSubscription();
		return;
	}
	isSavingProfile.value = true;
	errorMessage.value = "";
	try {
		profile.value = await partnerService.upsertProfile({
			displayName: profileForm.displayName,
			referralCode: profileForm.referralCode,
		});
		await loadDashboard({
			force: true,
			reason: "profile_saved",
			allowBackgroundRetry: false,
		});
	} catch (error) {
		errorMessage.value = error?.message || "Unable to save partner profile.";
	} finally {
		isSavingProfile.value = false;
	}
};

const startPartnerSubscription = async () => {
	isStartingSubscription.value = true;
	errorMessage.value = "";
	try {
		const { url } = await paymentService.createCheckoutSession(
			null,
			[{ sku: "partner_program", quantity: 1 }],
			{
				purchaseMode: "subscription",
				paymentPreferences: {
					methodStrategy: "dynamic",
					allowInternational: true,
					preferPromptPay: true,
					bankCountry: bankForm.bankCountry,
					currency: bankForm.currency,
				},
			},
		);
		if (url) window.location.href = url;
	} catch (error) {
		const rawMessage = String(error?.message || "");
		if (/missing stripe server config/i.test(rawMessage)) {
			showManualPayment.value = true;
			paymentTab.value = "qr";
			errorMessage.value =
				"Online card checkout is temporarily unavailable. Please use Bank Transfer / QR below.";
		} else {
			errorMessage.value =
				error?.message || "Unable to start partner subscription.";
		}
	} finally {
		isStartingSubscription.value = false;
	}
};

const saveBank = async () => {
	if (!canEditBank.value) {
		errorMessage.value = "Permission denied for payout configuration.";
		return;
	}
	if (!hasAccess.value) {
		await startPartnerSubscription();
		return;
	}
	isSavingBank.value = true;
	errorMessage.value = "";
	try {
		await partnerService.upsertBankSecrets({
			bankCode: bankForm.bankCode,
			accountName: bankForm.accountName,
			accountNumber: bankForm.accountNumber,
			promptpayId: bankForm.promptpayId,
			bankCountry: bankForm.bankCountry,
			currency: bankForm.currency,
			swiftCode: bankForm.swiftCode,
			iban: bankForm.iban,
			routingNumber: bankForm.routingNumber,
			bankName: bankForm.bankName,
			branchName: bankForm.branchName,
			accountType: bankForm.accountType,
		});
		bankForm.accountNumber = "";
		bankForm.promptpayId = "";
		bankForm.swiftCode = "";
		bankForm.iban = "";
		bankForm.routingNumber = "";
		await loadDashboard({
			force: true,
			reason: "bank_saved",
			allowBackgroundRetry: false,
		});
	} catch (error) {
		errorMessage.value = error?.message || "Unable to save payout settings.";
	} finally {
		isSavingBank.value = false;
	}
};

const copyReferralLink = async () => {
	if (!referralLink.value) return;
	try {
		await navigator.clipboard.writeText(referralLink.value);
	} catch {
		// ignore clipboard failure
	}
};

const handlePartnerBoundaryRetry = (reset?: () => void) => {
	reset?.();
	void retryDashboardAccess();
};

onMounted(() => {
	removePartnerSignupListener = onPartnerSignupSuccess((payload) => {
		void refreshAfterPartnerSignup(payload?.source || "manual");
	});
	void handleCheckoutReturn();
	void loadDashboard({
		force: true,
		reason: "mounted",
	});
});

onUnmounted(() => {
	clearAccessRetryTimer();
	removePartnerSignupListener();
});
</script>

<template>
  <main
    class="relative z-50 isolate min-h-dvh overflow-x-hidden w-full max-w-full px-4 pb-8 pt-20 text-white md:px-6 md:pt-24"
    :aria-label="$t('auto.k_203425a5')"
    data-testid="partner-dashboard-root"
  >
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#08091a]" aria-hidden="true">
      <div class="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-[100px]" />
      <div class="absolute -left-24 -top-20 h-72 w-72 rounded-full bg-blue-500/20 blur-[100px]" />
      <div class="absolute bottom-[-160px] left-1/4 h-96 w-96 rounded-full bg-cyan-500/15 blur-[110px]" />
    </div>

    <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 md:gap-5">
      <header class="relative overflow-hidden rounded-2xl border border-white/10 bg-gray-900/90 p-5 shadow-2xl backdrop-blur-xl md:p-6">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/10" />
        <div class="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-2">
            <p class="text-[11px] font-black uppercase tracking-[0.3em] text-white/55">{{ $t('auto.k_b0128d7d') }}</p>
            <h1 class="text-2xl font-black leading-tight md:text-3xl">
              <span class="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">{{ $t('auto.k_d76cf692') }}</span>
            </h1>
            <p class="max-w-2xl text-sm text-white/70 md:text-base">{{ $t('auto.k_e810bff8') }}</p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10"
              :disabled="isLoading"
              @click="loadDashboard({ force: true, reason: 'manual_refresh', allowBackgroundRetry: false })"
            >
              Refresh
            </button>
            <button
              type="button"
              class="rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-3 py-2 text-xs font-black text-white shadow-lg transition hover:scale-[1.02] active:scale-[0.98]"
              @click="exitPartnerDashboard"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      <ErrorBoundary>
        <template #fallback="{ reset }">
          <section
            class="rounded-2xl border border-red-500/30 bg-red-950/35 p-4 shadow-2xl"
            data-testid="partner-error-card"
            role="alert"
          >
            <h2 class="text-base font-black text-red-100">Partner dashboard crashed while rendering.</h2>
            <p class="mt-1 text-sm text-red-100/80">
              The page shell is still active. Retry the route content without leaving this screen.
            </p>
            <button
              type="button"
              class="mt-3 rounded-xl border border-red-200/20 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15"
              data-testid="partner-error-retry-btn"
              @click="handlePartnerBoundaryRetry(reset)"
            >
              Retry
            </button>
          </section>
        </template>

      <section v-if="isLoading" class="rounded-2xl border border-white/10 bg-gray-900/85 p-4 shadow-2xl backdrop-blur-xl" aria-live="polite" data-testid="partner-loading-shell">
        <div class="flex items-center gap-3">
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" aria-hidden="true" />
          <p class="text-sm text-white/75">{{ $t('auto.k_903ab19f') }}</p>
        </div>
        <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div v-for="n in 6" :key="`partner-stat-skeleton-${n}`" class="min-w-0 h-20 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
        </div>
      </section>

      <template v-else>
        <section v-if="isFeatureDisabled || !partnerEnabled" class="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-100" role="alert" data-testid="partner-maintenance-shell">
          <h2 class="text-base font-black text-amber-200">{{ $t('auto.k_4f943d97') }}</h2>
          <p class="mt-1 text-sm text-amber-100/90">
            {{ $t('auto.k_afbe4519') }}
            <code class="rounded bg-black/30 px-1.5 py-0.5 text-xs">enable_partner_program</code>
            {{ $t('auto.k_5d743acc') }}
          </p>
        </section>

        <template v-else>
          <section
            v-if="showAccessErrorCard"
            class="rounded-2xl border border-red-500/25 bg-red-950/30 p-4 text-red-50 shadow-2xl"
            data-testid="partner-error-card"
            role="alert"
          >
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 class="text-base font-black">
                  {{ isTokenExpiredState ? "Session refresh needed" : "Partner Program is recovering" }}
                </h2>
                <p
                  v-if="isTokenExpiredState"
                  class="mt-1 text-sm text-red-100/80"
                  data-testid="partner-signin-prompt"
                >
                  {{ accessErrorMessage }}
                </p>
                <p
                  v-else
                  class="mt-1 text-sm text-red-100/80"
                >
                  {{ accessErrorMessage }}
                </p>
              </div>

              <button
                v-if="showRetryButton"
                type="button"
                class="rounded-xl border border-red-200/20 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15"
                data-testid="partner-error-retry-btn"
                @click="retryDashboardAccess"
              >
                Retry
              </button>
            </div>
          </section>

          <div :data-testid="accessState === ACCESS_STATES.FULL_ACCESS ? 'partner-full-dashboard' : undefined" class="contents">
          <section
            class="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
            :aria-label="$t('auto.k_d89ccc97')"
            data-testid="partner-stat-strip"
          >
            <article class="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Access</p>
              <p
                class="mt-2 text-lg font-black"
                :class="hasAccess ? 'text-emerald-300' : 'text-amber-300'"
              >
                {{ hasAccess ? "PAID" : "UNPAID" }}
              </p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Status</p>
              <p class="mt-2 text-lg font-black text-white">{{ statusLabel }}</p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Renews</p>
              <p class="mt-2 text-sm font-bold text-white/90">{{ formatDate(status.current_period_end) }}</p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">{{ $t('auto.k_7842dd7e') }}</p>
              <p class="mt-2 text-lg font-black text-white">{{ Number(summary?.total_orders || 0) }}</p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Verified</p>
              <p class="mt-2 text-lg font-black text-white">{{ Number(summary?.verified_orders || 0) }}</p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">{{ $t('auto.k_220b1871') }}</p>
              <p class="mt-2 text-sm font-black text-emerald-300">{{ totalPaidDisplay }}</p>
              <button
                v-if="canRevealSensitive"
                type="button"
                class="mt-2 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-bold text-white/85 transition hover:bg-white/15"
                @click="toggleRevenueReveal"
              >
                {{ isRevenueRevealed ? "Hide" : "Reveal" }}
              </button>
            </article>
          </section>

          <section
            class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl md:p-5"
            data-testid="partner-subscription-panel"
          >
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 class="text-lg font-black text-white">Subscription</h2>
                <p class="mt-1 text-sm text-white/55">{{ $t('auto.k_8bd0ab97') }}</p>
                <p v-if="!hasAccess" class="mt-1 text-xs text-amber-200">{{ paywallReason }}</p>
              </div>

              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
                  :disabled="isStartingSubscription"
                  :data-testid="!hasAccess ? 'partner-gate-cta' : undefined"
                  @click="startPartnerSubscription"
                >
                  {{
                    isStartingSubscription
                      ? "Opening checkout..."
                      : hasAccess
                        ? "Manage Subscription"
                        : "Pay with Card / PromptPay"
                  }}
                </button>

                <button
                  v-if="!hasAccess"
                  type="button"
                  class="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                  @click="showManualPayment = !showManualPayment"
                >
                  {{ showManualPayment ? "Hide Transfer Info" : "Bank Transfer / QR" }}
                </button>
              </div>
            </div>

            <div v-if="showManualPayment && !hasAccess" class="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div class="mb-4 flex rounded-xl border border-white/10 bg-black/40 p-1">
                <button
                  type="button"
                  class="flex-1 rounded-lg px-3 py-2 text-xs font-bold transition"
                  :class="paymentTab === 'qr' ? 'bg-white text-black' : 'text-white/65 hover:text-white'"
                  @click="paymentTab = 'qr'"
                >
                  {{ $t('auto.k_334aaf1b') }}
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-lg px-3 py-2 text-xs font-bold transition"
                  :class="paymentTab === 'bank' ? 'bg-white text-black' : 'text-white/65 hover:text-white'"
                  @click="paymentTab = 'bank'"
                >
                  {{ $t('auto.k_24cd9456') }}
                </button>
              </div>

              <div v-if="paymentTab === 'qr'" class="flex flex-col items-center gap-2 rounded-xl bg-white p-4 text-black">
                <div class="rounded-lg bg-white p-2">
                  <qrcode-vue
                    v-if="qrPayload"
                    :value="qrPayload"
                    :size="180"
                    level="H"
                  />
                </div>
                <p class="text-xs font-black">{{ $t('auto.k_b1b13573') }} {{ PARTNER_PRICE.toLocaleString() }} THB</p>
                <p class="text-xs text-gray-600">{{ $t('auto.k_31b8251a') }} {{ PROMPTPAY_ID }}</p>
              </div>

              <div v-else class="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-white/60">{{ $t('auto.k_e41a07b6') }}</span>
                  <span class="font-bold">{{ BANK_NAME }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-white/60">{{ $t('auto.k_a86d4ce5') }}</span>
                  <button
                    type="button"
                    class="rounded-lg border border-white/20 bg-black/30 px-3 py-2 font-mono text-xs text-white transition hover:bg-white/10"
                    @click="copyAccountNumber"
                  >
                    {{ BANK_ACCOUNT_DISPLAY }}
                  </button>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-white/60">{{ $t('auto.k_993dc46f') }}</span>
                  <span class="font-bold">{{ ACCOUNT_NAME }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-white/60">Amount</span>
                  <span class="font-black text-emerald-300">{{ PARTNER_PRICE.toLocaleString() }} THB</span>
                </div>
              </div>

              <p class="mt-3 text-xs text-white/60">{{ $t('auto.k_bd2e6383') }}</p>
            </div>
          </section>

          <div
            class="flex rounded-2xl border border-white/10 bg-black/40 p-1"
            role="tablist"
            :aria-label="$t('auto.k_922f6a8e')"
            data-testid="partner-tab-bar"
          >
            <button
              role="tab"
              class="flex-1 rounded-xl px-3 py-2 text-sm font-bold transition"
              :class="activeTab === 'profile' ? 'bg-white text-black' : 'text-white/65 hover:text-white'"
              :aria-selected="activeTab === 'profile'"
              @click="activeTab = 'profile'"
            >
              {{ $t('auto.k_d2aa39c5') }}
            </button>
            <button
              role="tab"
              class="flex-1 rounded-xl px-3 py-2 text-sm font-bold transition"
              :class="activeTab === 'payout' ? 'bg-white text-black' : 'text-white/65 hover:text-white'"
              :aria-selected="activeTab === 'payout'"
              @click="activeTab = 'payout'"
            >
              {{ $t('auto.k_4a3af5a') }}
            </button>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="partner-forms-grid">
            <article
              class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl"
              role="tabpanel"
              :class="activeTab !== 'profile' ? 'hidden md:block' : ''"
              :aria-label="$t('auto.k_a5d87ce4')"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h3 class="text-base font-black text-white">{{ $t('auto.k_a5d87ce4') }}</h3>
                  <p class="text-sm text-white/55">{{ $t('auto.k_e5b7e934') }}</p>
                </div>
                <span
                  class="rounded-full border px-2 py-1 text-[11px] font-bold uppercase"
                  :class="
                    hasAccess
                      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/20 bg-white/10 text-white/65'
                  "
                >
                  {{ hasAccess ? "Editable" : "Read-only" }}
                </span>
              </div>

              <div class="mt-4 space-y-3">
                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  {{ $t('auto.k_ce42c7ac') }}
                  <input
                    v-model.trim="profileForm.displayName"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-emerald-400"
                    :placeholder="$t('auto.k_3a0663bd')"
                    :disabled="isSavingProfile || isStartingSubscription"
                  />
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  {{ $t('auto.k_8023bef5') }}
                  <input
                    v-model.trim="profileForm.referralCode"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-emerald-400"
                    :placeholder="$t('auto.k_a6c1cc8d')"
                    :disabled="isSavingProfile || isStartingSubscription"
                  />
                </label>
              </div>

              <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
                  :disabled="isSavingProfile || isStartingSubscription || !canManageProfile"
                  @click="createOrUpdateProfile"
                >
                  {{
                    isSavingProfile
                      ? "Saving..."
                      : hasAccess
                        ? "Save Profile"
                        : "Unlock & Save"
                  }}
                </button>
                <button
                  type="button"
                  class="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60"
                  :disabled="!referralLink"
                  @click="copyReferralLink"
                >
                  {{ $t('auto.k_a6a045fc') }}
                </button>
              </div>

              <div v-if="referralLink" class="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                <span class="text-[11px] font-bold uppercase tracking-wide text-white/60">{{ $t('auto.k_520dd2c1') }}</span>
                <p class="mt-1 break-all text-sm text-white">{{ referralLink }}</p>
              </div>
            </article>

            <article
              class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl"
              role="tabpanel"
              :class="activeTab !== 'payout' ? 'hidden md:block' : ''"
              :aria-label="$t('auto.k_4a3af5a')"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h3 class="text-base font-black text-white">{{ $t('auto.k_4a3af5a') }}</h3>
                  <p class="text-sm text-white/55">{{ $t('auto.k_c2f76f18') }}</p>
                </div>
                <span
                  class="rounded-full border px-2 py-1 text-[11px] font-bold uppercase"
                  :class="
                    hasAccess
                      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                      : 'border-rose-500/40 bg-rose-500/20 text-rose-200'
                  "
                >
                  {{ hasAccess ? "Unlocked" : "Locked" }}
                </span>
              </div>

              <div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label class="block text-xs font-bold uppercase tracking-wide text-white/60 lg:col-span-2">
                  {{ $t('auto.k_d9fb161b') }}
                  <select
                    v-model="bankForm.bankCode"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  >
                    <option
                      v-for="bank in bankOptions"
                      :key="bank.code"
                      :value="bank.code"
                    >
                      {{ bank.code }} - {{ bank.name }}
                    </option>
                  </select>
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  {{ $t('auto.k_993dc46f') }}
                  <input
                    v-model.trim="bankForm.accountName"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  {{ $t('auto.k_a86d4ce5') }}
                  <input
                    v-model.trim="bankForm.accountNumber"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  {{ $t('auto.k_2315e84') }}
                  <input
                    v-model.trim="bankForm.promptpayId"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  Bank Country
                  <select
                    v-model="bankForm.bankCountry"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  >
                    <option
                      v-for="country in countryOptions"
                      :key="country.code"
                      :value="country.code"
                    >
                      {{ country.name }}
                    </option>
                  </select>
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  Currency
                  <select
                    v-model="bankForm.currency"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  >
                    <option
                      v-for="code in currencyOptions"
                      :key="code"
                      :value="code"
                    >
                      {{ code }}
                    </option>
                  </select>
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  Account Type
                  <select
                    v-model="bankForm.accountType"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  >
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                    <option value="business">Business</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  Bank Name (International)
                  <input
                    v-model.trim="bankForm.bankName"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-cyan-400"
                    :placeholder="isThaiPayout ? 'Optional' : 'Required for foreign payouts'"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  Branch Name
                  <input
                    v-model.trim="bankForm.branchName"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  SWIFT Code
                  <input
                    v-model.trim="bankForm.swiftCode"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  IBAN
                  <input
                    v-model.trim="bankForm.iban"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>

                <label class="block text-xs font-bold uppercase tracking-wide text-white/60">
                  Routing Number
                  <input
                    v-model.trim="bankForm.routingNumber"
                    type="text"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
              </div>

              <button
                type="button"
                class="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
                :disabled="isSavingBank || isStartingSubscription || !canEditBank"
                @click="saveBank"
              >
                {{
                  isSavingBank
                    ? "Saving..."
                    : hasAccess
                      ? "Save Payment Details"
                      : "Unlock & Save Details"
                }}
              </button>
            </article>
          </div>

          <section
            class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl"
            data-testid="partner-orders-panel"
          >
            <h3 class="text-base font-black text-white">
              {{ $t('auto.k_30f69cb3') }}
              <span class="ml-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/70">90d</span>
            </h3>

            <ul class="mt-3 space-y-2">
              <li
                v-for="order in orders"
                :key="order.id"
                class="rounded-xl border border-white/10 bg-black/30 p-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-bold text-white">{{ order.sku || "partner_program" }}</p>
                  <p class="text-sm font-black text-emerald-300">{{ formatMoney(order.amount) }}</p>
                </div>
                <div class="mt-1 flex items-center justify-between gap-3 text-xs">
                  <span
                    class="rounded-full border px-2 py-0.5 font-bold uppercase"
                    :class="{
                      'border-emerald-500/40 bg-emerald-500/20 text-emerald-200': ['paid', 'succeeded', 'active'].includes(order.status),
                      'border-amber-500/40 bg-amber-500/20 text-amber-200': order.status === 'pending',
                      'border-rose-500/40 bg-rose-500/20 text-rose-200': ['failed', 'canceled'].includes(order.status),
                    }"
                  >
                    {{ order.status }}
                  </span>
                  <span class="text-white/55">{{ formatDate(order.created_at) }}</span>
                </div>
              </li>
              <li
                v-if="orders.length === 0"
                class="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/55"
              >
                {{ $t('auto.k_e86cd544') }}
              </li>
            </ul>
          </section>
          </div>
        </template>
      </template>
      </ErrorBoundary>

      <div v-if="errorMessage" class="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100" role="alert">
        <p>{{ errorMessage }}</p>
      </div>
    </div>
  </main>
</template>
