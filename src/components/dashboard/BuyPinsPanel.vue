<template>
  <div
    class="bg-gray-900/90 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl relative overflow-hidden"
  >
    <!-- Background Glows -->
    <div
      class="absolute -top-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px]"
    ></div>
    <div
      class="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px]"
    ></div>

    <!-- Header -->
    <div
      class="relative z-10 flex flex-col md:flex-row items-center justify-between mb-8 gap-4"
    >
      <div>
        <h2 class="text-3xl font-black text-white flex items-center gap-3">
          <span class="text-4xl animate-bounce-in">💎</span>
          <span
            class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
            >Power Up Your Vibe</span
          >
        </h2>
        <p class="text-gray-400 text-sm mt-1 font-medium">
          Unlock exclusive features to stand out on the map
        </p>
      </div>

      <div class="flex items-center gap-3">
        <!-- Currency Toggle -->
        <button
          @click="currencyStore.toggleCurrency()"
          class="bg-black/40 hover:bg-black/60 text-white px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 transition flex items-center gap-2"
        >
          <span>{{
            currencyStore.currentCurrency === "THB" ? "🇹🇭 THB" : "🇺🇸 USD"
          }}</span>
          <span class="opacity-50">⇄</span>
        </button>

        <!-- Payment Method Toggle -->
        <div
          class="flex bg-black/40 rounded-xl p-1 border border-white/10 backdrop-blur-md"
        >
          <button
            v-for="method in paymentMethods"
            :key="method"
            @click="paymentMethod = method"
            :class="
              paymentMethod === method
                ? 'bg-white/10 text-white shadow-lg'
                : 'text-gray-500 hover:text-gray-300'
            "
            class="px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 capitalize"
          >
            <span v-if="method === 'stripe'">💳 Stripe TH+Global</span>
            <span v-else-if="method === 'paypal'">🅿️ PayPal</span>
            <span v-else>🏦 Thai / Intl Wire</span>
          </button>
        </div>
      </div>
    </div>

    <div class="relative z-10 mb-6 rounded-xl border border-white/10 bg-black/30 p-3">
      <label for="partner-ref-code" class="mb-1 block text-[11px] font-bold uppercase tracking-wide text-white/70">
        Referral Code (Optional)
      </label>
      <input
        id="partner-ref-code"
        v-model.trim="partnerReferralCode"
        type="text"
        inputmode="text"
        autocomplete="off"
        placeholder="Enter partner referral code"
        class="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-cyan-400"
        @blur="persistPartnerCode"
      />
      <p class="mt-1 text-[11px] text-white/45">
        Referral code has higher priority than shared link attribution.
      </p>
    </div>

    <!-- Tier Tabs (Desktop Only) -->
    <div class="hidden md:flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
      <button
        v-for="tier in tiers"
        :key="tier.id"
        @click="activeTier = tier.id"
        :class="
          activeTier === tier.id
            ? `bg-gradient-to-r ${tier.grad} text-white shadow-lg scale-105`
            : 'bg-white/5 text-gray-400 hover:bg-white/10'
        "
        class="px-6 py-2 rounded-full text-xs font-bold transition whitespace-nowrap border border-white/5"
      >
        {{ tier.icon }} {{ tier.name }}
      </button>
    </div>

    <!-- Success Msg -->
    <div
      v-if="successMessage"
      class="mb-6 bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-3 rounded-xl text-sm font-bold animate-pulse text-center backdrop-blur-md"
    >
      {{ successMessage }}
    </div>

    <!-- Packages Grid (Mobile Horizontal / Desktop Grid) -->
    <div
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 overflow-x-auto md:overflow-visible pb-4 md:pb-0 snap-x snap-mandatory"
      style="scrollbar-width: none"
    >
      <div
        v-for="(pkg, idx) in filteredPackages"
        :key="pkg.sku"
        class="bg-white/5 rounded-2xl p-1 border border-white/10 hover:border-white/30 transition group relative min-w-[280px] md:min-w-0 snap-center flex flex-col h-full"
        :class="{ 'hover:-translate-y-1 shadow-2xl': true }"
        :style="{ animationDelay: `${idx * 50}ms` }"
      >
        <!-- Shimmer Effect for Premium -->
        <div
          v-if="pkg.isPremium"
          class="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-0"
        >
          <div
            class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"
          ></div>
        </div>

        <div
          class="bg-gray-900/80 rounded-xl p-5 h-full flex flex-col relative z-10 backdrop-blur-sm"
        >
          <!-- Badge -->
          <div
            v-if="pkg.badge"
            :class="pkg.badgeColor"
            class="absolute top-0 right-0 text-[9px] font-black px-2.5 py-1 rounded-bl-xl text-white shadow-lg tracking-wider"
          >
            {{ pkg.badge }}
          </div>

          <div
            class="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-3xl mb-4 group-hover:scale-110 group-hover:rotate-6 transition duration-300 shadow-inner"
          >
            {{ pkg.icon }}
          </div>

          <h3 class="text-base font-bold text-white mb-1">{{ pkg.name }}</h3>
          <p class="text-gray-400 text-xs mb-4 min-h-[32px]">{{ pkg.desc }}</p>

          <!-- Options -->
          <div v-if="pkg.options" class="mb-4">
            <select
              v-model="pkg.selectedOption"
              class="w-full bg-black/40 text-white text-xs border border-white/10 rounded-lg p-2 outline-none focus:border-blue-500 transition-colors"
            >
              <option v-for="opt in pkg.options" :key="opt.sku" :value="opt">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="mt-auto pt-4 border-t border-white/5">
            <div v-if="pkg.isRecurring" class="mb-3 rounded-lg border border-white/10 bg-black/30 p-2">
              <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-white/70">
                Billing
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  @click="setPurchaseMode(pkg, 'subscription')"
                  :class="
                    getPurchaseMode(pkg) === 'subscription'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-gray-300'
                  "
                  class="flex-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors"
                >
                  Auto-renew
                </button>
                <button
                  type="button"
                  @click="setPurchaseMode(pkg, 'one_time')"
                  :class="
                    getPurchaseMode(pkg) === 'one_time'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-gray-300'
                  "
                  class="flex-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors"
                >
                  One-time
                </button>
              </div>
              <p
                v-if="getPurchaseMode(pkg) === 'subscription'"
                class="mt-1 text-[10px] text-emerald-300"
              >
                Cancel anytime
              </p>
            </div>

            <div class="flex items-end gap-1 mb-3">
              <div class="text-2xl font-black text-white tracking-tight">
                {{
                  currencyStore.formatPrice(
                    pkg.selectedOption ? pkg.selectedOption.price : pkg.price,
                  )
                }}
              </div>
              <span v-if="pkg.isRecurring && getPurchaseMode(pkg) === 'subscription'" class="text-xs text-gray-500 mb-1"
                >/mo</span
              >
            </div>

            <!-- PayPal Button Container -->
            <div
              v-if="paymentMethod === 'paypal'"
              :id="`paypal-btn-${pkg.sku}`"
              class="w-full min-h-[40px]"
            ></div>

            <button
              v-else
              @click="handleBuy(pkg)"
              :disabled="loading"
              class="w-full font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-xs uppercase tracking-wide shadow-lg active:scale-95"
              :class="
                pkg.btnClass ||
                'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white'
              "
            >
              <span
                v-if="loading && activeSku === getSku(pkg)"
                class="animate-spin"
                >⏳</span
              >
              {{ pkg.cta }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Manual Transfer Modal -->
    <Teleport to="body">
      <div
        v-if="showManualModal"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
      >
        <div
          class="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in-up"
        >
          <div
            class="bg-white/5 p-4 border-b border-white/5 flex justify-between items-center"
          >
            <h3 class="font-bold text-white flex items-center gap-2">
              🏦 Bank Transfer
            </h3>
            <button
              @click="closeManualModal"
              class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"
            >
              ✕
            </button>
          </div>

          <div class="p-6 max-h-[80vh] overflow-y-auto">
            <!-- Order Summary -->
            <div
              class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6 flex justify-between items-center"
            >
              <div>
                <p class="text-xs text-blue-400 font-bold uppercase mb-1">
                  Package
                </p>
                <p class="text-white font-bold">{{ selectedPkg?.name }}</p>
              </div>
              <div class="text-right">
                <p class="text-xs text-blue-400 font-bold uppercase mb-1">
                  Amount
                </p>
                <p class="text-xl font-black text-white">
                  {{ currencyStore.formatPrice(getPrice(selectedPkg)) }}
                </p>
              </div>
            </div>

            <!-- Payment Tabs -->
            <div class="flex gap-2 mb-6 bg-black/40 p-1 rounded-xl">
              <button
                v-for="tab in ['qr', 'account']"
                :key="tab"
                @click="manualTab = tab"
                :class="
                  manualTab === tab
                    ? 'bg-green-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white'
                "
                class="flex-1 py-2 rounded-lg text-xs font-bold transition capitalize"
              >
                {{ tab === "qr" ? "📲 Scan QR" : "🏛️ Bank / Wire" }}
              </button>
            </div>

            <!-- QR Code -->
            <div
              v-if="manualTab === 'qr'"
              class="text-center py-4 animate-fade-in-up"
            >
              <div class="bg-white p-4 rounded-2xl inline-block shadow-xl">
                <qrcode-vue
                  v-if="qrPayload"
                  :value="qrPayload"
                  :size="200"
                  level="H"
                />
              </div>
              <p class="text-gray-400 text-xs mt-3">
                Scan with Thai banking apps (PromptPay) or use account/wire tab for international transfer
              </p>
            </div>

            <!-- Bank Account -->
            <div v-else class="space-y-4 animate-fade-in-up">
              <div class="bg-white/5 p-4 rounded-xl border border-white/10">
                <p class="text-gray-400 text-xs mb-2">Transfer Profile</p>
                <select
                  v-model="selectedTransferProfileId"
                  class="w-full bg-black/40 text-white text-xs border border-white/10 rounded-lg p-2 outline-none focus:border-cyan-400 transition-colors"
                >
                  <option
                    v-for="profile in manualTransferProfiles"
                    :key="profile.id"
                    :value="profile.id"
                  >
                    {{ profile.label }} · {{ profile.currency || "THB" }}
                  </option>
                </select>
              </div>

              <div
                class="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center gap-4"
              >
                <div
                  class="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-2xl"
                >
                  🏦
                </div>
                <div>
                  <p class="text-gray-400 text-xs">Receiving Bank</p>
                  <p class="text-white font-bold">
                    {{ selectedTransferProfile.bankName || selectedTransferProfile.label }}
                  </p>
                  <p class="text-[11px] text-white/60">
                    {{
                      selectedTransferProfile.bankCode
                        ? `${selectedTransferProfile.bankCode} · ${selectedTransferProfile.currency || "THB"}`
                        : `${selectedTransferProfile.bankCountry || "TH"} · ${selectedTransferProfile.currency || "USD"}`
                    }}
                  </p>
                </div>
              </div>

              <div
                v-if="selectedTransferProfile.accountNumber"
                @click="copyToClipboard(selectedTransferProfile.accountNumber)"
                class="bg-white/5 p-4 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition group"
              >
                <p class="text-gray-400 text-xs mb-1">Account Number</p>
                <div class="flex items-center justify-between">
                  <span
                    class="text-white font-mono text-lg font-bold tracking-wider"
                  >{{ selectedTransferProfile.accountNumber }}</span>
                  <span
                    class="text-[10px] bg-white/10 px-2 py-1 rounded text-gray-300 group-hover:bg-green-500 group-hover:text-white transition-colors"
                  >COPY</span>
                </div>
              </div>

              <div
                v-if="selectedTransferProfile.accountName"
                class="bg-white/5 p-4 rounded-xl border border-white/5"
              >
                <p class="text-gray-400 text-xs">Account Name</p>
                <p class="text-white font-bold">{{ selectedTransferProfile.accountName }}</p>
              </div>

              <div
                v-if="selectedTransferProfile.swiftCode || selectedTransferProfile.iban || selectedTransferProfile.routingNumber"
                class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2"
              >
                <p class="text-gray-400 text-xs">International Wire Details</p>
                <p v-if="selectedTransferProfile.swiftCode" class="text-white text-sm">
                  SWIFT: <span class="font-bold">{{ selectedTransferProfile.swiftCode }}</span>
                </p>
                <p v-if="selectedTransferProfile.iban" class="text-white text-sm">
                  IBAN: <span class="font-bold">{{ selectedTransferProfile.iban }}</span>
                </p>
                <p v-if="selectedTransferProfile.routingNumber" class="text-white text-sm">
                  Routing: <span class="font-bold">{{ selectedTransferProfile.routingNumber }}</span>
                </p>
              </div>

              <div class="bg-cyan-500/10 p-4 rounded-xl border border-cyan-400/25">
                <p class="text-cyan-200 text-xs font-bold uppercase tracking-wide mb-2">
                  Supported Thai Banks
                </p>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="bank in supportedThaiBanks"
                    :key="bank.code"
                    class="rounded-full border border-cyan-300/35 px-2 py-1 text-[11px] text-cyan-100"
                  >
                    {{ bank.code }} · {{ bank.name }}
                  </span>
                </div>
                <p v-if="selectedTransferProfile.notes" class="mt-2 text-[11px] text-cyan-100/90">
                  {{ selectedTransferProfile.notes }}
                </p>
              </div>
            </div>

            <!-- Buyer Details & Upload -->
            <div class="mt-8 space-y-4 border-t border-white/10 pt-6">
              <h4 class="text-white font-bold text-sm">Verify Payment</h4>

              <div class="grid grid-cols-2 gap-3">
                <input
                  v-model="buyerProfile.full_name"
                  type="text"
                  placeholder="Full Name"
                  class="input-dark"
                />
                <input
                  v-model="buyerProfile.phone"
                  type="text"
                  placeholder="Phone"
                  class="input-dark"
                />
                <input
                  v-model="buyerProfile.email"
                  type="email"
                  placeholder="Email"
                  class="input-dark"
                />
                <input
                  v-model="buyerProfile.address_line1"
                  type="text"
                  placeholder="Address Line 1"
                  class="input-dark"
                />
                <input
                  v-model="buyerProfile.country"
                  type="text"
                  placeholder="Country"
                  class="input-dark"
                />
                <input
                  v-model="buyerProfile.province"
                  type="text"
                  placeholder="Province"
                  class="input-dark"
                />
                <input
                  v-model="buyerProfile.district"
                  type="text"
                  placeholder="District"
                  class="input-dark"
                />
                <input
                  v-model="buyerProfile.postal_code"
                  type="text"
                  placeholder="Postal Code"
                  class="input-dark"
                />
              </div>

              <div class="relative">
                <input
                  type="file"
                  ref="fileInput"
                  accept="image/*"
                  @change="handleFileUpload"
                  class="hidden"
                  id="slip-upload"
                />
                <label
                  for="slip-upload"
                  class="flex items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-green-500/50 hover:bg-green-500/5 transition text-gray-400 flex-col gap-2"
                >
                  <div v-if="previewUrl" class="w-full h-full p-2">
                    <img
                      :src="previewUrl"
                      class="w-full h-full object-contain rounded-lg"
                    />
                  </div>
                  <span v-else class="text-2xl">📸</span>
                  <span v-if="!previewUrl" class="text-xs"
                    >Tap to upload slip</span
                  >
                </label>
              </div>

              <button
                @click="confirmManualPayment"
                :disabled="uploading || !slipUrl"
                class="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-green-900/20 active:scale-95 transition disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
              >
                <span v-if="uploading" class="animate-spin">⏳</span>
                {{ uploading ? "Verifying..." : "Confirm Transfer" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import confetti from "canvas-confetti";
import generatePayload from "promptpay-qr";
import QrcodeVue from "qrcode.vue";
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useCurrency } from "@/composables/useCurrency";
import { useNotifications } from "@/composables/useNotifications";
import { usePayPal } from "@/composables/usePayPal";
import { featureFlags } from "@/config/featureFlags";
import { THAI_BANK_OPTIONS } from "@/constants/bankCatalog";
import { supabase } from "../../lib/supabase";
import { paymentService } from "../../services/paymentService";

// Import CSS animations from main.postcss implicitly since it's global

const props = defineProps({
	shopId: { type: [String, Number], required: true },
});

// Composables
const { notifySuccess, notifyError } = useNotifications();
const currencyStore = useCurrency();
const paypal = usePayPal();

// State
const loading = ref(false);
const uploading = ref(false);
const paymentMethod = ref("stripe"); // stripe, paypal, manual
const isPayPalPinsEnabled = featureFlags.enablePayPalPins;
const isManualPinsEnabled = featureFlags.enableManualPins;
const paymentMethods = computed(() => {
	const methods = ["stripe"];
	if (isPayPalPinsEnabled) methods.push("paypal");
	if (isManualPinsEnabled) methods.push("manual");
	return methods;
});
const activeTier = ref("all");
const selectedPkg = ref(null);
const successMessage = ref(null);
const showManualModal = ref(false);
const manualTab = ref("qr");
const selectedTransferProfileId = ref("th-kbank");
const qrPayload = ref("");
const slipUrl = ref(null);
const previewUrl = ref(null);
const fileInput = ref(null);
const buyerProfile = reactive({
	full_name: "",
	phone: "",
	email: "",
	address_line1: "",
	country: "",
	province: "",
	district: "",
	postal_code: "",
});
const activeSku = ref(null);
const purchaseModeBySku = reactive({});
const partnerReferralCode = ref("");

// Config
const PROMPTPAY_ID = "0113222743";
const DEFAULT_TRANSFER_PROFILES = [
	{
		id: "th-kbank",
		type: "thai_bank",
		label: "Kasikornbank",
		bankCode: "KBANK",
		accountName: "Somchai Suwanwiang",
		accountNumber: "011-3-22274-3",
		currency: "THB",
		promptpayId: PROMPTPAY_ID,
	},
	{
		id: "th-scb",
		type: "thai_bank",
		label: "Siam Commercial Bank",
		bankCode: "SCB",
		accountName: "Somchai Suwanwiang",
		accountNumber: "404-0-88999-1",
		currency: "THB",
		promptpayId: PROMPTPAY_ID,
	},
	{
		id: "intl-wire",
		type: "international_wire",
		label: "International Wire",
		bankCountry: "Thailand",
		bankName: "VibeCity Settlement",
		currency: "USD",
		swiftCode: "BKKBTHBK",
		iban: "N/A",
		routingNumber: "N/A",
		notes:
			"Use SWIFT transfer from overseas banks. Upload transfer slip for verification.",
	},
];

const parseTransferProfiles = () => {
	const raw = String(
		import.meta.env.VITE_MANUAL_TRANSFER_PROFILES || "",
	).trim();
	if (!raw) return DEFAULT_TRANSFER_PROFILES;
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length > 0) return parsed;
	} catch {
		// ignore malformed env value
	}
	return DEFAULT_TRANSFER_PROFILES;
};

const manualTransferProfiles = computed(() => parseTransferProfiles());
const selectedTransferProfile = computed(
	() =>
		manualTransferProfiles.value.find(
			(profile) => profile.id === selectedTransferProfileId.value,
		) || manualTransferProfiles.value[0],
);
const qrPromptPayId = computed(
	() => selectedTransferProfile.value?.promptpayId || PROMPTPAY_ID,
);
const supportedThaiBanks = computed(() => THAI_BANK_OPTIONS);

// 💎 Package Tiers Configuration
const tiers = [
	{ id: "all", name: "All", icon: "🌐", grad: "from-gray-700 to-gray-600" },
	{
		id: "starter",
		name: "Starter",
		icon: "🟢",
		grad: "from-emerald-500 to-teal-500",
	},
	{
		id: "growth",
		name: "Growth",
		icon: "🟡",
		grad: "from-yellow-500 to-orange-500",
	},
	{
		id: "premium",
		name: "Premium",
		icon: "🔴",
		grad: "from-red-500 to-pink-500",
	},
	{ id: "vip", name: "VIP", icon: "💎", grad: "from-purple-600 to-indigo-600" },
];

const packages = reactive([
	// 🟢 STARTER
	{
		name: "Basic Pin",
		desc: "Put your shop on the map.",
		tier: "starter",
		icon: "📍",
		price: 59,
		sku: "standard_3d",
		options: [
			{ label: "3 Days", price: 59, sku: "standard_3d" },
			{ label: "7 Days", price: 99, sku: "standard_7d" },
			{ label: "30 Days", price: 249, sku: "standard_30d" },
		],
		selectedOption: { label: "3 Days", price: 59, sku: "standard_3d" },
		cta: "Place Pin",
		btnClass: "bg-emerald-600 hover:bg-emerald-500 text-white",
	},
	{
		name: "Category Badge",
		desc: "Show category icon on your pin.",
		tier: "starter",
		icon: "🏷️",
		price: 79,
		sku: "badge_cat",
		cta: "Get Badge",
		btnClass: "bg-emerald-600 hover:bg-emerald-500 text-white",
	},

	// 🟡 GROWTH
	{
		name: "Verified Badge",
		desc: "Blue tick trusted by users.",
		tier: "growth",
		icon: "✅",
		price: 199,
		sku: "verified",
		options: [
			{ label: "1 Year", price: 199, sku: "verified_1y" },
			{ label: "Lifetime", price: 999, sku: "verified_life" },
		],
		selectedOption: { label: "1 Year", price: 199, sku: "verified_1y" },
		cta: "Verify Now",
		badge: "TRUST",
		badgeColor: "bg-blue-600",
		btnClass: "bg-blue-600 hover:bg-blue-500 text-white",
	},
	{
		name: "Glow Effect",
		desc: "Make your pin glow at night.",
		tier: "growth",
		icon: "✨",
		price: 99,
		sku: "glow_7d",
		options: [
			{ label: "7 Days", price: 99, sku: "glow_7d" },
			{ label: "30 Days", price: 249, sku: "glow_30d" },
		],
		selectedOption: { label: "7 Days", price: 99, sku: "glow_7d" },
		cta: "Add Glow",
		btnClass: "bg-yellow-600 hover:bg-yellow-500 text-white",
	},
	{
		name: "Photo Showcase",
		desc: "Display 5 photos in popup.",
		tier: "growth",
		icon: "📸",
		price: 149,
		sku: "showcase",
		cta: "Unlock Photos",
		btnClass: "bg-orange-600 hover:bg-orange-500 text-white",
	},

	// 🔴 PREMIUM
	{
		name: "Visibility Boost",
		desc: "Rank #1 in search results.",
		tier: "premium",
		icon: "🚀",
		price: 200,
		sku: "boost_7d",
		cta: "Boost Now",
		badge: "POPULAR",
		badgeColor: "bg-orange-500",
		btnClass: "bg-gradient-to-r from-orange-600 to-red-600 text-white",
	},
	{
		name: "Giant Pin",
		desc: "Massive 3D pin seen from space.",
		tier: "premium",
		icon: "🏆",
		price: 3000,
		sku: "giant_monthly",
		isRecurring: true,
		isPremium: true,
		cta: "Go Giant",
		badge: "PREMIUM",
		badgeColor: "bg-purple-600",
		btnClass: "bg-gradient-to-r from-purple-600 to-pink-600 text-white",
	},
	{
		name: "Video Pin",
		desc: "Play video when pin clicked.",
		tier: "premium",
		icon: "🎬",
		price: 1500,
		sku: "video_pin",
		isRecurring: true,
		cta: "Add Video",
		btnClass: "bg-red-600 hover:bg-red-500 text-white",
	},

	// 💎 VIP
	{
		name: "VIP Bundle",
		desc: "Every feature included.",
		tier: "vip",
		icon: "👑",
		price: 5000,
		sku: "vip_bundle",
		isRecurring: true,
		isPremium: true,
		cta: "Become VIP",
		badge: "BEST VALUE",
		badgeColor: "bg-black border border-amber-400",
		btnClass:
			"bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black",
	},
]);

const filteredPackages = computed(() => {
	if (activeTier.value === "all") return packages;
	return packages.filter((p) => p.tier === activeTier.value);
});
watch(
	paymentMethods,
	(methods) => {
		if (!methods.includes(paymentMethod.value)) {
			paymentMethod.value = "stripe";
		}
	},
	{ immediate: true },
);

const getPrice = (pkg) => {
	if (!pkg) return 0;
	return pkg.selectedOption ? pkg.selectedOption.price : pkg.price;
};

const getSku = (pkg) => {
	if (!pkg) return "";
	return pkg.selectedOption ? pkg.selectedOption.sku : pkg.sku;
};

const getPurchaseMode = (pkg) => {
	if (!pkg?.sku) return "one_time";
	return (
		purchaseModeBySku[pkg.sku] ||
		(pkg.isRecurring ? "subscription" : "one_time")
	);
};

const setPurchaseMode = (pkg, mode) => {
	if (!pkg?.sku) return;
	purchaseModeBySku[pkg.sku] =
		mode === "subscription" ? "subscription" : "one_time";
};

// PayPal Button Rendering
watch(paymentMethod, async (newVal) => {
	if (newVal === "paypal") {
		if (!paypal.isReady.value)
			await paypal.loadPayPal(currencyStore.currentCurrency.value);

		// Re-render buttons for all packages
		nextTick(() => {
			packages.forEach((pkg) => {
				const containerId = `paypal-btn-${pkg.sku}`;
				const container = document.getElementById(containerId);
				if (container) {
					container.innerHTML = ""; // Clear old button
					const priceTHB = getPrice(pkg);
					const priceUSD = currencyStore.getPriceValue(priceTHB); // Convert to USD for PayPal

					paypal.renderButton(`#${containerId}`, {
						amount: priceUSD,
						onSuccess: (order) => {
							notifySuccess(`PayPal Payment Successful: ${order.id}`);
							confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
						},
						onError: (err) => notifyError(`PayPal Error: ${err}`),
					});
				}
			});
		});
	}
});

// Initialization
onMounted(() => {
	currencyStore.initCurrency();
	for (const pkg of packages) {
		purchaseModeBySku[pkg.sku] = pkg.isRecurring ? "subscription" : "one_time";
	}
	if (
		!manualTransferProfiles.value.some(
			(profile) => profile.id === selectedTransferProfileId.value,
		)
	) {
		selectedTransferProfileId.value = manualTransferProfiles.value[0]?.id || "";
	}
	const params = new URLSearchParams(globalThis.location.search);
	if (params.get("success") === "true") {
		successMessage.value = "Payment Successful! Your features are active. 🎉";
		notifySuccess("Payment Successful! Features active.");
		confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
		globalThis.history.replaceState(
			{},
			document.title,
			globalThis.location.pathname,
		);
	}
	partnerReferralCode.value =
		localStorage.getItem("vibe_partner_referral_code") || "";
});

const persistPartnerCode = () => {
	const clean = String(partnerReferralCode.value || "")
		.replace(/[^a-zA-Z0-9_-]/g, "")
		.slice(0, 64);
	partnerReferralCode.value = clean;
	if (clean) localStorage.setItem("vibe_partner_referral_code", clean);
	else localStorage.removeItem("vibe_partner_referral_code");
};

// Actions
const handleBuy = (pkg) => {
	selectedPkg.value = pkg;
	const sku = getSku(pkg);

	if (paymentMethod.value === "manual") {
		if (!isManualPinsEnabled) {
			notifyError("Manual transfer is temporarily unavailable.");
			return;
		}
		showManualModal.value = true;
		const amount = getPrice(pkg);
		qrPayload.value = generatePayload(qrPromptPayId.value, { amount });
	} else {
		// Stripe
		loading.value = true;
		activeSku.value = sku;
		paymentService
			.createCheckoutSession(props.shopId, [{ sku, quantity: 1 }], {
				purchaseMode: getPurchaseMode(pkg),
				partnerCode: partnerReferralCode.value,
				paymentPreferences: {
					methodStrategy: "dynamic",
					allowInternational: true,
					preferPromptPay: true,
					bankCountry: String(buyerProfile.country || "TH").toUpperCase(),
					currency: currencyStore.currentCurrency === "USD" ? "USD" : "THB",
				},
			})
			.then(({ url }) => {
				if (url) globalThis.location.href = url;
			})
			.catch((err) => notifyError(`Payment Error: ${err.message}`))
			.finally(() => {
				loading.value = false;
			});
	}
};

const handleFileUpload = async (event) => {
	const file = event.target.files[0];
	if (!file) return;
	uploading.value = true;
	previewUrl.value = URL.createObjectURL(file);
	try {
		const fileName = `${Date.now()}-${file.name}`;
		const { error } = await supabase.storage
			.from("payment-slips")
			.upload(fileName, file);
		if (error) throw error;
		const { data } = supabase.storage
			.from("payment-slips")
			.getPublicUrl(fileName);
		slipUrl.value = data.publicUrl;
		notifySuccess("Slip uploaded!");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		notifyError(`Upload failed: ${message}`);
	} finally {
		uploading.value = false;
	}
};

const confirmManualPayment = async () => {
	if (!slipUrl.value) return notifyError("Please upload a slip");
	const required = [
		"full_name",
		"phone",
		"email",
		"address_line1",
		"country",
		"province",
		"district",
		"postal_code",
	];
	for (const field of required) {
		if (!String(buyerProfile[field] || "").trim()) {
			return notifyError(`Missing required field: ${field}`);
		}
	}

	uploading.value = true;
	try {
		const profile = selectedTransferProfile.value || {};
		await paymentService.createManualOrder({
			venue_id: props.shopId,
			sku: getSku(selectedPkg.value),
			amount: getPrice(selectedPkg.value),
			slip_url: slipUrl.value,
			consent_personal_data: true,
			buyer_profile: { ...buyerProfile },
			metadata: {
				manual_transfer_profile_id: profile.id || null,
				manual_transfer_type: profile.type || null,
				bank_code: profile.bankCode || null,
				bank_label: profile.label || null,
				bank_country: profile.bankCountry || "TH",
				currency: profile.currency || "THB",
				swift_code: profile.swiftCode || null,
				iban: profile.iban || null,
				routing_number: profile.routingNumber || null,
			},
		});
		notifySuccess("Transfer submitted! Pending verification.");
		showManualModal.value = false;
	} catch (err) {
		notifyError(err?.message || "Unable to submit transfer.");
	} finally {
		uploading.value = false;
	}
};

const closeManualModal = () => {
	showManualModal.value = false;
	selectedPkg.value = null;
	slipUrl.value = null;
	previewUrl.value = null;
	qrPayload.value = "";
};

const copyToClipboard = (text) => {
	navigator.clipboard.writeText(text);
	notifySuccess("Copied!");
};
</script>

<style scoped>
.input-dark {
  @apply w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-green-500 transition-colors;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
