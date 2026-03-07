<script setup lang="ts">
import generatePayload from "promptpay-qr";
import QrcodeVue from "qrcode.vue";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDashboardGuard } from "@/composables/useDashboardGuard";
import { usePermission } from "@/composables/usePermission";
import { mask } from "@/utils/dataMasking";
import {
	PAYOUT_COUNTRY_OPTIONS,
	PAYOUT_CURRENCY_OPTIONS,
	THAI_BANK_OPTIONS,
} from "../constants/bankCatalog";
import { partnerService } from "../services/partnerService";
import { paymentService } from "../services/paymentService";
import { getOrCreateVisitorId } from "../services/visitorIdentity";
import { useFeatureFlagStore } from "../store/featureFlagStore";

const featureFlagStore = useFeatureFlagStore();
const router = useRouter();
const route = useRoute();
useDashboardGuard("partner", {
	allowVisitorFallback: false,
	strictAuth: false,
});

// Manual payment constants (same as MerchantRegister)
const PROMPTPAY_ID = "0113222743";
const BANK_NAME = "Kasikorn Bank (K-Bank)";
const BANK_ACCOUNT_DISPLAY = "011-3-22274-3";
const ACCOUNT_NAME = "Somchai Suwanwiang";
const PARTNER_PRICE = 899;

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
const isSavingProfile = ref(false);
const isSavingBank = ref(false);
const isStartingSubscription = ref(false);
const isRevenueRevealed = ref(false);

const visitorId = ref("");
const status = ref({
	has_access: false,
	status: "inactive",
	current_period_end: null,
});
const summary = ref<any>(null);
const profile = ref<any>(null);
const orders = ref<any[]>([]);

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

const loadDashboard = async () => {
	isLoading.value = true;
	errorMessage.value = "";
	try {
		visitorId.value = getOrCreateVisitorId();
		await featureFlagStore.refreshFlags();

		const [statusResult, dashboardResult] = await Promise.allSettled([
			partnerService.getStatus(),
			partnerService.getDashboard(),
		]);

		const failureMessages = [];
		let nextStatus = null;

		if (statusResult.status === "fulfilled") {
			nextStatus = statusResult.value || null;
		} else {
			failureMessages.push(
				statusResult.reason?.message || "Unable to load partner status.",
			);
		}

		let dashboardPayload = null;
		if (dashboardResult.status === "fulfilled") {
			dashboardPayload = dashboardResult.value || null;
		} else {
			failureMessages.push(
				dashboardResult.reason?.message || "Unable to load partner dashboard.",
			);
		}

		if (!nextStatus && dashboardPayload?.status) {
			nextStatus = dashboardPayload.status;
		}

		status.value = nextStatus || {
			has_access: false,
			status: "inactive",
			current_period_end: null,
		};
		summary.value = dashboardPayload?.summary || null;
		profile.value = dashboardPayload?.profile || null;
		orders.value = Array.isArray(dashboardPayload?.orders)
			? dashboardPayload.orders
			: [];

		hydrateFormsFromProfile();

		if (failureMessages.length > 0) {
			errorMessage.value = [...new Set(failureMessages)].join(" ");
		}
	} catch (error) {
		errorMessage.value = error?.message || "Failed to load partner dashboard.";
	} finally {
		isLoading.value = false;
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
		await loadDashboard();
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
		await loadDashboard();
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

onMounted(() => {
	void loadDashboard();
});
</script>

<template>
  <main
    class="relative min-h-dvh w-full overflow-x-hidden px-4 pb-8 pt-20 text-white md:px-6 md:pt-24"
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
              @click="loadDashboard"
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

      <section v-if="isLoading" class="rounded-2xl border border-white/10 bg-gray-900/85 p-4 shadow-2xl backdrop-blur-xl" aria-live="polite">
        <div class="flex items-center gap-3">
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" aria-hidden="true" />
          <p class="text-sm text-white/75">{{ $t('auto.k_903ab19f') }}</p>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div v-for="n in 6" :key="`partner-stat-skeleton-${n}`" class="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
        </div>
      </section>

      <template v-else>
        <section v-if="!partnerEnabled" class="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-100" role="alert">
          <h2 class="text-base font-black text-amber-200">{{ $t('auto.k_4f943d97') }}</h2>
          <p class="mt-1 text-sm text-amber-100/90">
            {{ $t('auto.k_afbe4519') }}
            <code class="rounded bg-black/30 px-1.5 py-0.5 text-xs">enable_partner_program</code>
            {{ $t('auto.k_5d743acc') }}
          </p>
        </section>

        <template v-else>
          <section
            class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
            :aria-label="$t('auto.k_d89ccc97')"
            data-testid="partner-stat-strip"
          >
            <article class="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Access</p>
              <p
                class="mt-2 text-lg font-black"
                :class="hasAccess ? 'text-emerald-300' : 'text-amber-300'"
              >
                {{ hasAccess ? "PAID" : "UNPAID" }}
              </p>
            </article>

            <article class="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Status</p>
              <p class="mt-2 text-lg font-black text-white">{{ statusLabel }}</p>
            </article>

            <article class="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Renews</p>
              <p class="mt-2 text-sm font-bold text-white/90">{{ formatDate(status.current_period_end) }}</p>
            </article>

            <article class="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">{{ $t('auto.k_7842dd7e') }}</p>
              <p class="mt-2 text-lg font-black text-white">{{ Number(summary?.total_orders || 0) }}</p>
            </article>

            <article class="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Verified</p>
              <p class="mt-2 text-lg font-black text-white">{{ Number(summary?.verified_orders || 0) }}</p>
            </article>

            <article class="rounded-2xl border border-white/10 bg-black/30 p-4">
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
        </template>
      </template>

      <div v-if="errorMessage" class="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100" role="alert">
        <p>{{ errorMessage }}</p>
      </div>
    </div>
  </main>
</template>
