<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { partnerService } from "../services/partnerService";
import { paymentService } from "../services/paymentService";
import { useFeatureFlagStore } from "../store/featureFlagStore";
import { useUserStore } from "../store/userStore";

const userStore = useUserStore();
const featureFlagStore = useFeatureFlagStore();

const isLoading = ref(true);
const errorMessage = ref("");
const isSavingProfile = ref(false);
const isSavingBank = ref(false);
const isStartingSubscription = ref(false);

const profile = ref(null);
const metrics = ref(null);
const referrals = ref([]);
const payouts = ref([]);
const ledger = ref([]);

const profileForm = reactive({
	displayName: "",
	referralCode: "",
});

const bankForm = reactive({
	bankCode: "KBANK",
	accountName: "",
	accountNumber: "",
	promptpayId: "",
});

const partnerEnabled = computed(() =>
	featureFlagStore.isEnabled("enable_partner_program"),
);

const referralLink = computed(() => {
	const code = String(profile.value?.referral_code || "").trim();
	if (!code) return "";
	return `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
});

const formatMoney = (value) => {
	const num = Number(value || 0);
	return new Intl.NumberFormat("th-TH", {
		style: "currency",
		currency: "THB",
		maximumFractionDigits: 2,
	}).format(Number.isFinite(num) ? num : 0);
};

const formatDate = (value) => {
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
	const base = String(userStore.profile?.username || "partner")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, 8);
	const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
	return partnerService.sanitizeCode(`${base}${suffix}`) || "VIBEPARTNER";
};

const loadDashboard = async () => {
	isLoading.value = true;
	errorMessage.value = "";
	try {
		await userStore.initAuth();
		await featureFlagStore.refreshFlags();

		if (!userStore.isAuthenticated) {
			errorMessage.value = "Please sign in to access Partner Dashboard.";
			return;
		}

		const myProfile = await partnerService.getMyPartnerProfile();
		profile.value = myProfile;

		if (!myProfile) {
			profileForm.displayName = userStore.profile?.displayName || "";
			profileForm.referralCode = randomReferralCode();
			return;
		}

		const [metricRow, referralRows, payoutRows, ledgerRows] = await Promise.all(
			[
				partnerService.getDashboardMetrics(),
				partnerService.getRecentReferrals(myProfile.id),
				partnerService.getRecentPayouts(myProfile.id),
				partnerService.getLedgerEntries(myProfile.id),
			],
		);

		metrics.value = metricRow;
		referrals.value = referralRows;
		payouts.value = payoutRows;
		ledger.value = ledgerRows;
	} catch (error) {
		errorMessage.value = error?.message || "Failed to load partner dashboard.";
	} finally {
		isLoading.value = false;
	}
};

const createProfile = async () => {
	isSavingProfile.value = true;
	errorMessage.value = "";
	try {
		const created = await partnerService.createPartnerProfile({
			displayName: profileForm.displayName,
			referralCode: profileForm.referralCode,
		});
		profile.value = created;
		if (created?.referral_code) {
			localStorage.setItem("vibe_partner_referral_code", created.referral_code);
		}
		await loadDashboard();
	} catch (error) {
		errorMessage.value = error?.message || "Unable to create partner profile.";
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
			{ purchaseMode: "subscription" },
		);
		if (url) {
			window.location.href = url;
		}
	} catch (error) {
		errorMessage.value =
			error?.message || "Unable to start partner subscription.";
	} finally {
		isStartingSubscription.value = false;
	}
};

const saveBank = async () => {
	isSavingBank.value = true;
	errorMessage.value = "";
	try {
		await partnerService.upsertBankSecrets({
			bankCode: bankForm.bankCode,
			accountName: bankForm.accountName,
			accountNumber: bankForm.accountNumber,
			promptpayId: bankForm.promptpayId,
		});
		bankForm.accountNumber = "";
		bankForm.promptpayId = "";
	} catch (error) {
		errorMessage.value = error?.message || "Unable to save bank details.";
	} finally {
		isSavingBank.value = false;
	}
};

const copyReferralLink = async () => {
	if (!referralLink.value) return;
	try {
		await navigator.clipboard.writeText(referralLink.value);
	} catch {
		// ignore
	}
};

onMounted(() => {
	void loadDashboard();
});
</script>

<template>
  <main class="min-h-screen bg-[#050508] p-4 text-white md:p-8">
    <div class="mx-auto max-w-6xl space-y-6">
      <header class="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-xl">
        <h1 class="text-2xl font-black tracking-tight md:text-3xl">VibeCity Partner Dashboard</h1>
        <p class="mt-2 text-sm text-white/70">
          Track referrals, commission, renewals, and weekly payouts.
        </p>
      </header>

      <section v-if="isLoading" class="rounded-2xl border border-white/10 bg-black/30 p-6">
        <p class="text-sm text-white/70">Loading partner data...</p>
      </section>

      <section
        v-else-if="!partnerEnabled"
        class="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6"
      >
        <h2 class="text-lg font-bold text-amber-200">Partner Program Disabled</h2>
        <p class="mt-2 text-sm text-amber-100/80">
          This feature is controlled by <code>enable_partner_program</code> and is currently off.
        </p>
      </section>

      <section
        v-else-if="!userStore.isAuthenticated"
        class="rounded-2xl border border-red-400/20 bg-red-500/10 p-6"
      >
        <h2 class="text-lg font-bold text-red-200">Sign-in Required</h2>
        <p class="mt-2 text-sm text-red-100/80">Please sign in first, then reopen Partner Dashboard.</p>
      </section>

      <section
        v-else-if="!profile"
        class="rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl"
      >
        <h2 class="text-lg font-bold">Create Partner Account</h2>
        <p class="mt-1 text-sm text-white/65">
          Partner fee is 899 THB/month. You can set your referral code now.
        </p>

        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <label class="space-y-2 text-sm">
            <span class="block text-white/70">Display Name</span>
            <input
              v-model.trim="profileForm.displayName"
              type="text"
              class="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none focus:border-cyan-400"
            >
          </label>

          <label class="space-y-2 text-sm">
            <span class="block text-white/70">Referral Code</span>
            <input
              v-model.trim="profileForm.referralCode"
              type="text"
              class="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none focus:border-cyan-400"
            >
          </label>
        </div>

        <button
          type="button"
          class="mt-5 rounded-xl bg-cyan-500 px-5 py-2 text-sm font-black text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="isSavingProfile"
          @click="createProfile"
        >
          {{ isSavingProfile ? "Creating..." : "Create Partner Profile" }}
        </button>
      </section>

      <template v-else>
        <section class="grid gap-4 md:grid-cols-4">
          <article class="rounded-2xl border border-white/10 bg-black/35 p-4">
            <p class="text-xs uppercase tracking-wide text-white/50">Referred Venues</p>
            <p class="mt-1 text-2xl font-black">{{ Number(metrics?.referred_venues || 0) }}</p>
          </article>
          <article class="rounded-2xl border border-white/10 bg-black/35 p-4">
            <p class="text-xs uppercase tracking-wide text-white/50">Active Renewals</p>
            <p class="mt-1 text-2xl font-black">{{ Number(metrics?.renewal_orders || 0) }}</p>
          </article>
          <article class="rounded-2xl border border-white/10 bg-black/35 p-4">
            <p class="text-xs uppercase tracking-wide text-white/50">Accrued Balance</p>
            <p class="mt-1 text-xl font-black">{{ formatMoney(metrics?.accrued_balance) }}</p>
          </article>
          <article class="rounded-2xl border border-white/10 bg-black/35 p-4">
            <p class="text-xs uppercase tracking-wide text-white/50">Scheduled Payout</p>
            <p class="mt-1 text-xl font-black">{{ formatMoney(metrics?.scheduled_payout) }}</p>
          </article>
        </section>

        <section class="rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Subscription</h2>
              <p class="text-sm text-white/65">
                Plan: 899 THB/month · Cancel anytime
              </p>
            </div>
            <button
              type="button"
              class="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2 text-sm font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isStartingSubscription"
              @click="startPartnerSubscription"
            >
              {{ isStartingSubscription ? "Opening checkout..." : "Start / Manage Subscription" }}
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Referral Link</h2>
              <p class="text-sm text-white/65">Code: {{ profile.referral_code }}</p>
            </div>
            <button
              type="button"
              class="rounded-lg border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10"
              @click="copyReferralLink"
            >
              Copy Link
            </button>
          </div>
          <p class="mt-3 break-all rounded-lg bg-black/40 p-3 text-sm text-cyan-200">
            {{ referralLink || '-' }}
          </p>
        </section>

        <section class="grid gap-6 lg:grid-cols-2">
          <article class="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h3 class="text-base font-bold">Bank / PromptPay (Encrypted)</h3>
            <div class="mt-4 space-y-3">
              <label class="block text-sm text-white/70">
                Bank
                <select
                  v-model="bankForm.bankCode"
                  class="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                >
                  <option value="KBANK">KBANK</option>
                  <option value="SCB">SCB</option>
                </select>
              </label>
              <label class="block text-sm text-white/70">
                Account Name
                <input
                  v-model.trim="bankForm.accountName"
                  type="text"
                  class="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                >
              </label>
              <label class="block text-sm text-white/70">
                Account Number
                <input
                  v-model.trim="bankForm.accountNumber"
                  type="text"
                  class="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                >
              </label>
              <label class="block text-sm text-white/70">
                PromptPay ID
                <input
                  v-model.trim="bankForm.promptpayId"
                  type="text"
                  class="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                >
              </label>
            </div>
            <button
              type="button"
              class="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isSavingBank"
              @click="saveBank"
            >
              {{ isSavingBank ? "Saving..." : "Save Payment Details" }}
            </button>
          </article>

          <article class="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h3 class="text-base font-bold">Recent Payouts</h3>
            <div class="mt-3 space-y-2 text-sm">
              <div
                v-for="payout in payouts"
                :key="payout.id"
                class="rounded-lg border border-white/10 bg-black/30 p-3"
              >
                <p class="font-bold">{{ formatMoney(payout.net_amount_thb) }}</p>
                <p class="text-white/60">{{ formatDate(payout.payout_week_end) }} · {{ payout.status }}</p>
              </div>
              <p v-if="payouts.length === 0" class="text-white/55">No payout records yet.</p>
            </div>
          </article>
        </section>

        <section class="grid gap-6 lg:grid-cols-2">
          <article class="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h3 class="text-base font-bold">Recent Referrals</h3>
            <div class="mt-3 space-y-2 text-sm">
              <div
                v-for="refItem in referrals"
                :key="refItem.id"
                class="rounded-lg border border-white/10 bg-black/30 p-3"
              >
                <p class="font-bold">Venue: {{ refItem.venue_id }}</p>
                <p class="text-white/60">{{ refItem.source }} · {{ formatDate(refItem.attributed_at) }}</p>
              </div>
              <p v-if="referrals.length === 0" class="text-white/55">No referrals yet.</p>
            </div>
          </article>

          <article class="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h3 class="text-base font-bold">Commission Ledger</h3>
            <div class="mt-3 space-y-2 text-sm">
              <div
                v-for="entry in ledger"
                :key="entry.id"
                class="rounded-lg border border-white/10 bg-black/30 p-3"
              >
                <p class="font-bold">{{ entry.entry_type }} · {{ formatMoney(entry.amount_thb) }}</p>
                <p class="text-white/60">{{ entry.status }} · {{ formatDate(entry.created_at) }}</p>
              </div>
              <p v-if="ledger.length === 0" class="text-white/55">No ledger entries yet.</p>
            </div>
          </article>
        </section>
      </template>

      <section v-if="errorMessage" class="rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
        <p class="text-sm text-red-100">{{ errorMessage }}</p>
      </section>
    </div>
  </main>
</template>
