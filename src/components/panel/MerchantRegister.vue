<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[7000] flex items-center justify-center p-4"
  >
    <div
      class="absolute inset-0 bg-black/80 backdrop-blur-md"
      @click="emit('close')"
    ></div>

    <div
      class="relative w-full max-w-lg bg-zinc-900 rounded-3xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
    >
      <div class="p-6 pb-2 shrink-0 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-black text-white tracking-tight">
            Promote Your Vibe
          </h2>
          <p class="text-sm text-gray-400">Boost visibility with flexible pin options</p>
        </div>
        <button
          @click="emit('close')"
          class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          ✕
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <div class="space-y-4">
          <h3 class="text-sm font-black text-white/60 uppercase tracking-widest">
            1. Shop Details
          </h3>
          <input
            v-model="form.name"
            placeholder="Shop Name"
            class="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
          />
          <select
            v-model="form.category"
            class="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white"
          >
            <option value="" disabled>Select Category</option>
            <option value="Cafe">Cafe</option>
            <option value="Bar">Bar</option>
            <option value="Restaurant">Restaurant</option>
            <option value="Club">Club</option>
            <option value="Event">Event</option>
            <option value="Fashion">Fashion</option>
          </select>
        </div>

        <div class="space-y-4">
          <h3 class="text-sm font-black text-white/60 uppercase tracking-widest">
            2. Location
          </h3>
          <div
            class="h-40 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center relative overflow-hidden group"
          >
            <div
              class="absolute inset-0 opacity-50 bg-[url('https://docs.mapbox.com/mapbox-gl-js/assets/streets.png')] bg-cover"
            ></div>
            <button
              @click="getCurrentLocation"
              class="relative z-10 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-2"
            >
              <MapPin class="w-3 h-3" /> Pin Current Location
            </button>
            <p
              v-if="form.lat"
              class="absolute bottom-2 left-2 text-[10px] text-green-400 font-mono bg-black/60 px-2 py-1 rounded"
            >
              {{ form.lat.toFixed(4) }}, {{ form.lng.toFixed(4) }}
            </p>
          </div>
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-black text-white/60 uppercase tracking-widest">
              3. Pin Type + Package
            </h3>
            <span class="text-lg font-black text-green-400"
              >฿{{ totalPrice.toLocaleString() }}</span
            >
          </div>

          <div class="grid grid-cols-2 gap-3">
            <button
              @click="form.pinType = 'normal'"
              :class="[
                'p-3 rounded-xl border text-left transition-all',
                form.pinType === 'normal'
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-white/5 border-white/10 text-white/80',
              ]"
            >
              <div class="text-sm font-black">📍 Normal Pin</div>
              <div class="text-[11px] text-white/60">Standard map visibility</div>
            </button>
            <button
              @click="form.pinType = 'giant'"
              :class="[
                'p-3 rounded-xl border text-left transition-all',
                form.pinType === 'giant'
                  ? 'bg-pink-600/20 border-pink-500 text-white'
                  : 'bg-white/5 border-white/10 text-white/80',
              ]"
            >
              <div class="text-sm font-black">🔥 Giant Pin</div>
              <div class="text-[11px] text-white/60">Premium spotlight reach</div>
            </button>
          </div>

          <div class="max-h-64 overflow-y-auto space-y-3 pr-1">
            <button
              v-for="pkg in availablePackages"
              :key="pkg.id"
              @click="form.selectedPackageId = pkg.id"
              :class="[
                'w-full p-4 rounded-xl border cursor-pointer transition-all text-left',
                form.selectedPackageId === pkg.id
                  ? 'bg-white/10 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                  : 'bg-white/5 border-white/10 hover:bg-white/10',
              ]"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="font-bold text-white flex items-center gap-2">
                    <span>{{ pkg.icon }}</span>
                    <span>{{ pkg.label }}</span>
                    <span
                      v-if="pkg.badge"
                      class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded"
                      >{{ pkg.badge }}</span
                    >
                  </div>
                  <div class="text-xs text-gray-400 mt-1">{{ pkg.desc }}</div>
                </div>
                <div class="text-sm font-black text-white">฿{{ pkg.price.toLocaleString() }}</div>
              </div>
            </button>
          </div>

          <div class="space-y-2">
            <h4 class="text-xs font-black text-white/60 uppercase tracking-wider">
              Add-ons
            </h4>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="addon in addOnCatalog"
                :key="addon.id"
                @click="toggleAddOn(addon.id)"
                :class="[
                  'p-3 rounded-xl border text-left transition-all',
                  selectedAddOns.includes(addon.id)
                    ? 'bg-emerald-600/20 border-emerald-400 text-white'
                    : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10',
                ]"
              >
                <div class="text-xs font-bold">{{ addon.label }}</div>
                <div class="text-[11px] text-white/60">+฿{{ addon.price.toLocaleString() }}</div>
              </button>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-sm font-black text-white/60 uppercase tracking-widest">
            4. Payment
          </h3>

          <div class="flex bg-black/30 rounded-xl p-1 border border-white/10">
            <button
              @click="paymentTab = 'qr'"
              :class="[
                'flex-1 py-2 text-xs font-bold rounded-lg transition-all',
                paymentTab === 'qr' ? 'bg-white text-black' : 'text-white/60',
              ]"
            >
              Scan QR
            </button>
            <button
              @click="paymentTab = 'bank'"
              :class="[
                'flex-1 py-2 text-xs font-bold rounded-lg transition-all',
                paymentTab === 'bank' ? 'bg-white text-black' : 'text-white/60',
              ]"
            >
              Bank Transfer
            </button>
          </div>

          <div
            v-if="paymentTab === 'qr'"
            class="bg-white p-4 rounded-xl flex flex-col items-center justify-center"
          >
            <qrcode-vue
              v-if="qrPayload"
              :value="qrPayload"
              :size="180"
              level="H"
              class="rounded-lg"
            />
            <p class="text-black text-xs font-bold mt-3">
              Scan PromptPay to pay ฿{{ totalPrice.toLocaleString() }}
            </p>
            <p class="text-[11px] text-gray-600 mt-1">PromptPay ID: {{ PROMPTPAY_ID }}</p>
          </div>

          <div
            v-else
            class="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 text-white"
          >
            <div class="text-xs text-white/60">Bank Name</div>
            <div class="font-bold">{{ BANK_NAME }}</div>

            <div class="text-xs text-white/60">Account Number</div>
            <button
              @click="copyAccountNumber"
              class="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/20 font-mono text-left flex items-center justify-between"
            >
              <span>{{ BANK_ACCOUNT_DISPLAY }}</span>
              <span class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">COPY</span>
            </button>

            <div class="text-xs text-white/60">Account Name</div>
            <div class="font-bold">{{ ACCOUNT_NAME }}</div>
          </div>

          <input
            type="file"
            ref="slipInput"
            class="hidden"
            accept="image/*"
            @change="handleSlipUpload"
          />
          <button
            @click="slipInput?.click()"
            class="w-full py-3 rounded-xl border-dashed border-2 border-white/20 text-white/50 hover:text-white hover:border-white/50 transition-all flex items-center justify-center gap-2"
          >
            <Upload class="w-4 h-4" />
            {{ slipFile ? slipFile.name : 'Upload Payment Slip' }}
          </button>
          <div
            v-if="previewUrl"
            class="mt-3 rounded-xl overflow-hidden border border-white/10 bg-white/5"
          >
            <img
              :src="previewUrl"
              alt="Slip preview"
              class="w-full h-48 object-contain bg-black/30"
            />
          </div>
          <div v-if="uploadProgress > 0" class="mt-2">
            <div class="w-full bg-white/10 rounded-full h-2">
              <div
                class="h-2 rounded-full bg-emerald-400 transition-all"
                :style="{ width: `${uploadProgress}%` }"
              ></div>
            </div>
            <p class="text-[11px] text-emerald-200 mt-1">Uploading... {{ uploadProgress }}%</p>
          </div>
        </div>
      </div>

      <div class="p-6 pt-2 border-t border-white/10 bg-zinc-900/95">
        <button
          @click="submitForm"
          :disabled="isSubmitting"
          class="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black text-lg shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
        >
          {{ isSubmitting ? 'Submitting...' : 'Confirm & Promote' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import confetti from "canvas-confetti";
import { MapPin, Upload } from "lucide-vue-next";
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
	{ id: "priority_placement", label: "Priority Placement", price: 1200 },
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
		if (firstPkg) {
			form.value.selectedPackageId = firstPkg.id;
		}
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
			switch (error.code) {
				case error.PERMISSION_DENIED:
					message =
						"Location access denied. Please enable location permissions.";
					break;
				case error.POSITION_UNAVAILABLE:
					message = "Location unavailable. Please try again.";
					break;
				case error.TIMEOUT:
					message = "Location request timed out. Please try again.";
					break;
			}
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
		if (!localStorage.getItem("vibe_visitor_id")) {
			localStorage.setItem("vibe_visitor_id", visitorId);
		}

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
