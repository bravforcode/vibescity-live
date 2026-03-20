<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
  >
    <div
      class="bg-gray-900 border border-cyan-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative"
    >
      <!-- Header -->
      <div
        class="p-4 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-cyan-900/50 to-blue-900/50"
      >
        <div class="flex items-center gap-2">
          <component :is="Edit3" class="w-5 h-5 text-cyan-400" />
          <h2 class="text-lg font-bold text-white">{{ $t("auto.k_b76526ba") }}</h2>
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
          class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-3"
        >
          <div class="text-2xl">📝</div>
          <div>
            <div class="text-blue-400 font-bold text-sm">{{ $t("auto.k_b295dae9") }}</div>
            <div class="text-blue-200/70 text-xs"> {{ $t("auto.k_74840489") }} </div>
          </div>
        </div>

        <!-- Form -->
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1"
              >{{ $t("auto.k_48f9a6cf") }}</label
            >
            <input :aria-label="$t('a11y.input_field')"
              v-model="form.name"
              type="text"
              class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-cyan-500 focus:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 transition"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1"
                >Category</label
              >
              <select
                v-model="form.category"
                class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 transition"
              >
                <option value="Cafe">Cafe</option>
                <option value="Restaurant">Restaurant</option>
                <option value="Bar">{{ $t("auto.k_96adec58") }}</option>
                <option value="Nightclub">Nightclub</option>
                <option value="Street Food">{{ $t("auto.k_bf917a6a") }}</option>
                <option value="Attraction">Attraction</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1"
                >Province</label
              >
              <input :aria-label="$t('a11y.input_field')"
                v-model="form.province"
                type="text"
                class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-cyan-500 focus:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 transition"
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
                class="text-cyan-400 hover:text-cyan-300 text-xs font-bold flex items-center gap-1"
              >
                <component :is="Crosshair" class="w-3 h-3" /> Update
              </button>
            </div>
          </div>

          <!-- Image URL (For MVP) -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1"
              >{{ $t("auto.k_dbebc57f") }}</label
            >
            <input :aria-label="$t('a11y.input_field')"
              v-model="form.imageUrl"
              type="text"
              class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-cyan-500 focus:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 transition"
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
        <button :aria-label="$t('a11y.action')"
          @click="submit"
          :disabled="loading"
          class="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold hover:shadow-lg hover:shadow-cyan-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span v-if="loading" class="animate-spin">⏳</span>
          <span v-else>{{ $t("auto.k_fe4ebbd8") }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Crosshair, Edit3, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import { runCommitMutation } from "@/composables/useOptimisticUpdate";
import { supabase } from "../../lib/supabase";

const props = defineProps({
	isOpen: Boolean,
	shop: Object, // The shop being edited
});

const emit = defineEmits(["close", "success"]);
const { notify, notifySuccess, notifyError } = useNotifications();

const form = ref({
	name: "",
	category: "Cafe",
	province: "",
	imageUrl: "",
	lat: null,
	lng: null,
});

const loading = ref(false);

// Initialize form when shop changes or modal opens
watch(
	() => props.shop,
	(newShop) => {
		if (newShop) {
			form.value = {
				name: newShop.name,
				category: newShop.category || "Cafe",
				province: newShop.Province || "", // Note capitalization in shopStore
				imageUrl: newShop.Image_URL1 || "",
				lat: newShop.lat,
				lng: newShop.lng,
			};
		}
	},
	{ immediate: true },
);

const currentLocationText = computed(() => {
	if (form.value.lat && form.value.lng) {
		return `${form.value.lat.toFixed(4)}, ${form.value.lng.toFixed(4)}`;
	}
	return "Original Location";
});

const getCurrentLocation = () => {
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				form.value.lat = position.coords.latitude;
				form.value.lng = position.coords.longitude;
			},
			(_error) => {
				notifyError("Could not get location. Please enable GPS.");
			},
		);
	}
};

const close = () => {
	emit("close");
};

const submit = async () => {
	if (!form.value.name) {
		notifyError("Please enter a name.");
		return;
	}

	loading.value = true;

	try {
		await runCommitMutation({
			commit: async () => {
				const {
					data: { user },
				} = await supabase.auth.getUser();
				const userId = user?.id || "anonymous_edit_mvp";

				const { error } = await supabase.from("user_submissions").insert([
					{
						user_id: userId,
						venue_id: props.shop.id,
						shop_name: form.value.name,
						category: form.value.category,
						latitude: form.value.lat,
						longitude: form.value.lng,
						province: form.value.province,
						image_url: form.value.imageUrl,
						status: "PENDING",
						notes: "User suggested edit",
					},
				]);

				if (error) throw error;
				return true;
			},
			onSuccess: () => {
				notifySuccess("📝 Edit submitted for review! Thanks for helping.");
				emit("success");
				close();
			},
			notify,
			errorMessage: (error) =>
				`Error submitting edit: ${error?.message || "Unknown error"}`,
		});
	} finally {
		loading.value = false;
	}
};
</script>
