<script setup lang="ts">
import {
	ChevronUp,
	CreditCard,
	Gift,
	Landmark,
	RefreshCw,
	Share2,
	User,
	Users,
} from "lucide-vue-next";
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
    class="relative z-50 isolate min-h-dvh overflow-x-hidden w-full max-w-full px-4 pb-8 pt-20 text-white md:px-6 md:pt-24 bg-zinc-950"
    :aria-label="$t('auto.k_203425a5')"
    data-testid="partner-dashboard-root"
  >
    <!-- Simplified background gradients to match OwnerDashboard theme -->
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-zinc-950" aria-hidden="true">
      <div class="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-violet-500/10 blur-[100px]" />
      <div class="absolute -left-24 -top-20 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-[100px]" />
    </div>

    <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 md:gap-5">
      <header class="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl md:p-6">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-fuchsia-500/10" />
        <div class="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-2">
            <p class="text-[11px] font-black uppercase tracking-[0.3em] text-white/55">Partner Program</p>
            <h1 class="text-2xl font-black leading-tight md:text-3xl">
              <span class="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">Creator Hub</span>
            </h1>
            <p class="max-w-2xl text-sm text-white/70 md:text-base">Manage your referrals, payouts, and partner status.</p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-xl border border-white/10 bg-white/8 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/14 active:scale-95"
              :disabled="isLoading"
              @click="loadDashboard({ force: true, reason: 'manual_refresh', allowBackgroundRetry: false })"
            >
              <RefreshCw v-if="isLoading" class="w-3 h-3 animate-spin inline mr-1" />
              Refresh
            </button>
            <button
              type="button"
              class="rounded-xl bg-white/8 border border-white/15 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/14 active:scale-95"
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
            <article class="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md relative overflow-hidden">
              <div class="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                <CreditCard class="w-3 h-3 text-blue-400" />
                Access
              </p>
              <p
                class="mt-2 text-lg font-black"
                :class="hasAccess ? 'text-emerald-400' : 'text-amber-400'"
              >
                {{ hasAccess ? "PAID" : "UNPAID" }}
              </p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md relative overflow-hidden">
              <div class="absolute top-0 right-0 w-16 h-16 bg-violet-500/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                <Users class="w-3 h-3 text-violet-400" />
                Status
              </p>
              <p class="mt-2 text-lg font-black text-white">{{ statusLabel }}</p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md relative overflow-hidden">
              <div class="absolute top-0 right-0 w-16 h-16 bg-fuchsia-500/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                <Clock class="w-3 h-3 text-fuchsia-400" />
                Renews
              </p>
              <p class="mt-2 text-sm font-bold text-white/90">{{ formatDate(status.current_period_end) }}</p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md relative overflow-hidden">
              <div class="absolute top-0 right-0 w-16 h-16 bg-cyan-500/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                <Gift class="w-3 h-3 text-cyan-400" />
                Orders
              </p>
              <p class="mt-2 text-lg font-black text-white">{{ Number(summary?.total_orders || 0) }}</p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md relative overflow-hidden">
              <div class="absolute top-0 right-0 w-16 h-16 bg-indigo-500/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                <Star class="w-3 h-3 text-indigo-400" />
                Verified
              </p>
              <p class="mt-2 text-lg font-black text-white">{{ Number(summary?.verified_orders || 0) }}</p>
            </article>

            <article class="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md relative overflow-hidden">
              <div class="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                <TrendingUp class="w-3 h-3 text-emerald-400" />
                Earnings
              </p>
              <p class="mt-2 text-sm font-black text-emerald-400">{{ totalPaidDisplay }}</p>
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
            class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl md:p-5"
            data-testid="partner-subscription-panel"
          >
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="flex gap-3">
                <div class="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                  <CreditCard class="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h2 class="text-lg font-black text-white">Subscription</h2>
                  <p class="mt-0.5 text-sm text-white/55">Manage your billing and tier access.</p>
                  <p v-if="!hasAccess" class="mt-1 text-xs text-amber-300/80">{{ paywallReason }}</p>
                </div>
              </div>

              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/25 transition hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
                  :disabled="isStartingSubscription"
                  :data-testid="!hasAccess ? 'partner-gate-cta' : undefined"
                  @click="startPartnerSubscription"
                >
                  <Rocket v-if="!hasAccess" class="w-4 h-4 inline mr-1.5" />
                  {{
                    isStartingSubscription
                      ? "Opening checkout..."
                      : hasAccess
                        ? "Manage Subscription"
                        : "Join Partner Program"
                  }}
                </button>

                <button
                  v-if="!hasAccess"
                  type="button"
                  class="rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/14"
                  @click="showManualPayment = !showManualPayment"
                >
                  {{ showManualPayment ? "Hide Transfer Info" : "Bank Transfer / QR" }}
                </button>
              </div>
            </div>

            <div v-if="showManualPayment && !hasAccess" class="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div class="mb-4 flex rounded-xl border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  class="flex-1 rounded-lg px-3 py-2 text-xs font-bold transition"
                  :class="paymentTab === 'qr' ? 'bg-white text-black shadow-sm' : 'text-white/65 hover:text-white'"
                  @click="paymentTab = 'qr'"
                >
                  QR PromptPay
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-lg px-3 py-2 text-xs font-bold transition"
                  :class="paymentTab === 'bank' ? 'bg-white text-black shadow-sm' : 'text-white/65 hover:text-white'"
                  @click="paymentTab = 'bank'"
                >
                  Bank Transfer
                </button>
              </div>

              <div v-if="paymentTab === 'qr'" class="flex flex-col items-center gap-2 rounded-xl bg-white p-6 text-black">
                <div class="rounded-lg bg-white p-2 border border-gray-100">
                  <qrcode-vue
                    v-if="qrPayload"
                    :value="qrPayload"
                    :size="180"
                    level="H"
                  />
                </div>
                <p class="text-sm font-black mt-2">{{ PARTNER_PRICE.toLocaleString() }} THB</p>
                <p class="text-xs text-gray-500 font-medium">PromptPay ID: {{ PROMPTPAY_ID }}</p>
              </div>

              <div v-else class="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white">
                <div class="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
                  <span class="text-white/40 text-xs uppercase tracking-wider font-bold">Bank</span>
                  <span class="font-bold text-blue-300">{{ BANK_NAME }}</span>
                </div>
                <div class="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
                  <span class="text-white/40 text-xs uppercase tracking-wider font-bold">Account</span>
                  <button
                    type="button"
                    class="rounded-lg border border-white/20 bg-black/30 px-3 py-2 font-mono text-xs text-white transition hover:bg-white/10 flex items-center gap-2"
                    @click="copyAccountNumber"
                  >
                    {{ BANK_ACCOUNT_DISPLAY }}
                    <Share2 class="w-3 h-3 text-white/40" />
                  </button>
                </div>
                <div class="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
                  <span class="text-white/40 text-xs uppercase tracking-wider font-bold">Name</span>
                  <span class="font-bold">{{ ACCOUNT_NAME }}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-white/40 text-xs uppercase tracking-wider font-bold">Amount</span>
                  <span class="font-black text-emerald-400">{{ PARTNER_PRICE.toLocaleString() }} THB</span>
                </div>
              </div>

              <p class="mt-4 text-[10px] text-white/40 leading-relaxed text-center">
                After transfer, your account will be verified automatically within 24 hours.
              </p>
            </div>
          </section>

          <div
            class="flex rounded-2xl border border-white/10 bg-white/5 p-1 backdrop-blur-md"
            role="tablist"
            :aria-label="$t('auto.k_922f6a8e')"
            data-testid="partner-tab-bar"
          >
            <button
              role="tab"
              class="flex-1 rounded-xl px-3 py-2 text-sm font-bold transition flex items-center justify-center gap-2"
              :class="activeTab === 'profile' ? 'bg-white text-black shadow-lg' : 'text-white/65 hover:text-white hover:bg-white/5'"
              :aria-selected="activeTab === 'profile'"
              @click="activeTab = 'profile'"
            >
              <User class="w-4 h-4" />
              Profile
            </button>
            <button
              role="tab"
              class="flex-1 rounded-xl px-3 py-2 text-sm font-bold transition flex items-center justify-center gap-2"
              :class="activeTab === 'payout' ? 'bg-white text-black shadow-lg' : 'text-white/65 hover:text-white hover:bg-white/5'"
              :aria-selected="activeTab === 'payout'"
              @click="activeTab = 'payout'"
            >
              <Landmark class="w-4 h-4" />
              Payout
            </button>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="partner-forms-grid">
            <article
              class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl"
              role="tabpanel"
              :class="activeTab !== 'profile' ? 'hidden md:block' : ''"
              :aria-label="$t('auto.k_a5d87ce4')"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <User class="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <h3 class="text-base font-black text-white">Profile</h3>
                    <p class="text-[10px] text-white/50 uppercase tracking-wider">Public identity</p>
                  </div>
                </div>
                <span
                  class="rounded-full border px-2 py-1 text-[10px] font-bold uppercase"
                  :class="
                    hasAccess
                      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/20 bg-white/10 text-white/65'
                  "
                >
                  {{ hasAccess ? "Editable" : "Read-only" }}
                </span>
              </div>

              <div class="mt-4 space-y-4">
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold uppercase tracking-wider text-white/40 ml-1">Display Name</label>
                  <input
                    v-model.trim="profileForm.displayName"
                    type="text"
                    class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-violet-500/50 transition-colors"
                    placeholder="Enter your partner name"
                    :disabled="isSavingProfile || isStartingSubscription"
                  />
                </div>

                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold uppercase tracking-wider text-white/40 ml-1">Referral Code</label>
                  <div class="relative">
                    <input
                      v-model.trim="profileForm.referralCode"
                      type="text"
                      class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-violet-500/50 transition-colors"
                      placeholder="e.g. VIBE123"
                      :disabled="isSavingProfile || isStartingSubscription"
                    />
                  </div>
                </div>
              </div>

              <div class="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-3 text-sm font-black text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                  :disabled="isSavingProfile || isStartingSubscription || !canManageProfile"
                  @click="createOrUpdateProfile"
                >
                  {{
                    isSavingProfile
                      ? "Saving..."
                      : hasAccess
                        ? "Save Changes"
                        : "Unlock & Save"
                  }}
                </button>
                <button
                  type="button"
                  class="rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/14 active:scale-95 disabled:opacity-50"
                  :disabled="!referralLink"
                  @click="copyReferralLink"
                >
                  <Share2 class="w-4 h-4 inline mr-1.5" />
                  Copy Link
                </button>
              </div>

              <div v-if="referralLink" class="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                <div class="flex items-center gap-2 mb-1">
                  <Share2 class="w-3 h-3 text-violet-400" />
                  <span class="text-[10px] font-bold uppercase tracking-wide text-violet-300/70">Referral URL</span>
                </div>
                <p class="break-all text-xs text-white/80 font-mono">{{ referralLink }}</p>
              </div>
            </article>

            <article
              class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl"
              role="tabpanel"
              :class="activeTab !== 'payout' ? 'hidden md:block' : ''"
              :aria-label="$t('auto.k_4a3af5a')"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Landmark class="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h3 class="text-base font-black text-white">Payout</h3>
                    <p class="text-[10px] text-white/50 uppercase tracking-wider">Bank & PromptPay</p>
                  </div>
                </div>
                <span
                  class="rounded-full border px-2 py-1 text-[10px] font-bold uppercase"
                  :class="
                    hasAccess
                      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                      : 'border-amber-500/40 bg-amber-500/20 text-amber-200'
                  "
                >
                  {{ hasAccess ? "Unlocked" : "Locked" }}
                </span>
              </div>

              <div class="mt-4 space-y-4">
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold uppercase tracking-wider text-white/40 ml-1">Bank Provider</label>
                  <select
                    v-model="bankForm.bankCode"
                    class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
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
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <label class="text-[11px] font-bold uppercase tracking-wider text-white/40 ml-1">Account Name</label>
                    <input
                      v-model.trim="bankForm.accountName"
                      type="text"
                      class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
                      :disabled="isSavingBank || isStartingSubscription"
                    />
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-[11px] font-bold uppercase tracking-wider text-white/40 ml-1">Account Number</label>
                    <input
                      v-model.trim="bankForm.accountNumber"
                      type="text"
                      class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
                      :disabled="isSavingBank || isStartingSubscription"
                    />
                  </div>
                </div>

                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold uppercase tracking-wider text-white/40 ml-1">PromptPay ID</label>
                  <input
                    v-model.trim="bankForm.promptpayId"
                    type="text"
                    class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
                    placeholder="Mobile or Tax ID"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </div>
              </div>

              <button
                type="button"
                class="mt-6 w-full rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 text-sm font-black text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                :disabled="isSavingBank || isStartingSubscription || !canEditBank"
                @click="saveBank"
              >
                {{
                  isSavingBank
                    ? "Saving..."
                    : hasAccess
                      ? "Update Payout Info"
                      : "Unlock & Save"
                }}
              </button>
            </article>
          </div>

          <section
            class="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl relative overflow-hidden"
            data-testid="partner-orders-panel"
          >
            <div class="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Gift class="w-4 h-4 text-violet-400" />
                </div>
                <h3 class="text-base font-black text-white">Recent Activity</h3>
              </div>
              <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/50">90 Days</span>
            </div>

            <ul class="space-y-2.5">
              <li
                v-for="order in orders"
                :key="order.id"
                class="rounded-xl border border-white/5 bg-black/20 p-4 transition hover:bg-black/30"
              >
                <div class="flex items-center justify-between gap-3 mb-2">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-violet-400"></div>
                    <p class="text-sm font-bold text-white">{{ order.sku === 'partner_program' ? 'Partner Program' : order.sku }}</p>
                  </div>
                  <p class="text-sm font-black text-emerald-400">+{{ formatMoney(order.amount) }}</p>
                </div>
                <div class="flex items-center justify-between gap-3 text-[10px]">
                  <span
                    class="rounded-full px-2 py-0.5 font-bold uppercase tracking-tight"
                    :class="{
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20': ['paid', 'succeeded', 'active'].includes(order.status),
                      'bg-amber-500/10 text-amber-400 border border-amber-500/20': order.status === 'pending',
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20': ['failed', 'canceled'].includes(order.status),
                    }"
                  >
                    {{ order.status }}
                  </span>
                  <span class="text-white/30 font-medium">{{ formatDate(order.created_at) }}</span>
                </div>
              </li>
              <li
                v-if="orders.length === 0"
                class="py-12 text-center rounded-xl border border-dashed border-white/10"
              >
                <Gift class="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p class="text-xs text-white/30">No orders found yet</p>
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
