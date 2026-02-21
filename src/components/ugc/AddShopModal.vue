<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    :style="{ zIndex: Z.MODAL }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-shop-title"
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
          <h2 id="add-shop-title" class="text-lg font-bold text-white">{{ t("ugc.add_place") }}</h2>
        </div>
        <button
          @click="close"
          :aria-label="t('ugc.close')"
          class="text-gray-400 hover:text-white transition"
        >
          <component :is="X" class="w-6 h-6" />
        </button>
      </div>

      <!-- Auth Guard: not logged in -->
      <div v-if="!isAuthenticated" class="p-8 text-center">
        <p class="text-gray-300 text-sm">{{ t("ugc.login_required_cta") }}</p>
      </div>

      <!-- Authenticated content -->
      <template v-else>
        <!-- Body -->
        <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- Gamification Banner -->
          <div
            class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center gap-3"
          >
            <div class="text-2xl">💰</div>
            <div>
              <div class="text-yellow-400 font-bold text-sm">{{ t("ugc.earn_rewards") }}</div>
              <div class="text-yellow-200/70 text-xs">
                {{ t("ugc.earn_desc", { coins: REWARD_CONFIG.coins, xp: REWARD_CONFIG.xp }) }}
              </div>
            </div>
          </div>

          <!-- Form -->
          <div class="space-y-3">
            <!-- Name -->
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ t("ugc.place_name") }}</label>
              <input
                v-model="form.name"
                type="text"
                maxlength="200"
                :placeholder="t('ugc.place_name_placeholder')"
                class="w-full bg-black/40 border rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
                :class="touched.name && errors.name ? 'border-red-500' : 'border-white/10'"
                @blur="touch('name')"
              />
              <p v-if="touched.name && errors.name" class="text-red-400 text-xs mt-1">{{ errors.name }}</p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <!-- Category -->
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">{{ t("ugc.category") }}</label>
                <select
                  v-model="form.category"
                  class="w-full bg-black/40 border rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none transition"
                  :class="touched.category && errors.category ? 'border-red-500' : 'border-white/10'"
                  @change="touch('category')"
                  @blur="touch('category')"
                >
                  <option value="" disabled>{{ t("ugc.select_category") }}</option>
                  <option value="Cafe">Cafe</option>
                  <option value="Restaurant">Restaurant</option>
                  <option value="Bar">Bar / Pub</option>
                  <option value="Nightclub">Nightclub</option>
                  <option value="Street Food">Street Food</option>
                  <option value="Attraction">Attraction</option>
                </select>
                <p v-if="touched.category && errors.category" class="text-red-400 text-xs mt-1">{{ errors.category }}</p>
              </div>

              <!-- Province -->
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">{{ t("ugc.province") }}</label>
                <input
                  v-model="form.province"
                  type="text"
                  :placeholder="t('ugc.province_placeholder')"
                  class="w-full bg-black/40 border rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
                  :class="touched.province && errors.province ? 'border-red-500' : 'border-white/10'"
                  @blur="touch('province')"
                />
                <p v-if="touched.province && errors.province" class="text-red-400 text-xs mt-1">{{ errors.province }}</p>
              </div>
            </div>

            <!-- Location Picker -->
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ t("ugc.location") }}</label>
              <div
                class="bg-black/40 border rounded-lg p-3 text-sm text-gray-300 flex justify-between items-center"
                :class="touched.location && errors.location ? 'border-red-500' : 'border-white/10'"
              >
                <span>📍 {{ currentLocationText }}</span>
                <button
                  @click="getCurrentLocation"
                  class="text-purple-400 hover:text-purple-300 text-xs font-bold flex items-center gap-1"
                >
                  <component :is="Crosshair" class="w-3 h-3" /> {{ t("ugc.detect") }}
                </button>
              </div>
              <p v-if="touched.location && errors.location" class="text-red-400 text-xs mt-1">{{ errors.location }}</p>
              <div class="text-[10px] text-gray-500 mt-1">{{ t("ugc.gps_note") }}</div>
            </div>

            <!-- Image URL -->
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ t("ugc.image_url") }}</label>
              <input
                v-model="form.imageUrl"
                type="text"
                placeholder="https://..."
                class="w-full bg-black/40 border rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none transition"
                :class="touched.imageUrl && errors.imageUrl ? 'border-red-500' : 'border-white/10'"
                @blur="touch('imageUrl')"
              />
              <p v-if="touched.imageUrl && errors.imageUrl" class="text-red-400 text-xs mt-1">{{ errors.imageUrl }}</p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-white/10 bg-black/20 flex gap-3">
          <button
            @click="close"
            class="flex-1 px-4 py-2 rounded-lg text-gray-400 hover:bg-white/5 transition text-sm"
          >
            {{ t("ugc.cancel") }}
          </button>
          <button
            @click="submit"
            :disabled="loading || !isFormValid"
            class="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold hover:shadow-lg hover:shadow-purple-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span v-if="loading" class="animate-spin">⏳</span>
            <span v-else>{{ t("ugc.submit") }}</span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { Crosshair, MapPin, X } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNotifications } from "@/composables/useNotifications";
import { Z } from "@/constants/zIndex";
import { useUserStore } from "@/store/userStore";
import { supabase } from "../../lib/supabase";

const { t } = useI18n();
const userStore = useUserStore();
const { isAuthenticated, userId } = storeToRefs(userStore);
const { notifySuccess, notifyError } = useNotifications();

const REWARD_CONFIG = { coins: 50, xp: 100 };

const props = defineProps({
	isOpen: Boolean,
});

const emit = defineEmits(["close", "success"]);

const initialForm = () => ({
	name: "",
	category: "",
	province: "",
	imageUrl: "",
	lat: null,
	lng: null,
});

const initialTouched = () => ({
	name: false,
	category: false,
	province: false,
	location: false,
	imageUrl: false,
});

const form = ref(initialForm());
const loading = ref(false);
const touched = ref(initialTouched());

const touch = (field) => {
	touched.value[field] = true;
};

const HTML_TAG_RE = /<[^>]+>/;
const HTTPS_URL_RE = /^https:\/\/.+/;

const errors = computed(() => {
	const e = {};
	const name = form.value.name.trim();
	if (!name) e.name = t("ugc.error_name_required");
	else if (name.length > 200) e.name = t("ugc.error_name_too_long");
	else if (HTML_TAG_RE.test(name)) e.name = t("ugc.error_name_html");

	if (!form.value.category) e.category = t("ugc.error_category_required");
	if (!form.value.province.trim())
		e.province = t("ugc.error_province_required");

	if (form.value.lat == null || form.value.lng == null) {
		e.location = t("ugc.error_location_required");
	} else if (form.value.lat < -90 || form.value.lat > 90) {
		e.location = t("ugc.error_lat_invalid");
	} else if (form.value.lng < -180 || form.value.lng > 180) {
		e.location = t("ugc.error_lng_invalid");
	}

	if (
		form.value.imageUrl.trim() &&
		!HTTPS_URL_RE.test(form.value.imageUrl.trim())
	) {
		e.imageUrl = t("ugc.error_url_invalid");
	}

	return e;
});

const isFormValid = computed(() => Object.keys(errors.value).length === 0);

const currentLocationText = computed(() => {
	if (form.value.lat != null && form.value.lng != null) {
		return `${form.value.lat.toFixed(4)}, ${form.value.lng.toFixed(4)}`;
	}
	return t("ugc.no_location");
});

const getCurrentLocation = () => {
	touch("location");
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				form.value.lat = position.coords.latitude;
				form.value.lng = position.coords.longitude;
			},
			() => {
				notifyError(t("ugc.error_gps"));
			},
		);
	}
};

const close = () => {
	emit("close");
};

const resetForm = () => {
	form.value = initialForm();
	touched.value = initialTouched();
};

const submit = async () => {
	if (!isAuthenticated.value || !userId.value) return;
	if (!isFormValid.value) return;

	loading.value = true;

	try {
		const { error } = await supabase
			.from("user_submissions")
			.insert([
				{
					user_id: userId.value,
					shop_name: form.value.name.trim(),
					category: form.value.category,
					latitude: form.value.lat,
					longitude: form.value.lng,
					province: form.value.province.trim(),
					image_url: form.value.imageUrl.trim() || null,
					status: "PENDING",
				},
			])
			.select();

		if (error) throw error;

		notifySuccess(
			t("ugc.submit_success", {
				coins: REWARD_CONFIG.coins,
				xp: REWARD_CONFIG.xp,
			}),
		);
		resetForm();
		emit("success");
		close();
	} catch (err) {
		console.error(err);
		notifyError(t("ugc.error_submit", { message: err.message }));
	} finally {
		loading.value = false;
	}
};

// Escape key handler
const handleEscape = (e) => {
	if (e.key === "Escape") close();
};

watch(
	() => props.isOpen,
	(open) => {
		if (open) {
			document.addEventListener("keydown", handleEscape);
		} else {
			document.removeEventListener("keydown", handleEscape);
		}
	},
);

onUnmounted(() => {
	document.removeEventListener("keydown", handleEscape);
});
</script>
