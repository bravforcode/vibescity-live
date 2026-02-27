<script setup>
import { Car, Clock, X } from "lucide-vue-next";
import { watch } from "vue";
import { useTransportLogic } from "../../composables/useTransportLogic";

const props = defineProps({
	isOpen: Boolean,
	shop: Object,
	userLocation: Array,
});

const emit = defineEmits(["close", "open-app"]);

const { estimates, isLoading, error, fetchRideEstimates } = useTransportLogic();

// Fetch when modal opens or shop changes
watch(
	() => props.shop,
	(newShop) => {
		if (newShop && props.isOpen && props.userLocation) {
			fetchRideEstimates(newShop, props.userLocation);
		}
	},
	{ immediate: true },
);

// Also watch isOpen if shop was already set
watch(
	() => props.isOpen,
	(isOpen) => {
		if (isOpen && props.shop && props.userLocation) {
			fetchRideEstimates(props.shop, props.userLocation);
		}
	},
);

const handleRideSelect = (provider) => {
	// In a real app, this would deep link to the specific provider
	emit("open-app", provider.name.toLowerCase());
};
</script>

<template>
  <Transition name="modal-fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        @click="$emit('close')"
      ></div>

      <!-- Modal Card -->
      <div
        class="relative w-full sm:max-w-md bg-zinc-900/90 border-t sm:border border-white/10 sm:rounded-2xl p-6 shadow-2xl backdrop-blur-xl animate-slide-up sm:animate-scale-in"
      >
        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h3 class="text-xl font-black text-white italic tracking-wide">
              RIDE VIBES
            </h3>
            <p class="text-sm text-zinc-400">
              To: <span class="text-neon-blue">{{ shop?.name }}</span>
            </p>
          </div>
          <button
            @click="$emit('close')"
            class="p-2 bg-white/5 rounded-full hover:bg-white/10 text-white transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Content -->
        <div
          v-if="isLoading"
          class="flex flex-col items-center justify-center py-8 space-y-4"
        >
          <div
            class="w-10 h-10 border-4 border-neon-blue border-t-transparent rounded-full animate-spin"
          ></div>
          <p
            class="text-zinc-500 text-xs uppercase tracking-widest animate-pulse"
          >
            Finding drivers…
          </p>
        </div>

        <div v-else-if="error" class="py-8 text-center">
          <p class="text-red-400">{{ error }}</p>
          <button
            @click="fetchRideEstimates(shop, userLocation)"
            class="mt-4 px-4 py-2 bg-zinc-800 rounded-lg text-white"
          >
            Retry
          </button>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="ride in estimates"
            :key="ride.name"
            @click="handleRideSelect(ride)"
            class="group relative flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-neon-purple/50 transition cursor-pointer active:scale-[0.98]"
          >
            <!-- Left: Icon & Name -->
            <div class="flex items-center gap-4">
              <div
                class="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center border border-white/10"
              >
                <Car
                  class="w-5 h-5 text-zinc-400 group-hover:text-neon-blue transition-colors"
                />
              </div>
              <div>
                <h4 class="font-bold text-white">{{ ride.name }}</h4>
                <!-- Mock Service Type -->
                <span
                  class="text-[10px] uppercase tracking-wider text-zinc-500"
                  >{{ ride.service }}</span
                >
              </div>
            </div>

            <!-- Right: Price & ETA -->
            <div class="text-right">
              <div
                class="text-lg font-black text-white group-hover:text-neon-pink transition-colors"
              >
                {{ ride.price }}
                <span class="text-xs font-normal text-zinc-500">{{
                  ride.currency
                }}</span>
              </div>
              <div
                class="flex items-center justify-end gap-1 text-[10px] text-zinc-400"
              >
                <Clock class="w-3 h-3" />
                {{ ride.eta_mins }} mins
              </div>
            </div>

            <!-- Hover Glow -->
            <div
              class="absolute inset-0 rounded-xl bg-gradient-to-r from-neon-blue/0 via-neon-purple/0 to-neon-pink/0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none"
            ></div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-6 pt-4 border-t border-white/5 flex justify-center">
          <p class="text-[10px] text-zinc-600">
            Prices are estimates. Usage subject to provider terms.
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.animate-slide-up {
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.animate-scale-in {
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
