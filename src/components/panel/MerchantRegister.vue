<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[7000] flex items-end sm:items-center justify-center"
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/75 backdrop-blur-md" @click="emit('close')" />

    <!-- Panel -->
    <div class="merchant-panel relative w-full max-w-md flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
         style="max-height: 92vh">

      <!-- Header -->
      <div class="px-5 pt-5 pb-3 shrink-0 border-b border-white/8">
        <!-- Drag handle (mobile) -->
        <div class="flex justify-center mb-3 sm:hidden">
          <div class="w-8 h-1 rounded-full bg-white/20"></div>
        </div>

        <!-- Step progress -->
        <div class="flex items-center gap-1.5 mb-4">
          <div
            v-for="i in 4"
            :key="i"
            class="h-1 rounded-full transition-all duration-300"
            :class="[
              i <= currentStep ? 'bg-violet-500' : 'bg-white/15',
              i === currentStep ? 'flex-[2]' : 'flex-1',
            ]"
          />
        </div>

        <div class="flex items-start justify-between">
          <div>
            <div class="text-xs font-bold text-violet-400 uppercase tracking-widest mb-0.5">
              Step {{ currentStep }} of 4
            </div>
            <h2 class="text-xl font-black text-white">{{ stepTitles[currentStep - 1] }}</h2>
          </div>
          <button
            @click="emit('close')"
            class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/8 hover:bg-white/14 active:scale-95 text-white/60 hover:text-white transition-all shrink-0"
            aria-label="Close"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Step Content -->
      <div class="flex-1 overflow-y-auto" style="-webkit-overflow-scrolling: touch">

        <!-- STEP 1: Shop Details -->
        <div v-if="currentStep === 1" class="p-5 space-y-4">
          <div>
            <label class="text-xs font-bold text-white/50 uppercase tracking-wider block mb-1.5">Shop Name</label>
            <input
              v-model="form.name"
              placeholder="e.g. The Purple Bar"
              maxlength="80"
              class="merchant-input w-full px-4 py-3.5 rounded-xl text-white text-sm font-medium placeholder-white/25 focus:outline-none"
            />
          </div>

          <div>
            <label class="text-xs font-bold text-white/50 uppercase tracking-wider block mb-1.5">Category</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="cat in ['Cafe', 'Bar', 'Restaurant', 'Club', 'Event', 'Fashion']"
                :key="cat"
                @click="form.category = cat"
                class="py-3 rounded-xl text-xs font-bold transition-all active:scale-95 border"
                :class="form.category === cat
                  ? 'bg-violet-600/30 text-violet-300 border-violet-500/50'
                  : 'bg-white/5 text-white/50 border-white/8 hover:bg-white/10 hover:text-white/80'"
              >
                {{ cat }}
              </button>
            </div>
          </div>
        </div>

        <!-- STEP 2: Location -->
        <div v-if="currentStep === 2" class="p-5 space-y-4">
          <div
            class="h-44 rounded-2xl bg-zinc-800/80 border border-white/8 flex flex-col items-center justify-center gap-3 relative overflow-hidden"
          >
            <div class="absolute inset-0 opacity-20 bg-gradient-to-br from-blue-900 to-zinc-900"></div>
            <button
              @click="getCurrentLocation"
              class="relative z-10 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-sm font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all"
            >
              <MapPin class="w-4 h-4" />
              Pin My Location
            </button>
            <p v-if="form.lat" class="relative z-10 text-xs text-green-400 font-mono bg-black/60 px-3 py-1.5 rounded-lg">
              {{ form.lat.toFixed(5) }}, {{ form.lng.toFixed(5) }}
            </p>
            <p v-else class="relative z-10 text-xs text-white/30">Tap to use GPS location</p>
          </div>

          <div class="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 leading-relaxed">
            Your venue will appear on the VibeCity map at this location. Make sure you're at or near your venue when pinning.
          </div>
        </div>

        <!-- STEP 3: Package -->
        <div v-if="currentStep === 3" class="p-5 space-y-4">
          <!-- Pin type toggle -->
          <div class="flex gap-2 p-1 bg-black/40 rounded-xl border border-white/8">
            <button
              @click="form.pinType = 'normal'"
              class="flex-1 py-2.5 rounded-lg text-sm font-black transition-all"
              :class="form.pinType === 'normal' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40'"
            >
              Normal Pin
            </button>
            <button
              @click="form.pinType = 'giant'"
              class="flex-1 py-2.5 rounded-lg text-sm font-black transition-all"
              :class="form.pinType === 'giant' ? 'bg-fuchsia-600 text-white shadow-lg' : 'text-white/40'"
            >
              Giant Pin
            </button>
          </div>

          <!-- Packages -->
          <div class="space-y-2">
            <button
              v-for="pkg in availablePackages"
              :key="pkg.id"
              @click="form.selectedPackageId = pkg.id"
              class="w-full p-4 rounded-xl border text-left transition-all active:scale-[0.99]"
              :class="form.selectedPackageId === pkg.id
                ? 'bg-white/10 border-violet-400/60 shadow-[0_0_20px_rgba(139,92,246,0.2)]'
                : 'bg-white/4 border-white/8 hover:bg-white/8'"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-white text-sm">{{ pkg.label }}</span>
                    <span
                      v-if="pkg.badge"
                      class="text-[10px] bg-white/15 text-white/70 px-1.5 py-0.5 rounded font-bold"
                    >{{ pkg.badge }}</span>
                  </div>
                  <div class="text-xs text-white/40 mt-0.5 truncate">{{ pkg.desc }}</div>
                </div>
                <div class="text-base font-black text-white shrink-0">฿{{ pkg.price.toLocaleString() }}</div>
              </div>
            </button>
          </div>

          <!-- Add-ons -->
          <div>
            <div class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Optional Add-ons</div>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="addon in addOnCatalog"
                :key="addon.id"
                @click="toggleAddOn(addon.id)"
                class="p-3 rounded-xl border text-left transition-all active:scale-95"
                :class="selectedAddOns.includes(addon.id)
                  ? 'bg-emerald-600/20 border-emerald-400/50 text-emerald-300'
                  : 'bg-white/4 border-white/8 text-white/50 hover:bg-white/8'"
              >
                <div class="text-xs font-bold">{{ addon.label }}</div>
                <div class="text-[11px] text-white/40">+฿{{ addon.price.toLocaleString() }}</div>
              </button>
            </div>
          </div>

          <!-- Total -->
          <div class="p-4 rounded-xl bg-white/5 border border-white/8 flex items-center justify-between">
            <span class="text-sm font-bold text-white/60">Total</span>
            <span class="text-xl font-black text-white">฿{{ totalPrice.toLocaleString() }}</span>
          </div>
        </div>

        <!-- STEP 4: Payment -->
        <div v-if="currentStep === 4" class="p-5 space-y-4">
          <!-- Payment method tab -->
          <div class="flex gap-1 p-1 bg-black/40 rounded-xl border border-white/8">
            <button
              @click="paymentTab = 'qr'"
              class="flex-1 py-2 text-xs font-bold rounded-lg transition-all"
              :class="paymentTab === 'qr' ? 'bg-white text-black shadow' : 'text-white/50'"
            >Scan QR</button>
            <button
              @click="paymentTab = 'bank'"
              class="flex-1 py-2 text-xs font-bold rounded-lg transition-all"
              :class="paymentTab === 'bank' ? 'bg-white text-black shadow' : 'text-white/50'"
            >Bank Transfer</button>
          </div>

          <!-- QR Tab -->
          <div v-if="paymentTab === 'qr'" class="bg-white rounded-2xl p-5 flex flex-col items-center gap-3">
            <qrcode-vue v-if="qrPayload" :value="qrPayload" :size="180" level="H" class="rounded-xl" />
            <div class="text-center">
              <div class="text-sm font-black text-black">฿{{ totalPrice.toLocaleString() }}</div>
              <div class="text-xs text-gray-500 mt-0.5">PromptPay · {{ PROMPTPAY_ID }}</div>
            </div>
          </div>

          <!-- Bank Tab -->
          <div v-else class="space-y-3 p-4 rounded-2xl bg-white/5 border border-white/8 text-white">
            <div>
              <div class="text-[11px] text-white/40 mb-0.5">Bank</div>
              <div class="text-sm font-bold">{{ BANK_NAME }}</div>
            </div>
            <div>
              <div class="text-[11px] text-white/40 mb-0.5">Account Number</div>
              <button
                @click="copyAccountNumber"
                class="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/15 font-mono text-sm text-left flex items-center justify-between hover:bg-black/60 transition-colors active:scale-[0.98]"
              >
                <span>{{ BANK_ACCOUNT_DISPLAY }}</span>
                <span class="text-[10px] bg-white/20 text-white/70 px-2 py-0.5 rounded font-bold">COPY</span>
              </button>
            </div>
            <div>
              <div class="text-[11px] text-white/40 mb-0.5">Account Name</div>
              <div class="text-sm font-bold">{{ ACCOUNT_NAME }}</div>
            </div>
          </div>

          <!-- Slip Upload -->
          <input type="file" ref="slipInput" class="hidden" accept="image/*" @change="handleSlipUpload" />
          <button
            @click="slipInput?.click()"
            class="w-full py-3.5 rounded-xl border-2 border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-all flex items-center justify-center gap-2 text-sm font-medium active:scale-[0.98]"
          >
            <Upload class="w-4 h-4" />
            {{ slipFile ? slipFile.name : 'Upload Payment Slip' }}
          </button>

          <div v-if="previewUrl" class="rounded-2xl overflow-hidden border border-white/10">
            <img :src="previewUrl" alt="Slip preview" class="w-full max-h-48 object-contain bg-black/30" />
          </div>

          <div v-if="uploadProgress > 0" class="space-y-1">
            <div class="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div class="h-full rounded-full bg-emerald-400 transition-all duration-300" :style="{ width: `${uploadProgress}%` }"></div>
            </div>
            <p class="text-xs text-emerald-300">Uploading... {{ uploadProgress }}%</p>
          </div>
        </div>
      </div>

      <!-- Footer Navigation -->
      <div class="px-5 pb-safe pt-3 border-t border-white/8 shrink-0">
        <div class="flex gap-3">
          <button
            v-if="currentStep > 1"
            @click="currentStep--"
            class="w-12 h-12 flex items-center justify-center rounded-xl bg-white/8 hover:bg-white/14 active:scale-95 text-white/60 hover:text-white transition-all"
            aria-label="Previous step"
          >
            <ChevronLeft class="w-5 h-5" />
          </button>

          <button
            v-if="currentStep < 4"
            @click="currentStep++"
            :disabled="!canProceed"
            class="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-black text-sm active:scale-[0.98] transition-all shadow-lg shadow-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>

          <button
            v-else
            @click="submitForm"
            :disabled="isSubmitting || !slipFile"
            class="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-black text-sm active:scale-[0.98] transition-all shadow-lg shadow-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span v-if="isSubmitting" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            {{ isSubmitting ? 'Submitting...' : 'Confirm & Promote' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import confetti from "canvas-confetti";
import { ChevronLeft, MapPin, Upload, X } from "lucide-vue-next";
import generatePayload from "promptpay-qr";
import QrcodeVue from "qrcode.vue";
import { computed, ref, watch } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import { supabase } from "@/lib/supabase";

const props = defineProps({ isOpen: Boolean });
const emit = defineEmits(["close"]);

const PROMPTPAY_ID = "0113222743";
const BANK_NAME = "Kasikorn Bank (K-Bank)";
const BANK_ACCOUNT_RAW = "0113222743";
const BANK_ACCOUNT_DISPLAY = "011-3-22274-3";
const ACCOUNT_NAME = "Somchai Suwanwiang";

// ── Step wizard ──
const currentStep = ref(1);
const stepTitles = ["Shop Details", "Location", "Package", "Payment"];

const canProceed = computed(() => {
	if (currentStep.value === 1)
		return form.value.name.trim() && form.value.category;
	if (currentStep.value === 2) return !!form.value.lat;
	return true;
});

const packageCatalog = [
	{
		id: "normal_pin_1d",
		pinType: "normal",
		label: "Normal Pin · 1 Day",
		desc: "Standard map pin for quick visibility",
		price: 150,
		durationDays: 1,
		icon: "📍",
		badge: "Starter",
	},
	{
		id: "normal_pin_3d",
		pinType: "normal",
		label: "Normal Pin · 3 Days",
		desc: "Stable exposure across weekend traffic",
		price: 390,
		durationDays: 3,
		icon: "📍",
		badge: "Save 13%",
	},
	{
		id: "normal_pin_7d",
		pinType: "normal",
		label: "Normal Pin · 7 Days",
		desc: "Weekly campaign with better map presence",
		price: 840,
		durationDays: 7,
		icon: "📍",
		badge: "Popular",
	},
	{
		id: "normal_pin_14d",
		pinType: "normal",
		label: "Normal Pin · 14 Days",
		desc: "Two-week campaign for sustained reach",
		price: 1590,
		durationDays: 14,
		icon: "📍",
	},
	{
		id: "normal_pin_30d",
		pinType: "normal",
		label: "Normal Pin · 30 Days",
		desc: "Monthly presence for stable traffic",
		price: 2990,
		durationDays: 30,
		icon: "📍",
		badge: "Best Value",
	},
	{
		id: "giant_pin_1d",
		pinType: "giant",
		label: "Giant Pin · 1 Day",
		desc: "Large featured pin with premium visibility",
		price: 3000,
		durationDays: 1,
		icon: "🔥",
		badge: "Premium",
	},
	{
		id: "giant_pin_3d",
		pinType: "giant",
		label: "Giant Pin · 3 Days",
		desc: "Extended giant campaign for event weekends",
		price: 8500,
		durationDays: 3,
		icon: "🔥",
		badge: "Hot",
	},
	{
		id: "giant_pin_7d",
		pinType: "giant",
		label: "Giant Pin · 7 Days",
		desc: "Weekly hero placement for high conversion",
		price: 18900,
		durationDays: 7,
		icon: "🔥",
	},
	{
		id: "giant_pin_14d",
		pinType: "giant",
		label: "Giant Pin · 14 Days",
		desc: "Two-week giant promo for major campaigns",
		price: 34900,
		durationDays: 14,
		icon: "🔥",
		badge: "Scale",
	},
	{
		id: "giant_pin_30d",
		pinType: "giant",
		label: "Giant Pin · 30 Days",
		desc: "Monthly hero spotlight for top brands",
		price: 69900,
		durationDays: 30,
		icon: "🔥",
		badge: "Enterprise",
	},
];

const addOnCatalog = [
	{ id: "glow", label: "Glow", price: 190 },
	{ id: "animated_pin", label: "Animated Pin", price: 390 },
	{ id: "neon_trail", label: "Neon Trail", price: 290 },
	{ id: "spotlight", label: "Spotlight", price: 450 },
	{ id: "boost_feed", label: "Boost Feed", price: 650 },
	{ id: "verified_badge", label: "Verified Badge", price: 490 },
	{ id: "featured_explore", label: "Featured Explore", price: 890 },
	{ id: "priority_placement", label: "Priority", price: 1200 },
	{ id: "story_banner", label: "Story Banner", price: 550 },
	{ id: "night_mode_glow", label: "Night Glow", price: 320 },
];

const form = ref({
	name: "",
	category: "",
	lat: null,
	lng: null,
	pinType: "normal",
	selectedPackageId: "normal_pin_1d",
});

const paymentTab = ref("qr");
const selectedAddOns = ref([]);
const slipFile = ref(null);
const slipInput = ref(null);
const isSubmitting = ref(false);
const previewUrl = ref(null);
const uploadProgress = ref(0);
const { notifySuccess, notifyError } = useNotifications();

const availablePackages = computed(() =>
	packageCatalog.filter((pkg) => pkg.pinType === form.value.pinType),
);

watch(
	() => form.value.pinType,
	(pinType) => {
		const firstPkg = packageCatalog.find((pkg) => pkg.pinType === pinType);
		if (firstPkg) form.value.selectedPackageId = firstPkg.id;
	},
);

const selectedPackage = computed(
	() =>
		packageCatalog.find((pkg) => pkg.id === form.value.selectedPackageId) ||
		null,
);

const selectedAddOnObjects = computed(() =>
	addOnCatalog.filter((addon) => selectedAddOns.value.includes(addon.id)),
);

const totalPrice = computed(() => {
	const packagePrice = selectedPackage.value?.price || 0;
	const addOnPrice = selectedAddOnObjects.value.reduce(
		(sum, addon) => sum + addon.price,
		0,
	);
	return packagePrice + addOnPrice;
});

const qrPayload = computed(() => {
	const amount = Number(totalPrice.value) || 0;
	if (amount <= 0) return "";
	return generatePayload(PROMPTPAY_ID, { amount });
});

const toggleAddOn = (id) => {
	const idx = selectedAddOns.value.indexOf(id);
	if (idx >= 0) selectedAddOns.value.splice(idx, 1);
	else selectedAddOns.value.push(id);
};

const copyAccountNumber = async () => {
	try {
		await navigator.clipboard.writeText(BANK_ACCOUNT_RAW);
		notifySuccess("Account number copied");
	} catch {
		notifyError("Could not copy account number");
	}
};

const getCurrentLocation = () => {
	if (!navigator.geolocation) {
		notifyError("Geolocation is not supported by your browser");
		return;
	}
	navigator.geolocation.getCurrentPosition(
		(pos) => {
			form.value.lat = pos.coords.latitude;
			form.value.lng = pos.coords.longitude;
		},
		(error) => {
			let message = "Could not get your location";
			if (error.code === error.PERMISSION_DENIED)
				message = "Location access denied.";
			else if (error.code === error.POSITION_UNAVAILABLE)
				message = "Location unavailable.";
			else if (error.code === error.TIMEOUT)
				message = "Location request timed out.";
			notifyError(message);
		},
	);
};

const handleSlipUpload = (e) => {
	const file = e.target.files?.[0];
	if (!file) return;
	if (!file.type.startsWith("image/")) {
		notifyError("กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น");
		return;
	}
	if (file.size > 5 * 1024 * 1024) {
		notifyError("ไฟล์ใหญ่เกิน 5MB");
		return;
	}
	if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
	previewUrl.value = URL.createObjectURL(file);
	slipFile.value = file;
};

const submitForm = async () => {
	if (
		!form.value.name ||
		!form.value.category ||
		!form.value.lat ||
		!slipFile.value
	) {
		notifyError("Please complete all fields and upload payment slip");
		return;
	}
	if (!selectedPackage.value) {
		notifyError("Please select package");
		return;
	}

	isSubmitting.value = true;
	uploadProgress.value = 10;
	try {
		const fileExt = slipFile.value.name.split(".").pop();
		const fileName = `${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from("sensitive-uploads")
			.upload(fileName, slipFile.value);
		if (uploadError) throw uploadError;
		uploadProgress.value = 70;

		const visitorId =
			localStorage.getItem("vibe_visitor_id") || `anon_${Date.now()}`;
		if (!localStorage.getItem("vibe_visitor_id"))
			localStorage.setItem("vibe_visitor_id", visitorId);

		const pinType = form.value.pinType === "giant" ? "giant" : "standard";
		const pinMetadata = {
			package_id: selectedPackage.value.id,
			package_label: selectedPackage.value.label,
			duration_days: selectedPackage.value.durationDays,
			pin_type: pinType,
			payment_tab: paymentTab.value,
			addons: selectedAddOnObjects.value.map((addon) => ({
				id: addon.id,
				label: addon.label,
				price: addon.price,
			})),
			features: {
				glow: selectedAddOns.value.includes("glow"),
				animated_pin: selectedAddOns.value.includes("animated_pin"),
				neon_trail: selectedAddOns.value.includes("neon_trail"),
				spotlight: selectedAddOns.value.includes("spotlight"),
				boost_feed: selectedAddOns.value.includes("boost_feed"),
				verified_badge: selectedAddOns.value.includes("verified_badge"),
				featured_explore: selectedAddOns.value.includes("featured_explore"),
				priority_placement: selectedAddOns.value.includes("priority_placement"),
			},
		};

		const { error: dbError } = await supabase.from("venues").insert({
			name: form.value.name,
			description: `${form.value.category} - Promoted via VibeNow`,
			latitude: form.value.lat,
			longitude: form.value.lng,
			category: form.value.category,
			package_type: selectedPackage.value.id,
			price_total: totalPrice.value,
			payment_slip_url: uploadData.path,
			status: "pending",
			owner_visitor_id: visitorId,
			pin_type: pinType,
			pin_metadata: pinMetadata,
		});
		if (dbError) throw dbError;

		uploadProgress.value = 100;
		notifySuccess("Submission successful! We will review shortly.");
		confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
		emit("close");
	} catch (err) {
		notifyError(`Error: ${err.message}`);
	} finally {
		isSubmitting.value = false;
		setTimeout(() => {
			uploadProgress.value = 0;
		}, 800);
	}
};
</script>

<style scoped>
.merchant-panel {
  background: rgba(16, 16, 24, 0.97);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow: 0 -16px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset;
}

.merchant-input {
  background: rgba(255, 255, 255, 0.06);
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  transition: border-color 0.2s;
}
.merchant-input:focus {
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.06);
}

.pb-safe {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}

.border-white\/8  { border-color: rgba(255,255,255,0.08); }
.border-white\/15 { border-color: rgba(255,255,255,0.15); }
.bg-white\/4      { background: rgba(255,255,255,0.04); }
.bg-white\/8      { background: rgba(255,255,255,0.08); }
.bg-white\/14     { background: rgba(255,255,255,0.14); }
</style>
