<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
  >
    <div
      class="bg-gray-900 border border-purple-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative"
    >
      <!-- Header -->
      <div
        class="p-4 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-purple-900/50 to-blue-900/50"
      >
        <div class="flex items-center gap-2">
          <component :is="MapPin" class="w-5 h-5 text-purple-400" />
          <h2 class="text-lg font-bold text-white">Add New Place</h2>
        </div>
        <button
          @click="close"
          class="text-gray-400 hover:text-white transition"
        >
          <component :is="X" class="w-6 h-6" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        <!-- Gamification Banner -->
        <div
          class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center gap-3"
        >
          <div class="text-2xl">💰</div>
          <div>
            <div class="text-yellow-400 font-bold text-sm">Earn Rewards!</div>
            <div class="text-yellow-200/70 text-xs">
              Get +50 Coins & +100 XP for every approved shop.
            </div>
          </div>
        </div>

        <!-- Form -->
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1"
              >Place Name</label
            >
            <input
              v-model="form.name"
              type="text"
              placeholder="e.g. The Rooftop Bar"
              class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1"
                >Category</label
              >
              <select
                v-model="form.category"
                class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none transition"
              >
                <option value="Cafe">Cafe</option>
                <option value="Restaurant">Restaurant</option>
                <option value="Bar">Bar / Pub</option>
                <option value="Nightclub">Nightclub</option>
                <option value="Street Food">Street Food</option>
                <option value="Attraction">Attraction</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1"
                >Province</label
              >
              <input
                v-model="form.province"
                type="text"
                placeholder="e.g. Chiang Mai"
                class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
              />
            </div>
          </div>

          <!-- Location Picker -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1"
              >Location</label
            >
            <div
              class="bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-gray-300 flex justify-between items-center"
            >
              <span>📍 {{ currentLocationText }}</span>
              <button
                @click="getCurrentLocation"
                class="text-purple-400 hover:text-purple-300 text-xs font-bold flex items-center gap-1"
              >
                <component :is="Crosshair" class="w-3 h-3" /> Detect
              </button>
            </div>
            <div class="text-[10px] text-gray-500 mt-1">
              *We use your current GPS location
            </div>
          </div>

          <!-- Image URL (For MVP) -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1"
              >Image URL (Optional)</label
            >
            <input
              v-model="form.imageUrl"
              type="text"
              placeholder="https://..."
              class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
            />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-white/10 bg-black/20 flex gap-3">
        <button
          @click="close"
          class="flex-1 px-4 py-2 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
        >
          Cancel
        </button>
        <button
          @click="submit"
          :disabled="loading"
          class="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold hover:shadow-lg hover:shadow-purple-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span v-if="loading" class="animate-spin">⏳</span>
          <span v-else>Submit Place</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Crosshair, MapPin, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { supabase } from "../../lib/supabase";

const props = defineProps({
  isOpen: Boolean,
});

const emit = defineEmits(["close", "success"]);

const form = ref({
  name: "",
  category: "Cafe",
  province: "",
  imageUrl: "",
  lat: null,
  lng: null,
});

const loading = ref(false);

const currentLocationText = computed(() => {
  if (form.value.lat && form.value.lng) {
    return `${form.value.lat.toFixed(4)}, ${form.value.lng.toFixed(4)}`;
  }
  return "No location selected";
});

const getCurrentLocation = () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.value.lat = position.coords.latitude;
        form.value.lng = position.coords.longitude;
      },
      (_error) => {
        alert("Could not get location. Please enable GPS.");
      },
    );
  }
};

const close = () => {
  emit("close");
};

const submit = async () => {
  if (!form.value.name || !form.value.lat) {
    alert("Please enter a name and select a location.");
    return;
  }

  loading.value = true;

  try {
    // 1. Get User
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id || "anonymous_for_mvp"; // Handle auth later if needed

    // 2. Call API
    // 2. Direct Supabase Insert (Loki Mode Speed)
    // We insert into 'user_submissions' which triggers the 'gamification_logs' via generic logic if we add it later
    // For now, simple insert.
    const { data, error } = await supabase
      .from("user_submissions")
      .insert([
        {
          user_id: userId,
          shop_name: form.value.name,
          category: form.value.category,
          latitude: form.value.lat,
          longitude: form.value.lng,
          province: form.value.province,
          image_url: form.value.imageUrl,
          status: "PENDING",
        },
      ])
      .select();

    if (error) throw error;

    // Fallback/Legacy API call removed for MVP speed
    /*
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"}/ugc/shops`,
      ...
    );
    */

    // const result = await response.json();
    // if (!response.ok) throw new Error(result.detail || "Submission failed");

    alert("🎉 Submitted! You earned +10 Coins pending approval.");
    emit("success");
    close();
  } catch (error) {
    console.error(error);
    alert(`Error submitting shop: ${error.message}`);
  } finally {
    loading.value = false;
  }
};
</script>
