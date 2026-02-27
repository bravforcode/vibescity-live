<script setup>
// --- C:\vibecity.live\src\components\ui\SafetyPanel.vue ---
// ✅ Safety Panel - SOS Emergency + Take Me Home

import {
	Ambulance,
	BadgeCheck,
	Building2,
	Flame,
	Home,
	MapPin,
	Navigation,
	Phone,
	Shield,
	X,
} from "lucide-vue-next";
import { computed } from "vue";
import { useHaptics } from "../../composables/useHaptics";
import {
	EMERGENCY_CONTACTS,
	getCallLink,
	getDirectionsLink,
	getNearbyEmergency,
} from "../../services/emergencyService";
import { useUserPreferencesStore } from "../../store/userPreferencesStore";
import { openExternal } from "../../utils/browserUtils";

const props = defineProps({
	userLocation: {
		type: Array,
		default: null,
	},
	isOpen: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["close", "navigate-home"]);

const { successFeedback, selectFeedback } = useHaptics();
const prefsStore = useUserPreferencesStore();

// Computed
const nearbyEmergency = computed(() => {
	if (!props.userLocation) return { hospitals: [], police: [], nearest: [] };
	const [lat, lng] = props.userLocation;
	return getNearbyEmergency(lat, lng, 3);
});

const hasHome = computed(() => prefsStore.hasHomeSet);
const homeName = computed(() => prefsStore.homeName);

// Actions
const callEmergency = (number) => {
	successFeedback();
	window.location.href = getCallLink(number);
};

const navigateToLocation = (lat, lng) => {
	selectFeedback();
	openExternal(getDirectionsLink(lat, lng));
};

const goHome = () => {
	successFeedback();
	const urls = prefsStore.getNavigationUrl(props.userLocation);
	if (urls) {
		// Try Grab first, fallback to Google Maps
		openExternal(urls.googleMaps);
	}
	emit("navigate-home");
};

const close = () => {
	selectFeedback();
	emit("close");
};

// Icon map
const iconMap = {
	Shield,
	BadgeCheck,
	Ambulance,
	Flame,
};
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      @click.self="close"
    >
      <div
        class="w-full max-w-md bg-zinc-900 rounded-t-3xl overflow-hidden shadow-2xl safe-area-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-panel-title"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-white/10"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center"
            >
              <Shield class="w-5 h-5 text-red-400" aria-hidden="true" />
            </div>
            <h2 id="safety-panel-title" class="text-lg font-bold text-white">
              Safety Center
            </h2>
          </div>
          <button
            @click="close"
            class="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95 focus-ring"
            aria-label="Close safety panel"
          >
            <X class="w-5 h-5 text-white" />
          </button>
        </div>

        <!-- Take Me Home -->
        <div class="p-4">
          <button
            v-if="hasHome"
            @click="goHome"
            class="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold flex items-center gap-4 shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-transform"
          >
            <div
              class="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"
            >
              <Home class="w-6 h-6" />
            </div>
            <div class="text-left flex-1">
              <div class="text-lg font-bold">Take Me Home</div>
              <div class="text-sm text-white/70">{{ homeName }}</div>
            </div>
            <Navigation class="w-5 h-5" />
          </button>
          <div
            v-else
            class="p-4 rounded-2xl bg-white/5 border border-dashed border-white/20 text-center text-white/50 text-sm"
          >
            <Home class="w-6 h-6 mx-auto mb-2 opacity-50" />
            Home location not set yet
          </div>
        </div>

        <!-- Emergency Contacts -->
        <div class="px-4 pb-2">
          <h3
            class="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3"
          >
            Emergency Hotlines
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="(contact, key) in EMERGENCY_CONTACTS"
              :key="key"
              @click="callEmergency(contact.number)"
              class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 active:scale-95 transition-transform hover:bg-red-500/20"
            >
              <component
                :is="iconMap[contact.icon] || Phone"
                class="w-5 h-5 text-red-400"
              />
              <div class="text-left">
                <div class="text-white text-sm font-medium">
                  {{ contact.name }}
                </div>
                <div class="text-red-400 font-bold">{{ contact.number }}</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Nearby Hospitals -->
        <div class="px-4 py-3">
          <h3
            class="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3"
          >
            Nearby Hospitals
          </h3>
          <div class="space-y-2">
            <button
              v-for="hospital in nearbyEmergency.hospitals"
              :key="hospital.id"
              @click="navigateToLocation(hospital.lat, hospital.lng)"
              class="w-full p-3 rounded-xl bg-white/5 flex items-center gap-3 active:scale-[0.98] transition-transform hover:bg-white/10"
            >
              <Building2 class="w-5 h-5 text-green-400" />
              <div class="text-left flex-1">
                <div class="text-white text-sm font-medium truncate">
                  {{ hospital.name }}
                </div>
                <div class="text-white/50 text-xs">
                  {{ hospital.distance.toFixed(1) }} km away
                </div>
              </div>
              <MapPin class="w-4 h-4 text-white/40" />
            </button>
          </div>
        </div>

        <!-- Nearby Police -->
        <div class="px-4 pb-6">
          <h3
            class="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3"
          >
            Nearby Police
          </h3>
          <div class="space-y-2">
            <button
              v-for="station in nearbyEmergency.police"
              :key="station.id"
              @click="navigateToLocation(station.lat, station.lng)"
              class="w-full p-3 rounded-xl bg-white/5 flex items-center gap-3 active:scale-[0.98] transition-transform hover:bg-white/10"
            >
              <Shield class="w-5 h-5 text-blue-400" />
              <div class="text-left flex-1">
                <div class="text-white text-sm font-medium truncate">
                  {{ station.name }}
                </div>
                <div class="text-white/50 text-xs">
                  {{ station.distance.toFixed(1) }} km away
                </div>
              </div>
              <MapPin class="w-4 h-4 text-white/40" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.19, 1, 0.22, 1),
    transform 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 20px);
}
</style>
