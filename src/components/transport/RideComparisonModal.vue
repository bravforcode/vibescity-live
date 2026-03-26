<script setup>
import { Car, Clock, X, Zap } from "lucide-vue-next";
import { computed, watch } from "vue";
import { useSwipeToDismiss } from "../../composables/useSwipeToDismiss";
import { useTransportLogic } from "../../composables/useTransportLogic";
import { Z } from "../../constants/zIndex";

const props = defineProps({
	isOpen: Boolean,
	shop: Object,
	userLocation: Array,
});

const emit = defineEmits(["close", "open-app"]);

const { estimates, isLoading, error, fetchRideEstimates } = useTransportLogic();

const {
	elementRef: drawerRef,
	pullY,
	isDragging,
} = useSwipeToDismiss({
	threshold: 100,
	onClose: () => emit("close"),
});

// ── Predictive fetch: fire as soon as shop is known, regardless of isOpen ──
watch(
	() => props.shop,
	(newShop) => {
		if (newShop && props.userLocation) {
			fetchRideEstimates(newShop, props.userLocation);
		}
	},
	{ immediate: true },
);

// Re-fetch when location arrives late or modal re-opens with stale data
watch([() => props.isOpen, () => props.userLocation], ([isOpen, loc]) => {
	if (
		isOpen &&
		props.shop &&
		loc &&
		!estimates.value.length &&
		!isLoading.value
	) {
		fetchRideEstimates(props.shop, loc);
	}
});

// ── Smart highlight: cheapest by price, fastest by ETA ──
const cheapestRide = computed(() => {
	if (!estimates.value.length) return null;
	return estimates.value.reduce((best, r) =>
		parseFloat(r.price) < parseFloat(best.price) ? r : best,
	);
});

const fastestRide = computed(() => {
	if (!estimates.value.length) return null;
	return estimates.value.reduce((best, r) =>
		r.eta_mins < best.eta_mins ? r : best,
	);
});

const isBestRide = (ride) =>
	ride.name === cheapestRide.value?.name ||
	ride.name === fastestRide.value?.name;

const bestBadgeLabel = (ride) => {
	const isCheapest = ride.name === cheapestRide.value?.name;
	const isFastest = ride.name === fastestRide.value?.name;
	if (isCheapest && isFastest) return "Best";
	if (isCheapest) return "Cheapest";
	if (isFastest) return "Fastest";
	return "";
};

const handleRideSelect = (provider) => {
	emit("open-app", provider.name.toLowerCase());
};

// ── Gesture-synced backdrop (opacity + blur tracks pullY in real-time) ──
const DISMISS_THRESHOLD = 100;
const backdropOpacity = computed(() =>
	Math.max(0, 0.65 * (1 - Math.max(0, pullY.value) / DISMISS_THRESHOLD)),
);
const backdropBlurPx = computed(() =>
	Math.max(0, 4 * (1 - Math.max(0, pullY.value) / DISMISS_THRESHOLD)),
);

// Allow AppModals to trigger a prefetch via template ref before the modal opens
defineExpose({
	prefetch: (shop, location) => {
		if (shop && location) fetchRideEstimates(shop, location);
	},
});
</script>

<template>
  <!-- Gesture-synced backdrop — no CSS transition while dragging -->
  <Transition name="fade-backdrop">
    <div
      v-if="isOpen"
      class="fixed inset-0 will-change-[backdrop-filter,opacity]"
      :style="{
        zIndex: Z.DRAWER_BACKDROP,
        backgroundColor: `rgba(0,0,0,${backdropOpacity})`,
        backdropFilter: `blur(${backdropBlurPx}px)`,
        transition: isDragging
          ? 'none'
          : 'background-color 0.3s ease, backdrop-filter 0.3s ease',
      }"
      @click="$emit('close')"
      aria-hidden="true"
    ></div>
  </Transition>

  <Transition name="modal-sheet">
    <div
      v-if="isOpen"
      ref="drawerRef"
      class="fixed inset-x-0 bottom-0 flex flex-col rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.6)] overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Ride comparison"
      tabindex="-1"
      :style="{
        zIndex: Z.DRAWER,
        transform: pullY > 0 ? `translate3d(0,${pullY}px,0)` : 'translate3d(0,0,0)',
        transition: isDragging ? 'none' : 'transform 0.45s cubic-bezier(0.19,1,0.22,1)',
        willChange: 'transform',
      }"
    >
      <div class="bg-zinc-900/95 backdrop-blur-xl border-t border-white/10 p-6 pb-safe-offset">
        <!-- Drag handle -->
        <div
          class="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/20"
          aria-hidden="true"
        ></div>

        <!-- Header -->
        <div class="flex justify-between items-start mb-5 mt-2">
          <div>
            <h3 class="text-xl font-black text-white italic tracking-wide">RIDE VIBES</h3>
            <p class="text-sm text-zinc-400 mt-0.5">
              To: <span class="text-blue-400 font-bold">{{ shop?.name }}</span>
            </p>
          </div>
          <button
            @click="$emit('close')"
            class="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Close ride comparison"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Content area: fixed min-height prevents abrupt height jump skeleton→data -->
        <div class="min-h-[200px]">
          <!-- Skeleton loading -->
          <div
            v-if="isLoading"
            class="space-y-3"
            aria-busy="true"
            aria-live="polite"
            aria-label="Loading ride options"
          >
            <div
              v-for="n in 3"
              :key="n"
              class="flex items-center justify-between p-4 rounded-xl bg-white/5 animate-pulse"
            >
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-white/10 flex-shrink-0"></div>
                <div class="space-y-1.5">
                  <div class="h-3.5 w-20 rounded bg-white/10"></div>
                  <div class="h-2.5 w-14 rounded bg-white/5"></div>
                </div>
              </div>
              <div class="space-y-1.5 flex flex-col items-end">
                <div class="h-4 w-16 rounded bg-white/10"></div>
                <div class="h-2.5 w-10 rounded bg-white/5"></div>
              </div>
            </div>
          </div>

          <!-- Error state -->
          <div v-else-if="error" class="py-8 text-center">
            <p class="text-red-400 text-sm">{{ error }}</p>
            <button
              @click="fetchRideEstimates(shop, userLocation)"
              class="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
            >
              Retry
            </button>
          </div>

          <!-- Ride options: staggered entrance via per-item animation-delay -->
          <div v-else class="space-y-3">
            <div
              v-for="(ride, index) in estimates"
              :key="ride.name"
              @click="handleRideSelect(ride)"
              @keydown.enter.prevent="handleRideSelect(ride)"
              @keydown.space.prevent="handleRideSelect(ride)"
              class="ride-option group relative flex items-center justify-between p-4 rounded-xl cursor-pointer active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
              :class="[
                isBestRide(ride)
                  ? 'best-ride-card'
                  : 'bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/15',
              ]"
              :style="{ '--stagger-delay': `${index * 60}ms` }"
              role="button"
              tabindex="0"
              :aria-label="`Book ${ride.name}: ${ride.price} ${ride.currency}, ${ride.eta_mins} minutes`"
            >
              <!-- Best option badge -->
              <div
                v-if="isBestRide(ride)"
                class="absolute -top-2.5 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-[9px] font-black text-white uppercase tracking-wider shadow-lg shadow-purple-500/30"
              >
                <Zap class="w-2.5 h-2.5" aria-hidden="true" />
                {{ bestBadgeLabel(ride) }}
              </div>

              <!-- Left: Icon & Name -->
              <div class="flex items-center gap-4">
                <div
                  class="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center border border-white/10 flex-shrink-0"
                >
                  <Car
                    class="w-5 h-5 text-zinc-300 group-hover:text-blue-400 transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h4 class="font-bold text-white text-sm">{{ ride.name }}</h4>
                  <span class="text-[10px] uppercase tracking-wider text-zinc-500">{{ ride.service }}</span>
                </div>
              </div>

              <!-- Right: Price & ETA -->
              <div class="text-right">
                <div class="text-lg font-black text-white group-hover:text-pink-300 transition-colors leading-none">
                  {{ ride.price
                  }}<span class="text-xs font-normal text-zinc-500 ml-0.5">{{ ride.currency }}</span>
                </div>
                <div class="flex items-center justify-end gap-1 text-[10px] text-zinc-400 mt-1">
                  <Clock class="w-3 h-3" aria-hidden="true" />
                  {{ ride.eta_mins }} mins
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-5 pt-4 border-t border-white/5 flex justify-center">
          <p class="text-[10px] text-zinc-600">
            Prices are estimates. Subject to provider terms.
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* CSS custom property for animated conic-gradient — Houdini @property */
@property --border-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

/* Staggered entrance: each card slides up + fades in from its own delay */
.ride-option {
  opacity: 0;
  transform: translateY(12px);
  animation: ride-enter 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: var(--stagger-delay, 0ms);
}

@keyframes ride-enter {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Best ride: GPU-composited spinning conic-gradient border */
.best-ride-card {
  background:
    linear-gradient(#18181b, #18181b) padding-box,
    conic-gradient(
        from var(--border-angle),
        #ec4899 0%,
        #8b5cf6 33%,
        #3b82f6 66%,
        #ec4899 100%
      )
      border-box;
  border: 2px solid transparent;
  animation: spin-border 3s linear infinite;
}

@keyframes spin-border {
  to {
    --border-angle: 360deg;
  }
}

/* Sheet slides in from bottom */
.modal-sheet-enter-active {
  transition: transform 0.45s cubic-bezier(0.19, 1, 0.22, 1);
}
.modal-sheet-leave-active {
  transition: transform 0.3s cubic-bezier(0.55, 0, 1, 0.45);
}
.modal-sheet-enter-from,
.modal-sheet-leave-to {
  transform: translateY(100%);
}

.fade-backdrop-enter-active,
.fade-backdrop-leave-active {
  transition: opacity 0.3s ease;
}
.fade-backdrop-enter-from,
.fade-backdrop-leave-to {
  opacity: 0;
}

.pb-safe-offset {
  padding-bottom: calc(env(safe-area-inset-bottom, 16px) + 16px);
}

@media (prefers-reduced-motion: reduce) {
  .ride-option {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .best-ride-card {
    animation: none;
  }
  .modal-sheet-enter-active,
  .modal-sheet-leave-active,
  .fade-backdrop-enter-active,
  .fade-backdrop-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
