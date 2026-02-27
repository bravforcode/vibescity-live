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
      <!-- Header -->
      <div class="p-6 pb-2 shrink-0 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-black text-white tracking-tight">
            Promote Your Vibe
          </h2>
          <p class="text-sm text-gray-400">
            Boost your shop visibility instantly
          </p>
        </div>
        <button
          @click="emit('close')"
          class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          ✕
        </button>
      </div>

      <!-- Form Scrolling Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- 1. Shop Info -->
        <div class="space-y-4">
          <h3
            class="text-sm font-black text-white/60 uppercase tracking-widest"
          >
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
          </select>
        </div>

        <!-- 2. Location (Mini Map Mock) -->
        <div class="space-y-4">
          <h3
            class="text-sm font-black text-white/60 uppercase tracking-widest"
          >
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

        <!-- 3. Package Selection -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3
              class="text-sm font-black text-white/60 uppercase tracking-widest"
            >
              3. Select Package
            </h3>
            <span class="text-lg font-black text-green-400"
              >฿{{ totalPrice.toLocaleString() }}</span
            >
          </div>

          <div class="grid grid-cols-1 gap-3">
            <!-- Standard Pin -->
            <div
              @click="form.package = 'pin_map'"
              :class="[
                'p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between',
                form.package === 'pin_map'
                  ? 'bg-blue-600/20 border-blue-500'
                  : 'bg-white/5 border-white/10',
              ]"
            >
              <div>
                <div class="font-bold text-white flex items-center gap-2">
                  📍 Standard Pin
                  <span class="text-[10px] bg-white/20 px-1.5 rounded"
                    >Popular</span
                  >
                </div>
                <div class="text-xs text-gray-400 mt-1">
                  Show on map permanently
                </div>
              </div>
              <div class="text-sm font-black text-white">฿150/Day</div>
            </div>

            <!-- Scroll Boost -->
            <div
              @click="form.package = 'scroll_boost'"
              :class="[
                'p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between',
                form.package === 'scroll_boost'
                  ? 'bg-purple-600/20 border-purple-500'
                  : 'bg-white/5 border-white/10',
              ]"
            >
              <div>
                <div class="font-bold text-white flex items-center gap-2">
                  🚀 Scroll Boost
                </div>
                <div class="text-xs text-gray-400 mt-1">
                  Top of feed for 1 hour
                </div>
              </div>
              <div class="text-sm font-black text-white">฿1,500/Hr</div>
            </div>

            <!-- Giant Event -->
            <div
              @click="form.package = 'giant_event'"
              :class="[
                'p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between',
                form.package === 'giant_event'
                  ? 'bg-pink-600/20 border-pink-500'
                  : 'bg-white/5 border-white/10',
              ]"
            >
              <div>
                <div class="font-bold text-white flex items-center gap-2">
                  🔥 Giant Event
                </div>
                <div class="text-xs text-gray-400 mt-1">
                  Massive glowing pin + drawer
                </div>
              </div>
              <div class="text-sm font-black text-white">฿3,000/Day</div>
            </div>
          </div>
        </div>

        <!-- 4. Payment & Upload -->
        <div class="space-y-4">
          <h3
            class="text-sm font-black text-white/60 uppercase tracking-widest"
          >
            4. Payment
          </h3>
          <div
            class="bg-white p-4 rounded-xl flex flex-col items-center justify-center"
          >
            <img
              src="https://promptpay.io/0812345678/1500.png"
              class="w-32 h-32 opacity-50 grayscale"
            />
            <p class="text-black text-xs font-bold mt-2">Scan PromptPay</p>
          </div>

          <input
            type="file"
            ref="slipInput"
            class="hidden"
            @change="handleSlipUpload"
          />
          <button
            @click="$refs.slipInput.click()"
            class="w-full py-3 rounded-xl border-dashed border-2 border-white/20 text-white/50 hover:text-white hover:border-white/50 transition-all flex items-center justify-center gap-2"
          >
            <Upload class="w-4 h-4" />
            {{ slipFile ? slipFile.name : "Upload Payment Slip" }}
          </button>
        </div>
      </div>

      <!-- Footer Action -->
      <div class="p-6 pt-2 border-t border-white/10 bg-zinc-900/95">
        <button
          @click="submitForm"
          :disabled="isSubmitting"
          class="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black text-lg shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
        >
          {{ isSubmitting ? "Submitting..." : "Confirm & Promote" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { MapPin, Upload } from "lucide-vue-next";
import { supabase } from "@/lib/supabase";

const props = defineProps({ isOpen: Boolean });
const emit = defineEmits(["close"]);

const form = ref({
  name: "",
  category: "",
  lat: null,
  lng: null,
  package: "pin_map",
});

const slipFile = ref(null);
const isSubmitting = ref(false);

const totalPrice = computed(() => {
  switch (form.value.package) {
    case "pin_map":
      return 150;
    case "scroll_boost":
      return 1500;
    case "giant_event":
      return 3000;
    default:
      return 0;
  }
});

const getCurrentLocation = () => {
  navigator.geolocation.getCurrentPosition((pos) => {
    form.value.lat = pos.coords.latitude;
    form.value.lng = pos.coords.longitude;
  });
};

const handleSlipUpload = (e) => {
  slipFile.value = e.target.files[0];
};

const submitForm = async () => {
  if (!form.value.name || !form.value.lat || !slipFile.value) {
    alert("Please fill all fields and upload slip");
    return;
  }

  isSubmitting.value = true;

  try {
    // 1. Upload Slip to Sensitive Bucket
    const fileName = `${Date.now()}_${slipFile.value.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("sensitive-uploads")
      .upload(fileName, slipFile.value);

    if (uploadError) throw uploadError;

    // 2. Insert Record
    const { error: dbError } = await supabase
      .from("merchant_promotions")
      .insert({
        shop_name: form.value.name,
        latitude: form.value.lat,
        longitude: form.value.lng,
        package_type: form.value.package,
        price_total: totalPrice.value,
        payment_slip_url: uploadData.path,
        status: "pending",
      });

    if (dbError) throw dbError;

    alert("Submission Successful! We will review shortly.");
    emit("close");
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    isSubmitting.value = false;
  }
};
</script>
