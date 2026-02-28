<script setup lang="ts">
import generatePayload from "promptpay-qr";
import QrcodeVue from "qrcode.vue";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
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

// Tab state for mobile forms
const activeTab = ref("profile"); // "profile" | "payout"

const isLoading = ref(true);
const errorMessage = ref("");
const isSavingProfile = ref(false);
const isSavingBank = ref(false);
const isStartingSubscription = ref(false);

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
const hasAccess = computed(() => Boolean(status.value?.has_access));
const statusLabel = computed(() =>
	String(status.value?.status || "inactive").toUpperCase(),
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
	return "/th";
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
		errorMessage.value =
			error?.message || "Unable to start partner subscription.";
	} finally {
		isStartingSubscription.value = false;
	}
};

const saveBank = async () => {
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
  <main class="pd-root" aria-label="Partner Dashboard">
    <!-- Background glows -->
    <div class="pd-bg" aria-hidden="true">
      <div class="pd-bg--emerald" />
      <div class="pd-bg--blue" />
      <div class="pd-bg--rose" />
    </div>

    <div class="pd-container">
      <!-- â"€â"€ Hero â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ -->
      <header class="pd-hero">
        <div class="pd-hero-left">
          <p class="pd-eyebrow">Partner Program</p>
          <h1 class="pd-hero-title">Your Earnings Hub</h1>
          <p class="pd-hero-sub">Refer friends, earn commissions, get paid.</p>
        </div>
        <div class="pd-hero-actions">
          <button
            type="button"
            class="pd-chip"
            :disabled="isLoading"
            @click="loadDashboard"
          >
            Refresh
          </button>
          <button
            type="button"
            class="pd-chip pd-chip--exit"
            @click="exitPartnerDashboard"
          >
            Exit
          </button>
        </div>
      </header>

      <!-- â"€â"€ Loading â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ -->
      <section v-if="isLoading" class="pd-panel pd-loading" aria-live="polite">
        <div class="pd-spinner" aria-hidden="true" />
        <p class="pd-loading-text">Loading partner data...</p>
      </section>

      <template v-else>
        <!-- â"€â"€ Program Disabled â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ -->
        <section
          v-if="!partnerEnabled"
          class="pd-panel pd-panel--warn"
          role="alert"
        >
          <h2 class="pd-section-title">Partner Program Disabled</h2>
          <p class="pd-section-sub">
            Feature flag <code>enable_partner_program</code> is currently off.
          </p>
        </section>

        <template v-else>
          <!-- â"€â"€ Stat Strip â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ -->
          <section class="pd-stat-strip" aria-label="Account overview">
            <article class="pd-stat">
              <p class="pd-stat-label">Access</p>
              <p
                class="pd-stat-value"
                :class="
                  hasAccess ? 'pd-stat-value--green' : 'pd-stat-value--amber'
                "
              >
                {{ hasAccess ? "PAID" : "UNPAID" }}
              </p>
            </article>
            <article class="pd-stat">
              <p class="pd-stat-label">Status</p>
              <p class="pd-stat-value">{{ statusLabel }}</p>
            </article>
            <article class="pd-stat">
              <p class="pd-stat-label">Renews</p>
              <p class="pd-stat-value pd-stat-value--sm">
                {{ formatDate(status.current_period_end) }}
              </p>
            </article>
            <article class="pd-stat">
              <p class="pd-stat-label">Orders (90d)</p>
              <p class="pd-stat-value">
                {{ Number(summary?.total_orders || 0) }}
              </p>
            </article>
            <article class="pd-stat">
              <p class="pd-stat-label">Verified</p>
              <p class="pd-stat-value">
                {{ Number(summary?.verified_orders || 0) }}
              </p>
            </article>
            <article class="pd-stat">
              <p class="pd-stat-label">Total Paid</p>
              <p class="pd-stat-value pd-stat-value--sm pd-stat-value--green">
                {{ formatMoney(summary?.total_paid_thb) }}
              </p>
            </article>
          </section>

          <!-- Subscription CTA -->
          <section class="pd-panel">
            <div class="pd-sub-wrap">
              <div class="pd-sub-copy">
                <h2 class="pd-section-title">Subscription</h2>
                <p class="pd-section-sub">Partner Program - 899 THB/month</p>
                <p v-if="!hasAccess" class="pd-sub-hint">{{ paywallReason }}</p>
              </div>
              <div class="pd-sub-buttons">
                <button
                  type="button"
                  class="pd-cta"
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
                  class="pd-cta pd-cta--manual"
                  @click="showManualPayment = !showManualPayment"
                >
                  {{
                    showManualPayment
                      ? "Hide Transfer Info"
                      : "Bank Transfer / QR"
                  }}
                </button>
              </div>
            </div>

            <!-- Manual Payment Section -->
            <div v-if="showManualPayment && !hasAccess" class="pd-manual-pay">
              <div class="pd-manual-tabs">
                <button
                  :class="[
                    'pd-manual-tab',
                    paymentTab === 'qr' && 'pd-manual-tab--active',
                  ]"
                  @click="paymentTab = 'qr'"
                >
                  Scan QR
                </button>
                <button
                  :class="[
                    'pd-manual-tab',
                    paymentTab === 'bank' && 'pd-manual-tab--active',
                  ]"
                  @click="paymentTab = 'bank'"
                >
                  Bank Transfer
                </button>
              </div>

              <!-- QR Tab -->
              <div v-if="paymentTab === 'qr'" class="pd-qr-section">
                <div class="pd-qr-box">
                  <qrcode-vue
                    v-if="qrPayload"
                    :value="qrPayload"
                    :size="180"
                    level="H"
                  />
                </div>
                <p class="pd-qr-label">
                  Scan PromptPay to pay {{ PARTNER_PRICE.toLocaleString() }} THB
                </p>
                <p class="pd-qr-sub">PromptPay ID: {{ PROMPTPAY_ID }}</p>
              </div>

              <!-- Bank Transfer Tab -->
              <div v-else class="pd-bank-section">
                <div class="pd-bank-row">
                  <span class="pd-bank-label">Bank Name</span>
                  <span class="pd-bank-value">{{ BANK_NAME }}</span>
                </div>
                <div class="pd-bank-row">
                  <span class="pd-bank-label">Account Number</span>
                  <button class="pd-bank-copy" @click="copyAccountNumber">
                    <span class="pd-bank-mono">{{ BANK_ACCOUNT_DISPLAY }}</span>
                    <span class="pd-bank-copy-tag">COPY</span>
                  </button>
                </div>
                <div class="pd-bank-row">
                  <span class="pd-bank-label">Account Name</span>
                  <span class="pd-bank-value">{{ ACCOUNT_NAME }}</span>
                </div>
                <div class="pd-bank-row">
                  <span class="pd-bank-label">Amount</span>
                  <span class="pd-bank-value pd-bank-value--highlight"
                    >{{ PARTNER_PRICE.toLocaleString() }} THB</span
                  >
                </div>
              </div>

              <p class="pd-manual-note">
                After transfer, send slip screenshot to support for activation.
              </p>
            </div>
          </section>

          <!-- â"€â"€ Tab Switcher (mobile shows one at a time) â"€ -->
          <div class="pd-tab-bar" role="tablist" aria-label="Partner forms">
            <button
              role="tab"
              class="pd-tab"
              :class="{ 'pd-tab--active': activeTab === 'profile' }"
              :aria-selected="activeTab === 'profile'"
              @click="activeTab = 'profile'"
            >
              Profile & Referral
            </button>
            <button
              role="tab"
              class="pd-tab"
              :class="{ 'pd-tab--active': activeTab === 'payout' }"
              :aria-selected="activeTab === 'payout'"
              @click="activeTab = 'payout'"
            >
              Payout Setup
            </button>
          </div>

          <!-- --- Forms Grid -------------------------------------------------- -->
          <div class="pd-forms-grid">
            <!-- Profile Form -->
            <article
              class="pd-panel"
              role="tabpanel"
              :class="{ 'pd-panel--hidden': activeTab !== 'profile' }"
              aria-label="Partner Profile"
            >
              <div class="pd-panel-head">
                <div>
                  <h3 class="pd-section-title">Partner Profile</h3>
                  <p class="pd-section-sub">Referral setup and identity.</p>
                </div>
                <span
                  class="pd-badge"
                  :class="hasAccess ? 'pd-badge--green' : 'pd-badge--dim'"
                >
                  {{ hasAccess ? "Editable" : "Read-only" }}
                </span>
              </div>

              <div class="pd-field-group">
                <label class="pd-label">
                  Display Name
                  <input
                    v-model.trim="profileForm.displayName"
                    type="text"
                    class="pd-input"
                    placeholder="Your name"
                    :disabled="isSavingProfile || isStartingSubscription"
                  />
                </label>
                <label class="pd-label">
                  Referral Code
                  <input
                    v-model.trim="profileForm.referralCode"
                    type="text"
                    class="pd-input"
                    placeholder="e.g. PARTNER1234"
                    :disabled="isSavingProfile || isStartingSubscription"
                  />
                </label>
              </div>

              <div class="pd-action-row">
                <button
                  type="button"
                  class="pd-btn pd-btn--primary"
                  :disabled="isSavingProfile || isStartingSubscription"
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
                  class="pd-btn pd-btn--secondary"
                  :disabled="!referralLink"
                  @click="copyReferralLink"
                >
                  Copy Link
                </button>
              </div>

              <div v-if="referralLink" class="pd-link-box">
                <span class="pd-link-label">Your referral link</span>
                <p class="pd-link-text">{{ referralLink }}</p>
              </div>
            </article>

            <!-- Payout Form -->
            <article
              class="pd-panel"
              role="tabpanel"
              :class="{ 'pd-panel--hidden': activeTab !== 'payout' }"
              aria-label="Payout Setup"
            >
              <div class="pd-panel-head">
                <div>
                  <h3 class="pd-section-title">Payout Setup</h3>
                  <p class="pd-section-sub">Thai banks + international wire.</p>
                </div>
                <span
                  class="pd-badge"
                  :class="hasAccess ? 'pd-badge--green' : 'pd-badge--red'"
                >
                  {{ hasAccess ? "Unlocked" : "Locked" }}
                </span>
              </div>

              <div class="pd-field-group pd-field-group--2col">
                <label class="pd-label pd-label--full">
                  Thai Bank
                  <select
                    v-model="bankForm.bankCode"
                    class="pd-input"
                    :disabled="isSavingBank || isStartingSubscription"
                  >
                    <option
                      v-for="bank in bankOptions"
                      :key="bank.code"
                      :value="bank.code"
                    >
                      {{ bank.code }} â€" {{ bank.name }}
                    </option>
                  </select>
                </label>
                <label class="pd-label">
                  Account Name
                  <input
                    v-model.trim="bankForm.accountName"
                    type="text"
                    class="pd-input"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
                <label class="pd-label">
                  Account Number
                  <input
                    v-model.trim="bankForm.accountNumber"
                    type="text"
                    class="pd-input pd-input--sensitive"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
                <label class="pd-label">
                  PromptPay ID
                  <input
                    v-model.trim="bankForm.promptpayId"
                    type="text"
                    class="pd-input pd-input--sensitive"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
                <label class="pd-label">
                  Country
                  <select
                    v-model="bankForm.bankCountry"
                    class="pd-input"
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
                <label class="pd-label">
                  Currency
                  <select
                    v-model="bankForm.currency"
                    class="pd-input"
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
                <label class="pd-label">
                  Account Type
                  <select
                    v-model="bankForm.accountType"
                    class="pd-input"
                    :disabled="isSavingBank || isStartingSubscription"
                  >
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                    <option value="business">Business</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label class="pd-label">
                  Bank Name (Int'l)
                  <input
                    v-model.trim="bankForm.bankName"
                    type="text"
                    class="pd-input"
                    :placeholder="
                      isThaiPayout ? 'Optional' : 'Required for foreign payouts'
                    "
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
                <label class="pd-label">
                  Branch Name
                  <input
                    v-model.trim="bankForm.branchName"
                    type="text"
                    class="pd-input"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
                <label class="pd-label">
                  SWIFT Code
                  <input
                    v-model.trim="bankForm.swiftCode"
                    type="text"
                    class="pd-input pd-input--sensitive"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
                <label class="pd-label">
                  IBAN
                  <input
                    v-model.trim="bankForm.iban"
                    type="text"
                    class="pd-input pd-input--sensitive"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
                <label class="pd-label">
                  Routing Number
                  <input
                    v-model.trim="bankForm.routingNumber"
                    type="text"
                    class="pd-input pd-input--sensitive"
                    :disabled="isSavingBank || isStartingSubscription"
                  />
                </label>
              </div>

              <button
                type="button"
                class="pd-btn pd-btn--primary pd-btn--full"
                :disabled="isSavingBank || isStartingSubscription"
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

          <!-- â"€â"€ Recent Orders â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ -->
          <section class="pd-panel">
            <h3 class="pd-section-title">
              Recent Orders <span class="pd-section-badge">90d</span>
            </h3>
            <ul class="pd-order-list">
              <li v-for="order in orders" :key="order.id" class="pd-order-item">
                <div class="pd-order-row">
                  <p class="pd-order-sku">
                    {{ order.sku || "partner_program" }}
                  </p>
                  <p class="pd-order-amount">{{ formatMoney(order.amount) }}</p>
                </div>
                <div class="pd-order-meta">
                  <span
                    class="pd-order-status"
                    :class="{
                      'pd-order-status--paid': [
                        'paid',
                        'succeeded',
                        'active',
                      ].includes(order.status),
                      'pd-order-status--pending': order.status === 'pending',
                      'pd-order-status--fail': ['failed', 'canceled'].includes(
                        order.status,
                      ),
                    }"
                    >{{ order.status }}</span
                  >
                  <span class="pd-order-date">{{
                    formatDate(order.created_at)
                  }}</span>
                </div>
              </li>
              <li v-if="orders.length === 0" class="pd-order-empty">
                No partner orders in the latest 90 days.
              </li>
            </ul>
          </section>
        </template>
      </template>

      <!-- â"€â"€ Error Banner â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ -->
      <div v-if="errorMessage" class="pd-error" role="alert">
        <p>{{ errorMessage }}</p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.pd-root {
  position: relative;
  min-height: 100dvh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  padding: 16px;
  padding-top: 80px;
  color: #fff;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}
@media (min-width: 768px) {
  .pd-root {
    padding: 24px;
    padding-top: 88px;
  }
}
.pd-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: #08091a;
  overflow: hidden;
}
.pd-bg--emerald,
.pd-bg--blue,
.pd-bg--rose {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.3;
  will-change: transform;
}
.pd-bg--emerald {
  width: 520px;
  height: 520px;
  top: -140px;
  right: -60px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.5), transparent);
}
.pd-bg--blue {
  width: 460px;
  height: 460px;
  top: -100px;
  left: -80px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.45), transparent);
}
.pd-bg--rose {
  width: 600px;
  height: 600px;
  bottom: -180px;
  left: 0;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.25), transparent);
}
.pd-container {
  width: 100%;
  max-width: 1140px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pd-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid rgba(139, 92, 246, 0.18);
  background: linear-gradient(
    140deg,
    rgba(12, 10, 40, 0.95),
    rgba(8, 9, 26, 0.9)
  );
  backdrop-filter: blur(20px);
}
.pd-eyebrow {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: rgba(139, 92, 246, 0.9);
  font-weight: 700;
  margin-bottom: 5px;
}
.pd-hero-title {
  font-size: clamp(1.35rem, 4vw, 1.9rem);
  font-weight: 900;
  letter-spacing: -0.025em;
  line-height: 1.1;
  color: #fff;
  margin-bottom: 4px;
}
.pd-hero-sub {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.5);
}
.pd-hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.pd-chip {
  padding: 10px 18px;
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.2);
  background: rgba(139, 92, 246, 0.08);
  font-size: 0.8rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.75);
  transition:
    background 0.15s,
    transform 0.1s;
  touch-action: manipulation;
  cursor: pointer;
}
.pd-chip:hover {
  background: rgba(139, 92, 246, 0.16);
}
.pd-chip:active {
  transform: scale(0.96);
}
.pd-chip--exit {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
  font-size: 0.85rem;
  font-weight: 900;
  min-height: 48px;
  padding: 12px 22px;
}
.pd-chip--exit:hover {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(239, 68, 68, 0.5);
}
.pd-panel {
  border: 1px solid rgba(139, 92, 246, 0.12);
  border-radius: 18px;
  padding: 18px;
  background: rgba(12, 10, 40, 0.6);
  backdrop-filter: blur(12px);
}
.pd-panel--warn {
  border-color: rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.06);
}
.pd-panel--hidden {
  display: none;
}
@media (min-width: 768px) {
  .pd-panel--hidden {
    display: block !important;
  }
}
.pd-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}
.pd-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
}
.pd-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(139, 92, 246, 0.35);
  border-top-color: #8b5cf6;
  border-radius: 50%;
  animation: pd-spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes pd-spin {
  to {
    transform: rotate(360deg);
  }
}
.pd-loading-text {
  font-size: 0.84rem;
  color: rgba(255, 255, 255, 0.55);
}
.pd-section-title {
  font-size: 0.95rem;
  font-weight: 900;
  color: #fff;
  margin-bottom: 2px;
}
.pd-section-sub {
  font-size: 0.76rem;
  color: rgba(255, 255, 255, 0.45);
}
.pd-section-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  background: rgba(139, 92, 246, 0.18);
  color: #a78bfa;
  vertical-align: middle;
}
.pd-stat-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}
.pd-stat-strip::-webkit-scrollbar {
  display: none;
}
@media (min-width: 1024px) {
  .pd-stat-strip {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    overflow: visible;
  }
}
.pd-stat {
  flex: 0 0 130px;
  min-width: 130px;
  scroll-snap-align: start;
  border: 1px solid rgba(139, 92, 246, 0.1);
  border-radius: 14px;
  padding: 14px;
  background: rgba(12, 10, 40, 0.5);
}
@media (min-width: 1024px) {
  .pd-stat {
    flex: initial;
    min-width: 0;
  }
}
.pd-stat-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 8px;
  font-weight: 700;
}
.pd-stat-value {
  font-size: 1.5rem;
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.025em;
  line-height: 1;
}
.pd-stat-value--sm {
  font-size: 0.85rem;
  line-height: 1.4;
}
.pd-stat-value--green {
  color: #34d399;
}
.pd-stat-value--amber {
  color: #fbbf24;
}
.pd-sub-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.pd-sub-copy {
  flex: 1 1 200px;
}
.pd-sub-hint {
  margin-top: 4px;
  font-size: 0.75rem;
  color: #fbbf24;
}
.pd-cta {
  flex: 1 1 100%;
  min-height: 52px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #8b5cf6, #6366f1, #3b82f6);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 900;
  transition:
    filter 0.15s,
    transform 0.1s,
    box-shadow 0.2s;
  touch-action: manipulation;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(139, 92, 246, 0.25);
}
@media (min-width: 640px) {
  .pd-cta {
    flex: 0 0 auto;
    padding: 0 28px;
  }
}
.pd-cta:hover {
  filter: brightness(1.1);
  box-shadow: 0 6px 32px rgba(139, 92, 246, 0.35);
}
.pd-cta:active {
  transform: scale(0.98);
}
.pd-cta:disabled {
  opacity: 0.55;
  box-shadow: none;
}
.pd-tab-bar {
  display: flex;
  gap: 8px;
  padding: 4px;
  border-radius: 14px;
  background: rgba(12, 10, 40, 0.5);
  border: 1px solid rgba(139, 92, 246, 0.12);
}
@media (min-width: 768px) {
  .pd-tab-bar {
    display: none;
  }
}
.pd-tab {
  flex: 1;
  padding: 10px 14px;
  min-height: 44px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.5);
  transition:
    background 0.15s,
    color 0.15s;
  touch-action: manipulation;
  cursor: pointer;
}
.pd-tab--active {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.3);
}
.pd-forms-grid {
  display: grid;
  gap: 14px;
}
@media (min-width: 768px) {
  .pd-forms-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.pd-badge {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  border: 1px solid transparent;
}
.pd-badge--green {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.25);
  color: #86efac;
}
.pd-badge--dim {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.45);
}
.pd-badge--red {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}
.pd-field-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.pd-field-group--2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pd-label {
  display: block;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 600;
}
.pd-label--full {
  grid-column: 1/-1;
}
.pd-input {
  display: block;
  width: 100%;
  margin-top: 5px;
  border: 1px solid rgba(139, 92, 246, 0.18);
  background: rgba(12, 10, 40, 0.5);
  border-radius: 10px;
  padding: 11px 14px;
  min-height: 44px;
  color: #fff;
  font-size: 0.84rem;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
  -webkit-appearance: none;
  appearance: none;
}
.pd-input:focus-visible {
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15);
}
.pd-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
}
.pd-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pd-input--sensitive {
  font-family: monospace;
  letter-spacing: 0.04em;
}
.pd-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.pd-btn {
  padding: 11px 18px;
  min-height: 44px;
  border-radius: 10px;
  font-size: 0.84rem;
  font-weight: 900;
  transition:
    filter 0.15s,
    transform 0.1s;
  touch-action: manipulation;
  cursor: pointer;
}
.pd-btn:active {
  transform: scale(0.97);
}
.pd-btn:disabled {
  opacity: 0.5;
}
.pd-btn--primary {
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: #fff;
  border: none;
  box-shadow: 0 2px 12px rgba(139, 92, 246, 0.2);
}
.pd-btn--primary:hover {
  filter: brightness(1.1);
}
.pd-btn--secondary {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: rgba(255, 255, 255, 0.8);
}
.pd-btn--secondary:hover {
  background: rgba(139, 92, 246, 0.1);
}
.pd-btn--full {
  width: 100%;
}
.pd-link-box {
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(139, 92, 246, 0.2);
  padding: 12px 14px;
}
.pd-link-label {
  display: block;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(139, 92, 246, 0.7);
  font-weight: 700;
  margin-bottom: 4px;
}
.pd-link-text {
  font-size: 0.8rem;
  color: #a78bfa;
  word-break: break-all;
  font-family: monospace;
}
.pd-order-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  list-style: none;
  padding: 0;
}
.pd-order-item {
  border: 1px solid rgba(139, 92, 246, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  background: rgba(12, 10, 40, 0.4);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pd-order-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pd-order-sku {
  font-size: 0.85rem;
  font-weight: 800;
  color: #fff;
}
.pd-order-amount {
  font-size: 0.85rem;
  font-weight: 700;
  color: #a78bfa;
}
.pd-order-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pd-order-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.5);
}
.pd-order-status--paid {
  background: rgba(34, 197, 94, 0.15);
  color: #86efac;
}
.pd-order-status--pending {
  background: rgba(245, 158, 11, 0.15);
  color: #fcd34d;
}
.pd-order-status--fail {
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}
.pd-order-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}
.pd-order-empty {
  padding: 20px;
  text-align: center;
  font-size: 0.84rem;
  color: rgba(255, 255, 255, 0.38);
}
.pd-sub-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1 1 100%;
}
@media (min-width: 640px) {
  .pd-sub-buttons {
    flex: 0 0 auto;
  }
}
.pd-cta--manual {
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.25);
  box-shadow: none;
}
.pd-cta--manual:hover {
  background: rgba(139, 92, 246, 0.2);
}
.pd-manual-pay {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(139, 92, 246, 0.1);
}
.pd-manual-tabs {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  margin-bottom: 14px;
}
.pd-manual-tab {
  flex: 1;
  padding: 9px 12px;
  min-height: 40px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.5);
  transition:
    background 0.15s,
    color 0.15s;
  cursor: pointer;
}
.pd-manual-tab--active {
  background: rgba(255, 255, 255, 0.95);
  color: #000;
}
.pd-qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 0;
}
.pd-qr-box {
  background: #fff;
  padding: 16px;
  border-radius: 16px;
  display: inline-flex;
}
.pd-qr-label {
  font-size: 0.84rem;
  font-weight: 800;
  color: #fff;
}
.pd-qr-sub {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.45);
}
.pd-bank-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(139, 92, 246, 0.1);
}
.pd-bank-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pd-bank-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 700;
}
.pd-bank-value {
  font-size: 0.88rem;
  font-weight: 800;
  color: #fff;
}
.pd-bank-value--highlight {
  color: #34d399;
}
.pd-bank-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(139, 92, 246, 0.15);
  cursor: pointer;
  transition: background 0.15s;
}
.pd-bank-copy:hover {
  background: rgba(139, 92, 246, 0.1);
}
.pd-bank-mono {
  font-family: monospace;
  font-size: 1rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.06em;
}
.pd-bank-copy-tag {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.6);
}
.pd-manual-note {
  margin-top: 12px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
}
.pd-error {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.08);
  font-size: 0.84rem;
  color: #fca5a5;
}
@media (prefers-reduced-motion: reduce) {
  .pd-spinner {
    animation: none;
  }
  .pd-cta,
  .pd-btn,
  .pd-chip,
  .pd-input,
  .pd-tab {
    transition: none;
  }
}
</style>
