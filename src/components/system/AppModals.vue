<!-- src/components/system/AppModals.vue -->
<script setup>
import { AlertTriangle, X } from "lucide-vue-next";
import { computed, defineAsyncComponent, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
	normalizeVenueCollection,
	normalizeVenueViewModel,
} from "@/domain/venue/viewModel";
import InstallBanner from "../ui/InstallBanner.vue";
import PortalLayer from "./PortalLayer.vue";

const { t } = useI18n();

const rideModalRef = ref(null);

const handlePrefetchRide = (shop) => {
	if (!shop || !props.userLocation) return;
	const normalized = normalizeVenueViewModel(shop, {
		userLocation: props.userLocation,
	});
	rideModalRef.value?.prefetch?.(normalized, props.userLocation);
};

const MallDrawer = defineAsyncComponent(
	() => import("../modal/MallDrawer.vue"),
);
const ProfileDrawer = defineAsyncComponent(
	() => import("../modal/ProfileDrawer.vue"),
);
const VibeModal = defineAsyncComponent(() => import("../modal/VibeModal.vue"));
const ConfettiEffect = defineAsyncComponent(
	() => import("../ui/ConfettiEffect.vue"),
);
const RideComparisonModal = defineAsyncComponent(
	() => import("../transport/RideComparisonModal.vue"),
);

const props = defineProps({
	selectedShop: Object,
	rideModalShop: Object,
	showMallDrawer: Boolean,
	activeMall: Object,
	mallShops: {
		type: Array,
		default: () => [],
	},
	activeShopId: [Number, String],
	favorites: {
		type: Array,
		default: () => [],
	},
	showProfileDrawer: Boolean,
	isDarkMode: Boolean,
	isDataLoading: Boolean,
	isInitialLoad: {
		type: Boolean,
		default: false,
	},
	errorMessage: String,
	showConfetti: Boolean,
	userLocation: {
		type: Array,
		default: () => [18.7883, 98.9853],
	},
	activeUserCount: {
		type: Number,
		default: 0,
	},
});

const emit = defineEmits([
	"close-vibe-modal",
	"toggle-favorite",
	"close-ride-modal",
	"open-ride-app",
	"close-mall-drawer",
	"select-mall-shop",
	"open-ride-modal",
	"close-profile-drawer",
	"toggle-language",
	"clear-error",
	"retry",
]);

const normalizedSelectedShop = computed(() =>
	props.selectedShop
		? normalizeVenueViewModel(props.selectedShop, {
				userLocation: props.userLocation,
			})
		: null,
);

const normalizedRideShop = computed(() =>
	props.rideModalShop
		? normalizeVenueViewModel(props.rideModalShop, {
				userLocation: props.userLocation,
			})
		: null,
);

const normalizedMallShops = computed(() =>
	normalizeVenueCollection(props.mallShops || [], {
		userLocation: props.userLocation,
	}),
);
</script>

<template>
  <PortalLayer>
    <transition name="modal">
      <div v-if="normalizedSelectedShop">
        <VibeModal
          :shop="normalizedSelectedShop"
          :userLocation="props.userLocation"
          :userCount="props.activeUserCount"
          @close="emit('close-vibe-modal')"
          @toggle-favorite="(id) => emit('toggle-favorite', id)"
        />
      </div>
    </transition>

    <RideComparisonModal
      ref="rideModalRef"
      :isOpen="!!normalizedRideShop"
      :shop="normalizedRideShop"
      :userLocation="props.userLocation"
      @close="emit('close-ride-modal')"
      @open-app="(appName) => emit('open-ride-app', appName)"
    />

    <MallDrawer
      v-if="props.showMallDrawer"
      :is-open="props.showMallDrawer"
      :building="props.activeMall"
      :shops="normalizedMallShops"
      :is-dark-mode="props.isDarkMode"
      :selected-shop-id="props.activeShopId"
      @close="emit('close-mall-drawer')"
      @select-shop="(shop) => emit('select-mall-shop', shop)"
      @open-ride-modal="(shop) => emit('open-ride-modal', shop)"
      @prefetch-ride="handlePrefetchRide"
      @toggle-favorite="(id) => emit('toggle-favorite', id)"
      :favorites="props.favorites"
    />

    <ProfileDrawer
      v-if="props.showProfileDrawer"
      :is-open="props.showProfileDrawer"
      :is-dark-mode="props.isDarkMode"
      @close="emit('close-profile-drawer')"
      @toggle-language="emit('toggle-language')"
    />

    <Transition
      enter-active-class="transition duration-500 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-300 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-105"
    >
      <div
        v-if="props.isInitialLoad"
        role="status"
        aria-live="polite"
        aria-busy="true"
        class="fixed inset-0 z-[6000] flex flex-col items-center justify-center bg-[#09090b]"
      >
        <div class="relative w-24 h-24">
          <div
            class="absolute inset-0 rounded-full border-4 border-white/5"
          ></div>
          <div
            class="absolute inset-0 rounded-full border-4 border-pink-500 border-t-transparent animate-spin"
          ></div>
          <div
            class="absolute inset-4 rounded-full border-4 border-blue-500 border-b-transparent animate-spin-slow"
          ></div>
        </div>
        <h2
          class="mt-8 text-xl font-black text-white tracking-[0.2em] animate-pulse"
        >
          {{ t("app.brand") }}
        </h2>
        <p
          class="mt-2 text-zinc-500 text-xs uppercase tracking-widest font-bold"
        >
          {{ t("app.syncing") }}
        </p>
      </div>
    </Transition>

    <transition name="toast">
      <div
        v-if="props.errorMessage"
        class="fixed top-20 left-1/2 -translate-x-1/2 z-[6100] w-[90%] max-w-md pt-safe"
      >
        <div class="toast-notification flex items-center gap-4">
          <div
            class="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <AlertTriangle class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1">
            <h4 class="text-white font-bold text-sm">
              {{ t("app.system_alert") }}
            </h4>
            <p class="text-white/60 text-xs">{{ props.errorMessage }}</p>
          </div>
          <button
            @click="emit('clear-error')"
            :aria-label="t('common.close')"
            class="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center text-white/40"
          >
            <X class="w-4 h-4" aria-hidden="true" />
          </button>
          <!-- Auto-dismiss progress bar -->
          <div class="toast-progress" style="--toast-duration: 6s"></div>
        </div>
      </div>
    </transition>

    <ConfettiEffect v-if="props.showConfetti" />
    <InstallBanner />
  </PortalLayer>
</template>

<style scoped>
.animate-spin-slow {
  animation: spin 3s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active {
  transition: opacity 0.25s ease-out;
}
.modal-fade-leave-active {
  transition: opacity 0.2s ease-in;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-scale-enter-active {
  transition:
    opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-scale-leave-active {
  transition:
    opacity 0.2s ease-in,
    transform 0.2s ease-in;
}
.modal-scale-enter-from {
  opacity: 0;
  transform: scale(0.85) translateY(20px);
}
.modal-scale-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(10px);
}

@media (prefers-reduced-motion: reduce) {
  .animate-spin-slow,
  .animate-pulse {
    animation: none !important;
  }

  .fade-enter-active,
  .fade-leave-active,
  .modal-fade-enter-active,
  .modal-fade-leave-active,
  .modal-scale-enter-active,
  .modal-scale-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
