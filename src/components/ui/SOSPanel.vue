<script setup>
import { Shield, X } from "lucide-vue-next";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close"]);

// Emergency Data (Moved from SidebarDrawer)
const nearbyEmergency = {
  hospitals: [],
  police: [],
  emergencyNumbers: [
    { name: "Emergency", number: "191", icon: "🚨" },
    { name: "Ambulance", number: "1669", icon: "🚑" },
    { name: "Tourist Police", number: "1155", icon: "👮" },
    { name: "Fire", number: "199", icon: "🚒" },
  ],
};

const callEmergency = (number) => {
  window.location.href = `tel:${number}`;
};
</script>

<template>
  <transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isOpen"
      class="absolute inset-0 z-[100] bg-zinc-900/98 backdrop-blur-xl flex flex-col"
    >
      <div
        class="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/50"
      >
        <h2 class="text-lg font-black text-white flex items-center gap-2">
          <Shield class="w-5 h-5 text-red-500 animate-pulse" />
          <span>Emergency Help</span>
        </h2>
        <button
          @click="emit('close')"
          class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-white/20"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <!-- Emergency Numbers -->
        <div class="space-y-2">
          <h3
            class="text-xs font-black text-white/40 uppercase tracking-widest pl-1"
          >
            Emergency Numbers
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="item in nearbyEmergency.emergencyNumbers"
              :key="item.number"
              @click="callEmergency(item.number)"
              class="p-4 rounded-xl bg-gradient-to-br from-red-600/20 to-red-900/20 border border-red-500/30 hover:from-red-600/30 hover:to-red-900/30 transition-all active:scale-95 group relative overflow-hidden"
            >
              <div
                class="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
              ></div>
              <div class="relative z-10">
                <div
                  class="text-2xl mb-2 transform group-hover:scale-110 transition-transform duration-300"
                >
                  {{ item.icon }}
                </div>
                <div class="text-xs font-bold text-white mb-0.5">
                  {{ item.name }}
                </div>
                <div
                  class="text-lg font-black text-red-400 font-mono tracking-wider"
                >
                  {{ item.number }}
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Info Text -->
        <div
          class="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm"
        >
          <p class="text-xs text-blue-100/80 leading-relaxed flex gap-3">
            <span class="text-lg">💡</span>
            <span>
              <strong>Tip:</strong> Tourist Police (1155) speaks multiple
              languages and can help with most situations involving tourists.
            </span>
          </p>
        </div>

        <!-- Bottom Safety Note -->
        <div class="text-center pt-4 opacity-40">
          <p class="text-[10px] text-white">
            Your location is being monitored for safety.
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* Scoped styles kept minimal, relying on utility classes */
</style>
